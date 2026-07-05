/**
 * Agent 循环 — 第 4 章升级
 *
 * 相比第 3 章的变化：
 *   1. 接收 ToolRegistry 而不是裸 tools dict + toolSchemas
 *   2. dispatch 责任移到 registry（永不抛异常）
 *   3. loop 更小、更干净
 */

import { Message, Transcript } from './messages.js';

const MAX_ITERATIONS = 20;

/**
 * 最小 Agent 循环 — 第 4 章版本。
 *
 * @param {import('./providers/base.js').ProviderResponse & {complete: Function, name: string}} provider
 * @param {import('./tools/registry.js').ToolRegistry} registry
 * @param {string} userMessage
 * @param {Transcript | null} [_transcript]
 * @param {string | null} [system]
 * @returns {string} — final answer 文本
 */
export function run(provider, registry, userMessage, _transcript = null, system = null) {
  const transcript = _transcript ?? new Transcript({ system });
  transcript.append(Message.userText(userMessage));

  const schemas = registry.schemas();

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = provider.complete(transcript, schemas);

    if (response.is_final) {
      transcript.append(Message.fromAssistantResponse(response));
      return response.text ?? '';
    }

    // tool call 分支 — dispatch 责任在 registry
    transcript.append(Message.fromAssistantResponse(response));

    for (const ref of _extractToolCalls(response)) {
      const result = registry.dispatch(ref.name, ref.args, ref.id);
      transcript.append(Message.toolResult(result));
    }
  }

  throw new Error(`agent did not finish in ${MAX_ITERATIONS} iterations`);
}

/**
 * 从 ProviderResponse 中提取 tool calls。
 * @param {import('./providers/base.js').ProviderResponse} response
 * @returns {object[]}
 * @private
 */
function _extractToolCalls(response) {
  if (!response.is_tool_call) return [];
  return [{
    id: response.tool_call_id,
    name: response.tool_name,
    args: response.tool_args ?? {},
  }];
}
