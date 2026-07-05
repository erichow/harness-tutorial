/**
 * 第 3 章示例 — 换 Provider 的回报
 *
 * 三个模型、一份 loop、一份工具、一份 transcript 类型——零代码变更。
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

// ---- 工具 ----

function calc(expression) {
  return String(eval(expression));
}

const toolSchemas = [{
  name: 'calc',
  description: 'Evaluate a Python arithmetic expression.',
  input_schema: {
    type: 'object',
    properties: { expression: { type: 'string' } },
    required: ['expression'],
  },
}];

// ---- 选 Provider ──────────────────────────────────────

const providerName = process.env.PROVIDER || 'mock';

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
          tool_name: 'calc',
          tool_args: { expression: '17 * 23 - 100' },
          tool_call_id: 'call-1',
        }),
        new ProviderResponse({ text: '17 × 23 - 100 = 291.' }),
      ]);
  }
}

// ---- Run ──────────────────────────────────────────────

const provider = await getProvider();
console.log(`Provider: ${provider.name}`);

const answer = run(
  provider,
  { calc },
  toolSchemas,
  'What is 17 * 23, minus 100?',
);
console.log(answer);
