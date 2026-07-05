/**
 * Agent 循环 — 第 3 章升级
 *
 * 逻辑不变，类型收紧：
 *   1. Transcript 代替裸 list[dict]
 *   2. Message.fromAssistantResponse 一行解决 assistant 消息持久化
 *   3. try/except 修复 Break 1（unknown tool）和 Break 3（tool throws）
 */

import { Message, ToolCall, ToolResult, Transcript } from './messages.js';

const MAX_ITERATIONS = 20;

/**
 * 最小 Agent 循环 — 第 3 章版本。
 *
 * @param {import('./providers/base.js').ProviderResponse & {complete: Function}} provider
 * @param {Record<string, (...args: any[]) => string>} tools
 * @param {object[]} toolSchemas
 * @param {string} userMessage
 * @param {string | null} [system=null]
 * @returns {string} — final answer 文本
 */
export function run(provider, tools, toolSchemas, userMessage, system = null) {
  const transcript = new Transcript({ system });
  transcript.append(Message.userText(userMessage));

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = provider.complete(transcript, toolSchemas);

    if (response.is_final) {
      transcript.append(Message.fromAssistantResponse(response));
      return response.text ?? '';
    }

    // tool call 分支 — 第 3 章加 try/except，修复 Break 1 & 3
    transcript.append(Message.fromAssistantResponse(response));

    for (const ref of _extractToolCalls(response)) {
      let result;
      try {
        const toolFn = tools[ref.name];
        if (!toolFn) {
          result = ToolResult(ref.id, `unknown tool: ${ref.name}`, true);
        } else {
          const resultText = toolFn(...Object.values(ref.args ?? {}));
          result = ToolResult(ref.id, resultText);
        }
      } catch (e) {
        result = ToolResult(ref.id, String(e), true);
      }
      transcript.append(Message.toolResult(result));
    }
  }

  throw new Error(`agent did not finish in ${MAX_ITERATIONS} iterations`);
}

/**
 * 从 ProviderResponse 中提取 tool calls。
 * 目前是单 tool call，未来多 tool call 时只改这里。
 *
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
