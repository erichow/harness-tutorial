/**
 * Agent 循环 — 第 2 章
 *
 * Agent = Model + Loop
 *
 * 40 行的最小可用循环——它能跑，但马上就要以 5 种方式碎掉。
 * 这 5 个 break 就是后续 22 章的路线图。
 */

const MAX_ITERATIONS = 20;

/**
 * 最小同步 Agent 循环。
 *
 * 每个迭代做 3 个决策：
 *   ① Ask — 把 transcript 发给 provider
 *   ② Classify — 响应是 tool_call 还是 text（final answer）？
 *   ③ Bound — 超过 MAX_ITERATIONS 强制退出
 *
 * @param {import('./providers/base.js').Provider} provider
 * @param {Record<string, (...args: any[]) => string>} tools
 * @param {object[]} toolSchemas
 * @param {string} userMessage
 * @returns {string} — final answer 文本
 */
export function run(provider, tools, toolSchemas, userMessage) {
  /** @type {object[]} */
  const transcript = [{ role: 'user', content: userMessage }];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = provider.complete(transcript, toolSchemas);

    // 分类：文本 → final answer，停
    if (response.kind === 'text') {
      transcript.push({ role: 'assistant', content: response.text });
      return response.text || '';
    }

    // 分类：工具调用 → 执行，append 结果，继续
    if (response.kind === 'tool_call') {
      if (response.tool_name == null) {
        throw new Error('tool_call response is missing tool_name');
      }
      if (!(response.tool_name in tools)) {
        throw new Error(`unknown tool: ${JSON.stringify(response.tool_name)}`);
      }

      const toolFn = tools[response.tool_name];
      const result = toolFn(...Object.values(response.tool_args ?? {}));

      transcript.push({
        role: 'assistant',
        content: [{
          type: 'tool_use',
          name: response.tool_name,
          id: response.tool_call_id,
          input: response.tool_args,
        }],
      });
      transcript.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: response.tool_call_id,
          content: result,
        }],
      });
      continue;
    }

    // 兜底：未知响应类型
    throw new Error(`unexpected response kind: ${JSON.stringify(response.kind)}`);
  }

  // 兜底：超过最大迭代次数
  throw new Error(`agent did not finish in ${MAX_ITERATIONS} iterations`);
}
