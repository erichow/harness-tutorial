/**
 * 第 4 章示例 — 工具协议：三 provider 零代码切换
 *
 * 用法:
 *   PROVIDER=mock      node examples/ch04-tools.js
 *   PROVIDER=anthropic node examples/ch04-tools.js  # 需 ANTHROPIC_API_KEY
 *   PROVIDER=openai    node examples/ch04-tools.js  # 需 OPENAI_API_KEY
 *   PROVIDER=local     node examples/ch04-tools.js  # 需 http://localhost:8000
 */

import { run } from '../src/harness/agent.js';
import { MockProvider, AnthropicProvider, OpenAIProvider, LocalProvider } from '../src/harness/providers/index.js';
import { ProviderResponse } from '../src/harness/providers/base.js';
import { ToolRegistry, calc, read_file, write_file, bash } from '../src/harness/tools/index.js';

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
      // 两个回合：write "hello world" → read it back
      return new MockProvider([
        new ProviderResponse({
          tool_name: 'write_file',
          tool_args: { path: '/tmp/ch04-test.txt', content: 'hello world' },
          tool_call_id: 'call-1',
        }),
        new ProviderResponse({
          tool_name: 'read_file',
          tool_args: { path: '/tmp/ch04-test.txt' },
          tool_call_id: 'call-2',
        }),
        new ProviderResponse({ text: 'The file contained: hello world' }),
      ]);
    default:
      throw new Error(`unknown PROVIDER: ${providerName}`);
  }
}

// ---- Registry ----

const registry = new ToolRegistry([calc, read_file, write_file, bash]);

// ---- Run ----

const provider = await getProvider();
const answer = run(
  provider,
  registry,
  "Write the string 'hello world' to /tmp/ch04-test.txt, then read it back, then tell me what the file contained.",
);

console.log(answer);
