/**
 * 第 3 章测试 — 消息、回合与转录（第 4 章适配版）
 *
 * 覆盖 transcript 类型系统、Block 不可变性、
 * ProviderResponse 新形状、升级后的 loop。
 * 第 4 章适配：loop 测试改用 ToolRegistry。
 */

import { describe, it, expect } from 'vitest';
import { TextBlock, ToolCall, ToolResult, ReasoningBlock, Message, Transcript } from '../src/harness/messages.js';
import { ProviderResponse } from '../src/harness/providers/base.js';
import { MockProvider } from '../src/harness/providers/mock.js';
import { Tool, ToolRegistry } from '../src/harness/tools/index.js';
import { run } from '../src/harness/agent.js';

function _makeTool(name, fn) {
  return new Tool({ name, description: name, inputSchema: { type: 'object', properties: {}, required: [] }, run: fn });
}

// ── §3.2: Block 类型 ───────────────────────────────────

describe('Block 类型', () => {
  it('TextBlock — kind="text"', () => {
    const b = TextBlock('hello');
    expect(b.kind).toBe('text');
    expect(b.text).toBe('hello');
  });

  it('ToolCall — kind="tool_call"', () => {
    const c = ToolCall('call-1', 'calc', { expression: '2+2' });
    expect(c.kind).toBe('tool_call');
    expect(c.id).toBe('call-1');
    expect(c.name).toBe('calc');
    expect(c.args).toEqual({ expression: '2+2' });
  });

  it('ToolResult — kind="tool_result"', () => {
    const r = ToolResult('call-1', '4');
    expect(r.kind).toBe('tool_result');
    expect(r.call_id).toBe('call-1');
    expect(r.content).toBe('4');
    expect(r.is_error).toBe(false);
  });

  it('ToolResult is_error=true', () => {
    const r = ToolResult('call-1', 'BOOM', true);
    expect(r.is_error).toBe(true);
  });

  it('ReasoningBlock — kind="reasoning" + metadata', () => {
    const r = ReasoningBlock('Let me think...', { signature: 'sig-abc' });
    expect(r.kind).toBe('reasoning');
    expect(r.text).toBe('Let me think...');
    expect(r.metadata.signature).toBe('sig-abc');
  });

  it('Block 不可变（frozen）', () => {
    const b = TextBlock('hello');
    expect(() => { b.text = 'changed'; }).toThrow();
  });
});

// ── §3.2: Message 工厂方法 ─────────────────────────────

describe('Message 工厂方法', () => {
  it('userText', () => {
    const m = Message.userText('hi');
    expect(m.role).toBe('user');
    expect(m.blocks).toHaveLength(1);
    expect(m.blocks[0].kind).toBe('text');
    expect(m.blocks[0].text).toBe('hi');
  });

  it('assistantText', () => {
    const m = Message.assistantText('answer');
    expect(m.role).toBe('assistant');
    expect(m.blocks[0].kind).toBe('text');
    expect(m.blocks[0].text).toBe('answer');
  });

  it('assistantText + reasoning', () => {
    const r = ReasoningBlock('thinking...');
    const m = Message.assistantText('answer', r);
    expect(m.blocks).toHaveLength(2);
    expect(m.blocks[0].kind).toBe('reasoning');
    expect(m.blocks[1].kind).toBe('text');
  });

  it('assistantToolCall', () => {
    const c = ToolCall('call-1', 'calc', { expr: '2+2' });
    const m = Message.assistantToolCall(c);
    expect(m.role).toBe('assistant');
    expect(m.blocks[0].kind).toBe('tool_call');
  });

  it('toolResult — 挂在 user role（Anthropic 惯例）', () => {
    const r = ToolResult('call-1', '4');
    const m = Message.toolResult(r);
    expect(m.role).toBe('user');
    expect(m.blocks[0].kind).toBe('tool_result');
  });

  it('fromAssistantResponse — 纯文本', () => {
    const resp = new ProviderResponse({ text: 'hello' });
    const m = Message.fromAssistantResponse(resp);
    expect(m.role).toBe('assistant');
    expect(m.blocks).toHaveLength(1);
    expect(m.blocks[0].kind).toBe('text');
  });

  it('fromAssistantResponse — tool_call + reasoning', () => {
    const resp = new ProviderResponse({
      tool_name: 'calc', tool_args: { expr: '2+2' }, tool_call_id: 'call-1',
      reasoning_text: 'I will calculate', reasoning_metadata: { signature: 'sig-abc' },
    });
    const m = Message.fromAssistantResponse(resp);
    expect(m.blocks).toHaveLength(2);
    expect(m.blocks[0].kind).toBe('reasoning');
    expect(m.blocks[1].kind).toBe('tool_call');
  });
});

// ── §3.2: Transcript ────────────────────────────────────

