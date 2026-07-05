/**
 * StreamEvent — 第 5 章
 *
 * 5 种事件把 Anthropic/OpenAI/OSS 的不同流式形状统一。
 * loop 只消费这 5 种；adapter 负责把厂商事件翻译过来。
 *
 *   TextDelta       — 一段流式文本
 *   ReasoningDelta  — 一段流式 reasoning
 *   ToolCallStart   — 工具调用开始
 *   ToolCallDelta   — 参数 JSON 分片到达
 *   Completed       — 终止，附带 token 计数
 */

/**
 * @param {string} text
 * @returns {{ kind: 'text_delta', text: string }}
 */
export function TextDelta(text) {
  return Object.freeze({ kind: 'text_delta', text });
}

/**
 * @param {string} text
 * @returns {{ kind: 'reasoning_delta', text: string }}
 */
export function ReasoningDelta(text) {
  return Object.freeze({ kind: 'reasoning_delta', text });
}

/**
 * @param {string} id
 * @param {string} name
 * @returns {{ kind: 'tool_call_start', id: string, name: string }}
 */
export function ToolCallStart(id, name) {
  return Object.freeze({ kind: 'tool_call_start', id, name });
}

/**
 * @param {string} id
 * @param {string} argsFragment — partial JSON, accumulated by the loop
 * @returns {{ kind: 'tool_call_delta', id: string, args_fragment: string }}
 */
export function ToolCallDelta(id, argsFragment) {
  return Object.freeze({ kind: 'tool_call_delta', id, args_fragment: argsFragment });
}

/**
 * @param {object} opts
 * @param {number} opts.inputTokens
 * @param {number} opts.outputTokens
 * @param {number} [opts.reasoningTokens]
 * @param {object} [opts.reasoningMetadata]
 * @returns {{ kind: 'completed', input_tokens: number, output_tokens: number, reasoning_tokens: number, reasoning_metadata: object }}
 */
export function Completed({ inputTokens, outputTokens, reasoningTokens = 0, reasoningMetadata = {} }) {
  return Object.freeze({
    kind: 'completed',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    reasoning_tokens: reasoningTokens,
    reasoning_metadata: reasoningMetadata,
  });
}

/**
 * @typedef {ReturnType<TextDelta> | ReturnType<ReasoningDelta> | ReturnType<ToolCallStart> | ReturnType<ToolCallDelta> | ReturnType<Completed>} StreamEvent
 */
