/**
 * Accumulate — 第 5 章
 *
 * 收集 StreamEvent 流，构建 ProviderResponse。
 * 把 tool_call_start / tool_call_delta 片段拼成完整的 ToolCallRef。
 */

import { ProviderResponse, ToolCallRef } from './base.js';

/**
 * 消费 async iterable 的 StreamEvent，accumulate 为 ProviderResponse。
 *
 * @param {AsyncIterable<import('./events.js').StreamEvent>} stream
 * @returns {Promise<ProviderResponse>}
 */
export async function accumulate(stream) {
  let text = '';
  let reasoningText = '';
  let reasoningMetadata = {};
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;

  /** @type {Map<string, { id: string, name: string, argsFragments: string[] }>} */
  const toolCallsInFlight = new Map();

  for await (const event of stream) {
    switch (event.kind) {
      case 'text_delta':
        text += event.text;
        break;

      case 'reasoning_delta':
        reasoningText += event.text;
        break;

      case 'tool_call_start':
        toolCallsInFlight.set(event.id, {
          id: event.id,
          name: event.name,
          argsFragments: [],
        });
        break;

      case 'tool_call_delta':
        if (toolCallsInFlight.has(event.id)) {
          toolCallsInFlight.get(event.id).argsFragments.push(event.args_fragment);
        }
        break;

      case 'completed':
        inputTokens = event.input_tokens;
        outputTokens = event.output_tokens;
        reasoningTokens = event.reasoning_tokens;
        if (event.reasoning_metadata) {
          reasoningMetadata = event.reasoning_metadata;
        }
        break;
    }
  }

  // 把 fragments 拼成 JSON → ToolCallRef
  /** @type {ToolCallRef[]} */
  const toolCalls = [];
  for (const { id, name, argsFragments } of toolCallsInFlight.values()) {
    const json = argsFragments.join('');
    let args = {};
    if (json) {
      try {
        args = JSON.parse(json);
      } catch {
        // partial JSON — 用原始片段
        args = { _raw: json };
      }
    }
    toolCalls.push(new ToolCallRef(id, name, args));
  }

  return new ProviderResponse({
    text: text || null,
    toolCalls,
    reasoningText: reasoningText || null,
    reasoningMetadata,
    inputTokens,
    outputTokens,
    reasoningTokens,
  });
}
