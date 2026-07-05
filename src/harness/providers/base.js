/**
 * Provider 协议 — 第 2 章
 *
 * 所有 provider（Anthropic / OpenAI / 本地 OSS / mock）都遵守这个协议。
 * harness 代码只依赖这个协议，不依赖任何厂商 SDK。
 *
 * ProviderResponse 把两种情况塞进同一个 shape：
 *   kind="text"       → text 字段有效
 *   kind="tool_call"  → tool_name / tool_args / tool_call_id 有效
 *
 * 真实响应还有 token 计数、finish reason、reasoning trace——
 * 但 loop 此刻只想知道一件事：调工具，还是给答案？
 */

/**
 * Provider 的响应：要么是文本，要么是工具调用。
 *
 * kind="text" 时 text 有效；
 * kind="tool_call" 时 tool_name/tool_args/tool_call_id 有效。
 *
 * @typedef {object} ProviderResponse
 * @property {'text' | 'tool_call'} kind
 * @property {string} [text]
 * @property {string} [tool_name]
 * @property {Record<string, *>} [tool_args]
 * @property {string} [tool_call_id]
 */

/**
 * Provider 协议：接收 transcript 和工具定义，返回一个响应。
 *
 * @typedef {object} Provider
 * @property {(transcript: object[], tools: object[]) => ProviderResponse} complete
 */

export {};
