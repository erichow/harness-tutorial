/**
 * OpenAI Provider — Responses API — 第 3 章
 *
 * 选 Responses 而不是 Chat Completions：
 *   1. 厂商方向 — OpenAI 主推 Responses 作为 agent 表面
 *   2. OSS 覆盖跟上 — vLLM、Ollama 支持
 *   3. 类型更紧 — 输入项 typed（function_call / function_call_output / message）
 */

import { ProviderResponse } from './base.js';

const DEFAULT_MODEL = 'gpt-4o';

export class OpenAIProvider {
  /**
   * @param {object} [opts]
   * @param {string} [opts.model]
   * @param {object} [opts.client] — OpenAI SDK client
   * @param {string} [opts.reasoningEffort] — 'low' | 'medium' | 'high'
   */
  constructor(opts = {}) {
    this.name = 'openai';
    this.model = opts.model ?? DEFAULT_MODEL;
    this.reasoningEffort = opts.reasoningEffort ?? null;
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
    if (!this._client) {
      const { default: OpenAI } = await import('openai');
      this._client = new OpenAI();
    }

    /** @type {object[]} */
    const inputItems = [];
    for (const m of transcript.messages) {
      inputItems.push(..._toResponsesInput(m));
    }

    /** @type {Record<string, *>} */
    const kwargs = { model: this.model, input: inputItems };
    if (transcript.system) kwargs.instructions = transcript.system;
    if (tools && tools.length) {
      kwargs.tools = tools.map(_toolToResponses);
    }
    if (this.reasoningEffort) {
      kwargs.reasoning = { effort: this.reasoningEffort };
      kwargs.include = ['reasoning.encrypted_content'];
      kwargs.store = false;
    }

    const raw = await this._client.responses.create(kwargs);
    return _fromResponses(raw);
  }
}

// ── 翻译: inner → OpenAI ─────────────────────────────────

/**
 * @param {import('../messages.js').Message} message
 * @returns {object[]}
 */
function _toResponsesInput(message) {
  /** @type {object[]} */
  const items = [];

  for (const block of message.blocks) {
    switch (block.kind) {
      case 'text':
        if (message.role === 'user') {
          // user 消息: 纯字符串
          items.push({ role: 'user', content: block.text });
        } else if (message.role === 'assistant') {
          items.push({ type: 'message', role: 'assistant', content: block.text });
        }
        break;
      case 'tool_call':
        items.push({
          type: 'function_call',
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.args),
        });
        break;
      case 'tool_result':
        items.push({
          type: 'function_call_output',
          call_id: block.call_id,
          output: block.content,
        });
        break;
      case 'reasoning':
        // OpenAI 将 reasoning 作为 assistant message 的一部分
        items.push({ type: 'message', role: 'assistant', content: block.text });
        break;
    }
  }

  return items;
}

/**
 * @param {object} tool
 * @returns {object}
 */
function _toolToResponses(tool) {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  };
}

// ── 翻译: OpenAI → inner ─────────────────────────────────

/**
 * @param {object} raw
 * @returns {ProviderResponse}
 */
function _fromResponses(raw) {
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

  for (const item of raw.output) {
    switch (item.type) {
      case 'message':
        if (item.content?.[0]?.type === 'output_text') {
          text = item.content[0].text;
        }
        break;
      case 'function_call':
        toolCallId = item.call_id || item.id;
        toolName = item.name;
        try {
          toolArgs = JSON.parse(item.arguments ?? '{}');
        } catch {
          toolArgs = {};
        }
        break;
      case 'reasoning':
        reasoningText = item.content?.[0]?.text ?? null;
        if (item.encrypted_content) {
          reasoningMeta.encrypted_content = item.encrypted_content;
        }
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
    reasoning_tokens: raw.usage?.output_tokens_details?.reasoning_tokens ?? 0,
  });
}
