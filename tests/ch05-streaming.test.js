/**
 * 第 5 章测试 — 流式、中断与错误处理
 *
 * 覆盖 StreamEvent、accumulate、astream()、arun() callback、
 * 多 tool_call、RetryPolicy、FallbackProvider。
 */

import { describe, it, expect } from 'vitest';
import {
  TextDelta, ReasoningDelta, ToolCallStart, ToolCallDelta, Completed,
} from '../src/harness/providers/events.js';
import { ProviderResponse, ToolCallRef } from '../src/harness/providers/base.js';
import { accumulate } from '../src/harness/providers/accumulate.js';
import { MockProvider } from '../src/harness/providers/mock.js';
import { RetryPolicy, RetryBudgetExceeded } from '../src/harness/providers/retry.js';
import { FallbackProvider } from '../src/harness/providers/fallback.js';
import { arun, run } from '../src/harness/agent.js';
import { Tool, ToolRegistry, calc } from '../src/harness/tools/index.js';

// ── §5.2: StreamEvent 类型 ──────────────────────────────

describe('StreamEvent 类型', () => {
  it('TextDelta', () => {
    const e = TextDelta('hello');
    expect(e.kind).toBe('text_delta');
    expect(e.text).toBe('hello');
  });

  it('ReasoningDelta', () => {
    const e = ReasoningDelta('thinking...');
    expect(e.kind).toBe('reasoning_delta');
    expect(e.text).toBe('thinking...');
  });

  it('ToolCallStart', () => {
    const e = ToolCallStart('call-1', 'calc');
    expect(e.kind).toBe('tool_call_start');
    expect(e.id).toBe('call-1');
    expect(e.name).toBe('calc');
  });

  it('ToolCallDelta', () => {
    const e = ToolCallDelta('call-1', '{"expr');
    expect(e.kind).toBe('tool_call_delta');
    expect(e.args_fragment).toBe('{"expr');
  });

  it('Completed', () => {
    const e = Completed({ inputTokens: 100, outputTokens: 50 });
    expect(e.kind).toBe('completed');
    expect(e.input_tokens).toBe(100);
    expect(e.output_tokens).toBe(50);
  });

  it('所有 event 都是 frozen', () => {
    expect(() => { TextDelta('x').text = 'y'; }).toThrow();
    expect(() => { Completed({ inputTokens: 1 }).input_tokens = 2; }).toThrow();
  });
});

// ── §5.2: accumulate ────────────────────────────────────

describe('accumulate', () => {
  it('accumulate 纯文本流', async () => {
    async function* stream() {
      yield TextDelta('Hello');
      yield TextDelta(' ');
      yield TextDelta('world');
      yield Completed({ inputTokens: 10, outputTokens: 3 });
    }
    const resp = await accumulate(stream());
    expect(resp.is_final).toBe(true);
    expect(resp.text).toBe('Hello world');
    expect(resp.output_tokens).toBe(3);
  });

  it('accumulate tool_call 流', async () => {
    async function* stream() {
      yield ToolCallStart('call-1', 'calc');
      yield ToolCallDelta('call-1', '{"expr');
      yield ToolCallDelta('call-1', 'ession"');
      yield ToolCallDelta('call-1', ':"2+2"}');
      yield Completed({ inputTokens: 5, outputTokens: 10 });
    }
    const resp = await accumulate(stream());
    expect(resp.is_tool_call).toBe(true);
    expect(resp.tool_calls).toHaveLength(1);
    expect(resp.tool_calls[0].name).toBe('calc');
    expect(resp.tool_calls[0].args).toEqual({ expression: '2+2' });
  });

  it('accumulate reasoning + text', async () => {
    async function* stream() {
      yield ReasoningDelta('let me think');
      yield TextDelta('answer');
      yield Completed({ inputTokens: 5, outputTokens: 1 });
    }
    const resp = await accumulate(stream());
    expect(resp.reasoning_text).toBe('let me think');
    expect(resp.text).toBe('answer');
  });

  it('partial JSON → _raw 兜底', async () => {
    async function* stream() {
      yield ToolCallStart('call-1', 'calc');
      yield ToolCallDelta('call-1', '{broken');
      yield Completed({ inputTokens: 0, outputTokens: 0 });
    }
    const resp = await accumulate(stream());
    expect(resp.tool_calls[0].args).toEqual({ _raw: '{broken' });
  });
});

