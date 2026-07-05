/**
 * 第 3 章示例 — 换 Provider 的回报（第 4 章适配版）
 *
 * 三个模型、一份 loop、一份 ToolRegistry——零代码变更。
 *
 * 用法:
 *   PROVIDER=mock   node examples/ch03-real-provider.js
 *   PROVIDER=anthropic node examples/ch03-real-provider.js  # 需 ANTHROPIC_API_KEY
 *   PROVIDER=openai node examples/ch03-real-provider.js     # 需 OPENAI_API_KEY
 *   PROVIDER=local  node examples/ch03-real-provider.js     # 需 http://localhost:8000
 */

import { run } from '../src/harness/agent.js';
import { MockProvider, AnthropicProvider, OpenAIProvider, LocalProvider } from '../src/harness/providers/index.js';
import { ProviderResponse } from '../src/harness/providers/base.js';
import { Tool, ToolRegistry } from '../src/harness/tools/index.js';

// ---- 工具 ----

const calcTool = new Tool({
  name: 'calc',
  description: 'Evaluate a Python arithmetic expression.',
  inputSchema: {
    type: 'object',
    properties: { expression: { type: 'string' } },
    required: ['expression'],
  },
  run: ({ expression }) => String(eval(expression)),
});

const registry = new ToolRegistry([calcTool]);

// ---- 选 Provider ----

const providerName = (process.env.PROVIDER || 'mock').toLowerCase();

/** @returns {Promise<{complete: Function, name: string}>} */
async function getProvider() {
  switch (providerName) {
    case 'anthropic':
      return new AnthropicProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'local':
      return new LocalProvider();
    case 'mock':
    default:
      return new MockProvider([
        new ProviderResponse({
          tool_name: 'calc', tool_args: { expression: '2 + 2' }, tool_call_id: 'call-1',
        }),
        new ProviderResponse({ text: '2 + 2 is 4.' }),
      ]);
  }
}

// ---- Run ----

const provider = await getProvider();
const answer = run(provider, registry, 'What is 2 + 2?');
console.log(answer);
