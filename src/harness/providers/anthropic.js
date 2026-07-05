/**
 * Anthropic Provider — 第 3 章
 *
 * Adapter 的工作是翻译，不是决策。
 * match 语句穷举 Block 类型 → Anthropic content blocks。
 */

import { ProviderResponse } from './base.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicProvider {
  /**
   * @param {object} [opts]
   * @param {string} [opts.model]
   * @param {object} [opts.client] — Anthropic SDK client (injected or auto-created)
   * @param {boolean} [opts.enableThinking]
   * @param {number} [opts.thinkingBudgetTokens]
   * @param {number} [opts.maxTokens]
   */
  constructor(opts = {}) {
    this.name = 'anthropic';
    this.model = opts.model ?? DEFAULT_MODEL;
    this.enableThinking = opts.enableThinking ?? false;
    this.thinkingBudgetTokens = opts.thinkingBudgetTokens ?? 2000;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
    if (opts.client) {
      this._client = opts.client;
    }
  }

  /**
   * @param {import('../messages.js').Transcript} transcript
   * @param {object[]} tools
   * @returns {Promise<ProviderResponse>}
   */
  async complete(transcript, tools) {
    // lazy init — 第 2 章没装 SDK 也不会炸
    if (!this._client) {
      const { Anthropic } = await import('@anthropic-ai/sdk');
      this._client = new Anthropic();
    }

    /** @type {Record<string, *>} */
    const kwargs = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: transcript.messages.map(m => _toAnthropic(m, this.enableThinking)),
    };
    if (tools && tools.length) kwargs.tools = tools;
    if (transcript.system) kwargs.system = transcript.system;
    if (this.enableThinking) {
      kwargs.thinking = { type: 'enabled', budget_tokens: this.thinkingBudgetTokens };
    }

    const raw = await this._client.messages.create(kwargs);
    return _fromAnthropic(raw);
  }
}

// ── 翻译: inner → Anthropic ──────────────────────────────

/**
 * @param {import('../messages.js').Message} message
 * @param {boolean} enableThinking
 * @returns {object}
 */
function _toAnthropic(message, enableThinking) {
  /** @type {object[]} */
  const content = [];
  for (const block of message.blocks) {
    content.push(_blockToAnthropic(block));
  }
  return { role: message.role, content };
}

/**
 * @param {object} block
 * @returns {object}
 */
function _blockToAnthropic(block) {
  switch (block.kind) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'tool_call':
      return { type: 'tool_use', id: block.id, name: block.name, input: block.args };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.call_id,
        content: block.content,
        is_error: block.is_error,
      };
    case 'reasoning': {
      /** @type {Record<string, *>} */
      const out = { type: 'thinking', thinking: block.text };
      if (block.metadata.signature) {
        out.signature = block.metadata.signature;  // round-trip 必须
      }
      return out;
    }
    default:
      throw new Error(`unknown block kind: ${block.kind}`);
  }
}

// ── 翻译: Anthropic → inner ──────────────────────────────

/**
 * @param {object} raw
 * @returns {ProviderResponse}
 */
function _fromAnthropic(raw) {
  /** @type {string | null} */
  let text = null;
  /** @type {string | null} */
  let toolCallId = null;
  /** @type {string | null} */
  let toolName = null;
  /** @type {Record<string,*> | null} */
  let toolArgs = null;
  /** @type {string | null} */
  let reasoningText = null;
  /** @type {Record<string,*>} */
  let reasoningMeta = {};

  for (const block of raw.content) {
    switch (block.type) {
      case 'text':
        text = block.text;
        break;
      case 'tool_use':
        toolCallId = block.id;
        toolName = block.name;
        toolArgs = block.input;
        break;
      case 'thinking': {
        reasoningText = block.thinking;
        if (block.signature) reasoningMeta.signature = block.signature;
        break;
      }
      case 'redacted_thinking':
        // 推理内容被 redact，metadata 仍可能包含签名
        if (block.data) reasoningMeta = { ...reasoningMeta, ...block.data };
        break;
    }
  }

  return new ProviderResponse({
    text,
    tool_call_id: toolCallId,
    tool_name: toolName,
    tool_args: toolArgs,
    reasoning_text: reasoningText,
    reasoning_metadata: reasoningMeta,
    input_tokens: raw.usage?.input_tokens ?? 0,
    output_tokens: raw.usage?.output_tokens ?? 0,
  });
}