// ── §5.3: 多 tool_call ──────────────────────────────────

describe('多 tool_call', () => {
  it('ProviderResponse 支持 tool_calls 元组', () => {
    const resp = new ProviderResponse({
      toolCalls: [
        new ToolCallRef('call-1', 'calc', { expression: '2+2' }),
        new ToolCallRef('call-2', 'read_file', { path: '/tmp/x' }),
      ],
    });
    expect(resp.is_tool_call).toBe(true);
    expect(resp.is_final).toBe(false);
    expect(resp.tool_calls).toHaveLength(2);
  });

  it('向后兼容：单数 tool_name 仍可用', () => {
    const resp = new ProviderResponse({
      tool_name: 'calc',
      tool_args: { expression: '2+2' },
      tool_call_id: 'call-1',
    });
    expect(resp.is_tool_call).toBe(true);
    expect(resp.tool_name).toBe('calc');
    expect(resp.tool_args).toEqual({ expression: '2+2' });
    expect(resp.tool_calls).toHaveLength(1);
  });

  it('向后兼容：is_final 当 text 存在且无 tool_calls', () => {
    const resp = new ProviderResponse({ text: 'answer' });
    expect(resp.is_final).toBe(true);
    expect(resp.is_tool_call).toBe(false);
  });

  it('arun 迭代所有 tool_calls', async () => {
    const reg = new ToolRegistry([calc]);
    const mock = new MockProvider([
      new ProviderResponse({
        toolCalls: [
          new ToolCallRef('call-1', 'calc', { expression: '2 + 2' }),
          new ToolCallRef('call-2', 'calc', { expression: '3 + 3' }),
        ],
      }),
      new ProviderResponse({ text: 'done' }),
    ]);
    const result = await arun(mock, reg, 'calc both');
    expect(result).toBe('done');
  });
});

// ── §5.3: MockProvider.astream ──────────────────────────

describe('MockProvider.astream', () => {
  it('文本响应展开为 TextDelta + Completed', async () => {
    const mock = new MockProvider([
      new ProviderResponse({ text: 'Hello world' }),
    ]);
    const events = [];
    for await (const e of mock.astream({}, [])) {
      events.push(e);
    }
    const kinds = events.map(e => e.kind);
    expect(kinds).toContain('text_delta');
    expect(kinds).toContain('completed');
    expect(events.find(e => e.kind === 'text_delta').text).toBe('Hello');
  });

  it('工具调用展开为 ToolCallStart + ToolCallDelta + Completed', async () => {
    const mock = new MockProvider([
      new ProviderResponse({
        toolCalls: [new ToolCallRef('call-1', 'calc', { expression: '2+2' })],
      }),
    ]);
    const events = [];
    for await (const e of mock.astream({}, [])) {
      events.push(e);
    }
    const kinds = events.map(e => e.kind);
    expect(kinds).toContain('tool_call_start');
    expect(kinds).toContain('tool_call_delta');
    expect(kinds).toContain('completed');
  });

  it('acomplete 返回 ProviderResponse', async () => {
    const mock = new MockProvider([
      new ProviderResponse({ text: 'hello' }),
    ]);
    const resp = await mock.acomplete({}, []);
    expect(resp.text).toBe('hello');
  });
});

// ── §5.5: arun callback ─────────────────────────────────

describe('arun callback', () => {
  it('onEvent 收到所有流式事件', async () => {
    const mock = new MockProvider([
      new ProviderResponse({ text: 'hi' }),
    ]);
    const events = [];
    await arun(mock, new ToolRegistry(), 'hello', {
      onEvent: (e) => events.push(e.kind),
    });
    expect(events).toContain('text_delta');
    expect(events).toContain('completed');
  });

  it('onToolCall + onToolResult 在工具派发时触发', async () => {
    const mock = new MockProvider([
      new ProviderResponse({
        toolCalls: [new ToolCallRef('call-1', 'calc', { expression: '2+2' })],
      }),
      new ProviderResponse({ text: '4' }),
    ]);
    const calls = [];
    const results = [];
    await arun(mock, new ToolRegistry([calc]), 'calc 2+2', {
      onToolCall: (c) => calls.push(c),
      onToolResult: (r) => results.push(r),
    });
    expect(calls).toHaveLength(1);
    expect(results).toHaveLength(1);
    expect(results[0].is_error).toBe(false);
  });
});

