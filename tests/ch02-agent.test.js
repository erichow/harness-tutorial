/**
 * 第 2 章测试 — Agent 最小循环（第 3 章升级适配版）
 *
 * 仍需独立跑以验证 Ch 2 的概念活着。
 * 但 mock 响应从裸 dict 升级为 ProviderResponse，
 * Break 1 & 3 的行为从 crash 变成优雅恢复（第 3 章的 try/except）。
 */

import { describe, it, expect } from 'vitest';
import { run } from '../src/harness/agent.js';
import { ProviderResponse } from '../src/harness/providers/base.js';
import { MockProvider } from '../src/harness/providers/mock.js';

// ---- Happy path: calculator ----

describe('Chapter 2 — happy path', () => {
  it('calculator 两个回合', () => {
    const mock = new MockProvider([
      new ProviderResponse({
        tool_name: 'calc',
        tool_args: { expression: '2 + 2' },
        tool_call_id: 'call-1',
      }),
      new ProviderResponse({ text: '2 + 2 is 4.' }),
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
      new ProviderResponse({ text: 'Hello, world!' }),
    ]);

    const result = run(mock, {}, [], 'Hi');
    expect(result).toBe('Hello, world!');
  });
});

// ---- Break 1: unknown tool — 第 3 章修复：不再崩溃，返回 is_error ----

describe('Break 1 — unknown tool', () => {
  it('模型叫了不存在的工具 → 返回 is_error 让模型恢复（不崩）', () => {
    const mock = new MockProvider([
      new ProviderResponse({ tool_name: 'nosuchtool', tool_args: {}, tool_call_id: 'call-1' }),
      new ProviderResponse({ text: 'I give up.' }),
    ]);

    const result = run(mock, {}, [], 'Do something');
    expect(result).toBe('I give up.');
  });
});

// ---- Break 2: schema mismatch ----

describe('Break 2 — schema mismatch', () => {
  it('参数 key 错了（expr vs expression）→ 静默传错参', () => {
    const mock = new MockProvider([
      new ProviderResponse({
        tool_name: 'calc',
        tool_args: { expr: '2+2' },            // ← 应该是 expression
        tool_call_id: 'call-1',
      }),
      new ProviderResponse({ text: 'done' }),
    ]);

    function calc(expression) {
      // expression 是 undefined（因为 mock 传的是 expr）
      return expression;                       // → 'undefined'
    }

    const result = run(mock, { calc }, [], 'What is 2+2?');
    expect(result).toBe('done');
  });
});

// ---- Break 3: tool throws — 第 3 章修复：不再崩溃，返回 is_error ----

describe('Break 3 — tool throws', () => {
  it('工具抛异常 → 捕获并返回 is_error，模型可恢复（不崩）', () => {
    function crash() { throw new Error('BOOM'); }

    const mock = new MockProvider([
      new ProviderResponse({ tool_name: 'crash', tool_args: {}, tool_call_id: 'call-1' }),
      new ProviderResponse({ text: 'I handled the error.' }),
    ]);

    const result = run(mock, { crash }, [], 'crash');
    expect(result).toBe('I handled the error.');
  });
});

// ---- Break 4: 永远停不下来 ----

describe('Break 4 — 永远停不下来', () => {
  it('超过 MAX_ITERATIONS → throw，transcript 丢掉', () => {
    const calls = Array.from({ length: 25 }, (_, i) =>
      new ProviderResponse({ tool_name: 'echo', tool_args: { msg: String(i) }, tool_call_id: `call-${i}` })
    );

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
      new ProviderResponse({
        tool_name: 'read_file',
        tool_args: { path: 'big.json' },
        tool_call_id: 'call-1',
      }),
      new ProviderResponse({ text: 'done' }),
    ]);

    function read_file(_path) { return bigText; }

    const result = run(mock, { read_file }, [], 'Read the file');
    expect(result).toBe('done');
  });
});
