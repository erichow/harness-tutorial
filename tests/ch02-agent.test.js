/**
 * 第 2 章测试 — Agent 最小循环
 *
 * 覆盖 happy path + 5 个 break
 */

import { describe, it, expect } from 'vitest';
import { run } from '../src/harness/agent.js';
import { MockProvider } from '../src/harness/providers/mock.js';

// ---- Happy path: calculator ----

describe('Chapter 2 — happy path', () => {
  it('calculator 两个回合', () => {
    const mock = new MockProvider([
      {
        kind: 'tool_call',
        tool_name: 'calc',
        tool_args: { expression: '2 + 2' },
        tool_call_id: 'call-1',
      },
      { kind: 'text', text: '2 + 2 is 4.' },
    ]);

    const toolSchemas = [{
      name: 'calc',
      description: 'Evaluate an expression.',
      input_schema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] },
    }];

    function calc(expression) { return String(eval(expression)); }

    const result = run(mock, { calc }, toolSchemas, 'What is 2 + 2?');
    expect(result).toBe('2 + 2 is 4.');
  });

  it('纯文本响应（无工具调用）', () => {
    const mock = new MockProvider([
      { kind: 'text', text: 'Hello, world!' },
    ]);

    const result = run(mock, {}, [], 'Hi');
    expect(result).toBe('Hello, world!');
  });
});

// ---- Break 1: unknown tool ----

describe('Break 1 — unknown tool', () => {
  it('模型叫了不存在的工具 → throw', () => {
    const mock = new MockProvider([
      { kind: 'tool_call', tool_name: 'calculator', tool_args: { expr: '2+2' }, tool_call_id: 'call-1' },
    ]);

    expect(() => run(mock, {}, [], 'What is 2+2?')).toThrow(/unknown tool/);
  });
});

// ---- Break 2: schema mismatch ----

describe('Break 2 — schema mismatch', () => {
  it('参数 key 错了（expr vs expression）→ 静默传错参', () => {
    const mock = new MockProvider([
      {
        kind: 'tool_call',
        tool_name: 'calc',
        tool_args: { expr: '2+2' },           // ← 应该是 expression
        tool_call_id: 'call-1',
      },
      { kind: 'text', text: 'done' },
    ]);

    function calc(expression) {
      // expression 是 undefined（因为 mock 传的是 expr）
      return expression;                       // → 'undefined'
    }

    // 不抛异常——因为 tool_fn 被调了，但参数是错的
    // 这是朴素 loop 的 bug：不校验参数名
    const result = run(mock, { calc }, [], 'What is 2+2?');
    expect(result).toBe('done');
  });
});

// ---- Break 3: tool throws ----

describe('Break 3 — tool throws', () => {
  it('工具抛异常 → 整个 loop 死', () => {
    const mock = new MockProvider([
      {
        kind: 'tool_call',
        tool_name: 'crash',
        tool_args: {},
        tool_call_id: 'call-1',
      },
    ]);

    function crash() { throw new Error('BOOM'); }

    expect(() => run(mock, { crash }, [], 'crash')).toThrow('BOOM');
  });
});

// ---- Break 4: 永远停不下来 ----

describe('Break 4 — 永远停不下来', () => {
  it('超过 MAX_ITERATIONS → throw，transcript 丢掉', () => {
    // 造 25 个 tool_call（超过 MAX_ITERATIONS=20）
    const calls = Array.from({ length: 25 }, (_, i) => ({
      kind: 'tool_call',
      tool_name: 'echo',
      tool_args: { msg: String(i) },
      tool_call_id: `call-${i}`,
    }));

    const mock = new MockProvider(calls);

    function echo(msg) { return msg; }

    expect(() => run(mock, { echo }, [], 'loop forever')).toThrow(/did not finish/);
  });
});

// ---- Break 5: 工具返回大量内容 ----

describe('Break 5 — 工具返回大量内容', () => {
  it('工具返回 20KB 字符串 → loop 当没事发生', () => {
    const bigText = 'X'.repeat(20_000);

    const mock = new MockProvider([
      {
        kind: 'tool_call',
        tool_name: 'read_file',
        tool_args: { path: 'big.json' },
        tool_call_id: 'call-1',
      },
      { kind: 'text', text: 'done' },
    ]);

    function read_file(_path) { return bigText; }

    // 不抛异常——但 transcript 里塞进了 20KB
    // 下一回合会把所有 transcript 发回 provider，超出窗口
    // loop 对此毫无觉察
    const result = run(mock, { read_file }, [], 'Read the file');
    expect(result).toBe('done');
  });
});