// ── §5.5: run() 同步包装 ────────────────────────────────

describe('run() 同步包装', () => {
  it('mock provider 的 run() 仍然可用', () => {
    const mock = new MockProvider([new ProviderResponse({ text: 'hi' })]);
    expect(run(mock, new ToolRegistry(), 'hello')).toBe('hi');
  });

  it('calculator 仍可用 run()', () => {
    const mock = new MockProvider([
      new ProviderResponse({
        toolCalls: [new ToolCallRef('call-1', 'calc', { expression: '2+2' })],
      }),
      new ProviderResponse({ text: '4' }),
    ]);
    const result = run(mock, new ToolRegistry([calc]), '2+2?');
    expect(result).toBe('4');
  });
});

// ── §5.7: RetryPolicy ───────────────────────────────────

describe('RetryPolicy', () => {
  it('成功 → 不重试', async () => {
    const policy = new RetryPolicy({ maxAttempts: 3 });
    let calls = 0;
    const result = await policy.run(async () => {
      calls++;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('可重试错误 → 退避重试', async () => {
    const policy = new RetryPolicy({ maxAttempts: 3, baseDelay: 0.001 });
    let calls = 0;
    const result = await policy.run(async () => {
      calls++;
      if (calls < 3) {
        const e = new Error('Server error');
        e.status = 503;
        throw e;
      }
      return 'recovered';
    });
    expect(result).toBe('recovered');
    expect(calls).toBe(3);
  });

  it('不可重试错误（400）→ 立即抛', async () => {
    const policy = new RetryPolicy({ maxAttempts: 3, baseDelay: 0.001 });
    let calls = 0;
    await expect(policy.run(async () => {
      calls++;
      const e = new Error('Bad request');
      e.status = 400;
      throw e;
    })).rejects.toThrow('Bad request');
    expect(calls).toBe(1);
  });

  it('连接错误 → 可重试', async () => {
    const policy = new RetryPolicy({ maxAttempts: 3, baseDelay: 0.001 });
    let calls = 0;
    await expect(policy.run(async () => {
      calls++;
      const e = new Error('ECONNRESET');
      e.code = 'ECONNRESET';
      throw e;
    })).rejects.toThrow(RetryBudgetExceeded);
    expect(calls).toBe(3);
  });

  it('超出总时间 → RetryBudgetExceeded', async () => {
    const policy = new RetryPolicy({ maxAttempts: 10, maxTotalSeconds: 0.05, baseDelay: 0.1 });
    let calls = 0;
    await expect(policy.run(async () => {
      calls++;
      const e = new Error('Server error');
      e.status = 503;
      throw e;
    })).rejects.toThrow(RetryBudgetExceeded);
  });
});

// ── §5.8: FallbackProvider ───────────────────────────────

describe('FallbackProvider', () => {
  it('主 provider 成功 → 用主的', async () => {
    const primary = new MockProvider([new ProviderResponse({ text: 'from primary' })]);
    const secondary = new MockProvider([new ProviderResponse({ text: 'from secondary' })]);
    const fallback = new FallbackProvider(primary, secondary);
    const resp = await fallback.acomplete({}, []);
    expect(resp.text).toBe('from primary');
  });

  it('主 provider 失败 → 用备的', async () => {
    // primary 用完 → complete() throws
    const primary = new MockProvider([]);
    const secondary = new MockProvider([new ProviderResponse({ text: 'from secondary' })]);
    const fallback = new FallbackProvider(primary, secondary);
    const resp = await fallback.acomplete({}, []);
    expect(resp.text).toBe('from secondary');
  });
});