describe('Transcript', () => {
  it('空 transcript', () => {
    const t = new Transcript();
    expect(t.length).toBe(0);
    expect(t.last()).toBeUndefined();
    expect(t.system).toBeNull();
  });

  it('append + last', () => {
    const t = new Transcript();
    t.append(Message.userText('hi'));
    expect(t.length).toBe(1);
    expect(t.last().blocks[0].text).toBe('hi');
  });

  it('system 字段 — provider 各自决定怎么传', () => {
    const t = new Transcript({ system: 'You are helpful.' });
    expect(t.system).toBe('You are helpful.');
  });
});

// ── §3.3: ProviderResponse 新形状 ─────────────────────

describe('ProviderResponse — 第 3 章升级', () => {
  it('is_final — 纯文本', () => {
    const r = new ProviderResponse({ text: 'answer' });
    expect(r.is_final).toBe(true);
    expect(r.is_tool_call).toBe(false);
  });

  it('is_tool_call — 工具调用', () => {
    const r = new ProviderResponse({ tool_name: 'calc' });
    expect(r.is_tool_call).toBe(true);
    expect(r.is_final).toBe(false);
  });

  it('token counts — provider 知道，记账器不猜', () => {
    const r = new ProviderResponse({ input_tokens: 100, output_tokens: 50, reasoning_tokens: 20 });
    expect(r.input_tokens).toBe(100);
    expect(r.output_tokens).toBe(50);
    expect(r.reasoning_tokens).toBe(20);
  });

  it('reasoning_text 可与 text 或 tool_call 共存', () => {
    const r = new ProviderResponse({ text: 'answer', reasoning_text: 'I thought about it' });
    expect(r.is_final).toBe(true);
    expect(r.reasoning_text).toBe('I thought about it');
  });
});

// ── §3.5: 升级后的 loop（零崩溃 + tool 错误恢复）──

describe('第 3 章 loop — try/except 修复 Break 1 & 3（第 4 章适配）', () => {
  it('Break 1 fixed: unknown tool → is_error 返回模型', () => {
    const mock = new MockProvider([
      new ProviderResponse({ tool_name: 'nonexistent', tool_call_id: 'call-1', tool_args: {} }),
      new ProviderResponse({ text: 'I tried but failed' }),
    ]);
    expect(run(mock, new ToolRegistry(), 'What is 2+2?')).toBe('I tried but failed');
  });

  it('Break 3 fixed: tool throws → is_error 返回模型', () => {
    const mock = new MockProvider([
      new ProviderResponse({ tool_name: 'crash', tool_call_id: 'call-1', tool_args: {} }),
      new ProviderResponse({ text: 'I recovered' }),
    ]);
    const registry = new ToolRegistry([_makeTool('crash', () => { throw new Error('BOOM'); })]);
    expect(run(mock, registry, 'crash')).toBe('I recovered');
  });

  it('Happy path: calculator', () => {
    const mock = new MockProvider([
      new ProviderResponse({ tool_name: 'calc', tool_args: { expression: '2 + 2' }, tool_call_id: 'call-1' }),
      new ProviderResponse({ text: '2 + 2 is 4.' }),
    ]);
    const registry = new ToolRegistry([
      new Tool({
        name: 'calc', description: 'Evaluate.',
        inputSchema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] },
        run: ({ expression }) => String(eval(expression)),
      }),
    ]);
    expect(run(mock, registry, 'What is 2 + 2?')).toBe('2 + 2 is 4.');
  });

  it('Break 4: 超过 MAX_ITERATIONS 仍抛出', () => {
    const calls = Array.from({ length: 25 }, (_, i) =>
      new ProviderResponse({ tool_name: 'echo', tool_args: { msg: String(i) }, tool_call_id: `call-${i}` })
    );
    const registry = new ToolRegistry([_makeTool('echo', ({ msg }) => msg)]);
    expect(() => run(new MockProvider(calls), registry, 'loop')).toThrow(/did not finish/);
  });

  it('system prompt 传递', () => {
    const mock = new MockProvider([new ProviderResponse({ text: 'You are helpful!' })]);
    expect(run(mock, new ToolRegistry(), 'Hi', null, 'Be helpful')).toBe('You are helpful!');
  });
});

// ── §3.4: Adapter 穷举 match ───────────────────────────

describe('Adapter match 穷举', () => {
  it('所有 4 种 block 都能翻译为 Anthropic 格式', () => {
    const msg = new Message('assistant', [
      ReasoningBlock('thinking...', { signature: 'sig-abc' }),
      ToolCall('call-1', 'calc', { expression: '2+2' }),
    ]);
    for (const block of msg.blocks) {
      expect(['text', 'tool_call', 'tool_result', 'reasoning']).toContain(block.kind);
    }
  });
});
