/**
 * Agent 循环 — 第 5 章升级
 *
 * async / await 重构 + 流式 + 中断保护。
 *
 * arun() — 异步版本，支持流式回调
 * run()  — 同步包装（给脚本和测试）
 *
 * 3 个 callback 覆盖一个回合的全部可见表面：
 *   onEvent      — 字符级流式渲染
 *   onToolCall   — 宣布调用
 *   onToolResult — 打印结果预览
 */

import { Message, ToolCall, Transcript } from './messages.js';
import { accumulate } from './providers/accumulate.js';

const MAX_ITERATIONS = 20;

/**
 * 异步 Agent 循环 — 第 5 章版本。
 *
 * @param {import('./providers/base.js').Provider} provider
 * @param {import('./tools/registry.js').ToolRegistry} registry
 * @param {string} userMessage
 * @param {object} [opts]
 * @param {Transcript | null} [opts.transcript]
 * @param {string | null} [opts.system]
 * @param {(event: import('./providers/events.js').StreamEvent) => void} [opts.onEvent]
 * @param {(call: import('./messages.js').ToolCallType) => void} [opts.onToolCall]
 * @param {(result: import('./messages.js').ToolResultType) => void} [opts.onToolResult]
 * @returns {Promise<string>} — final answer 文本
 */
export async function arun(provider, registry, userMessage, opts = {}) {
  const { transcript: _transcript = null, system = null, onEvent, onToolCall, onToolResult } = opts;
  const transcript = _transcript ?? new Transcript({ system });
  transcript.append(Message.userText(userMessage));

  const schemas = registry.schemas();

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await _oneTurn(provider, schemas, transcript, onEvent);

    if (response.is_final) {
      transcript.append(Message.fromAssistantResponse(response));
      return response.text ?? '';
    }

    // tool call 分支 — 迭代所有 tool_calls
    transcript.append(Message.fromAssistantResponse(response));

    for (const ref of response.tool_calls) {
      if (onToolCall) {
        onToolCall(ToolCall(ref.id, ref.name, ref.args));
      }
      const result = registry.dispatch(ref.name, ref.args, ref.id);
      if (onToolResult) onToolResult(result);
      transcript.append(Message.toolResult(result));
    }
  }

  throw new Error(`agent did not finish in ${MAX_ITERATIONS} iterations`);
}

/**
 * 跑一个 provider 回合：流式 accumulate → ProviderResponse。
 * 流式过程中把 text delta 通过 onEvent 推给 caller。
 *
 * @param {import('./providers/base.js').Provider} provider
 * @param {object[]} schemas
 * @param {Transcript} transcript
 * @param {(event: import('./providers/events.js').StreamEvent) => void} [onEvent]
 * @returns {Promise<import('./providers/base.js').ProviderResponse>}
 * @private
 */
async function _oneTurn(provider, schemas, transcript, onEvent) {
  const stream = provider.astream(transcript, schemas);

  // 把 stream 包一层，转发事件给 onEvent callback
  async function* forward() {
    for await (const event of stream) {
      if (onEvent) onEvent(event);
      yield event;
    }
  }

  return accumulate(forward());
}

/**
 * 同步包装 — 给脚本和测试。
 *
 * 优先用 provider.complete()（同步兼容接口），
 * 否则用 deasync 风格的 arun()。
 *
 * @param {import('./providers/base.js').Provider & { complete?: Function }} provider
 * @param {import('./tools/registry.js').ToolRegistry} registry
 * @param {string} userMessage
 * @param {Transcript | null} [_transcript]
 * @param {string | null} [system]
 * @returns {string}
 */
export function run(provider, registry, userMessage, _transcript = null, system = null) {
  // 如果 provider 有同步 complete()，用它（第 5 章前兼容）
  if (typeof provider.complete === 'function') {
    const transcript = _transcript ?? new Transcript({ system });
    transcript.append(Message.userText(userMessage));
    const schemas = registry.schemas();

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = provider.complete(transcript, schemas);

      if (response.is_final) {
        transcript.append(Message.fromAssistantResponse(response));
        return response.text ?? '';
      }

      transcript.append(Message.fromAssistantResponse(response));

      for (const ref of response.tool_calls) {
        const result = registry.dispatch(ref.name, ref.args, ref.id);
        transcript.append(Message.toolResult(result));
      }
    }

    throw new Error(`agent did not finish in ${MAX_ITERATIONS} iterations`);
  }

  // 纯 async provider — 用 deasync 风格
  let result = null;
  let error = null;
  let done = false;

  arun(provider, registry, userMessage, { transcript: _transcript, system })
    .then(r => { result = r; done = true; })
    .catch(e => { error = e; done = true; });

  // 推进事件循环
  const start = Date.now();
  const { setImmediate } = globalThis;
  while (!done) {
    if (Date.now() - start > 5000) {
      throw new Error('sync wait timeout — use arun() for async providers');
    }
  }

  if (error) throw error;
  return result;
}
