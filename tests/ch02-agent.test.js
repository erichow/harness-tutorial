/**
 * 第 2 章测试 — Agent 最小循环（第 4 章适配版）
 *
 * 验证 Ch 2 的概念还活着，但用第 4 章的 ToolRegistry。
 * 工具函数使用解构参数（和 Tool.run(args) 传入整个 args 对象一致）。
 */

import { describe, it, expect } from 'vitest';
import { run } from '../src/harness/agent.js';
import { ProviderResponse } from '../src/harness/providers/base.js';
import { MockProvider } from '../src/harness/providers/mock.js';
import { Tool, ToolRegistry } from '../src/harness/tools/index.js';

function _makeTool(name, fn, schema = { type: 'object', properties: {}, required: [] }) {
  return new Tool({ name, description: name, inputSchema: schema, run: fn });
}

// ---- Happy path: calculator ----

describe('Chapter 2 — happy path', () => {
  it('calculator 两个回合', () => {
    const mock = new MockProvider([
      new ProviderResponse({
        tool_name: 'calc', tool_args: { expression: '2 + 2' }, tool_call_id: 'call-1',
      }),
      new ProviderResponse({ text: '2 + 2 is 4.' }),
    ]);

    const registry = new ToolRegistry([
      _makeTool('calc', ({ expression }) => String(eval(expression)), {
        type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'],
      }),
    ]);

    expect(run(mock, registry, 'What is 2 + 2?')).toBe('2 + 2 is 4.');
  });

  it('纯文本响应（无工具调用）', () => {
    const mock = new MockProvider([new ProviderResponse({ text: 'Hello, world!' })]);
    expect(run(mock, new ToolRegistry(), 'Hi')).toBe('Hello, world!');
  });
});

// ---- Break 1: unknown tool — registry 不崩 ----

describe('Break 1 — unknown tool', () => {
  it('模型叫了不存在的工具 → is_error，模型自己恢复', () => {
    const mock = new MockProvider([
      new ProviderResponse({ tool_name: 'nosuchtool', tool_args: {}, tool_call_id: 'call-1' }),
      new ProviderResponse({ text: 'I give up.' }),
    ]);
    expect(run(mock, new ToolRegistry(), 'Do something')).toBe('I give up.');
  });
});

// ---- Break 2: schema mismatch ----

describe('Break 2 — schema mismatch', () => {
  it('参数 key 错了（expr vs expression）→ 静默传错参', () => {
    const mock = new MockProvider([
      new ProviderResponse({ tool_name: 'calc', tool_args: { expr: '2+2' }, tool_call_id: 'call-1' }),
      new ProviderResponse({ text: 'done' }),
    ]);
    const registry = new ToolRegistry([
      _makeTool('calc', ({ expression }) => String(expression)),
    ]);
    expect(run(mock, registry, 'What is 2+2?')).toBe('done');
  });
});

// ---- Break 3: tool throws — registry 不崩 ----

describe('Break 3 — tool throws', () => {
  it('工具抛异常 → is_error 返回，模型可恢复', () => {
    const mock = new MockProvider([
      new ProviderResponse({ tool_name: 'crash', tool_args: {}, tool_call_id: 'call-1' }),
      new ProviderResponse({ text: 'I handled the error.' }),
    ]);
    const registry = new ToolRegistry([
      _makeTool('crash', () => { throw new Error('BOOM'); }),
    ]);
    expect(run(mock, registry, 'crash')).toBe('I handled the error.');
  });
});

// ---- Break 4: 永远停不下来 ----

describe('Break 4 — 永远停不下来', () => {
  it('超过 MAX_ITERATIONS → throw', () => {
    const calls = Array.from({ length: 25 }, (_, i) =>
      new ProviderResponse({ tool_name: 'echo', tool_args: { msg: String(i) }, tool_call_id: `call-${i}` })
    );
    const registry = new ToolRegistry([
      _makeTool('echo', ({ msg }) => msg, {
        type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'],
      }),
    ]);
    expect(() => run(new MockProvider(calls), registry, 'loop forever')).toThrow(/did not finish/);
  });
});

// ---- Break 5: 工具返回大量内容 ----

describe('Break 5 — 工具返回大量内容', () => {
  it('工具返回 20KB 字符串 → loop 正常运行', () => {
    const bigText = 'X'.repeat(20_000);
    const mock = new MockProvider([
      new ProviderResponse({ tool_name: 'read_file', tool_args: { path: 'big.json' }, tool_call_id: 'call-1' }),
      new ProviderResponse({ text: 'done' }),
    ]);
    const registry = new ToolRegistry([
      _makeTool('read_file', () => bigText),
    ]);
    expect(run(mock, registry, 'Read the file')).toBe('done');
  });
});
