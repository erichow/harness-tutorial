/**
 * 第 5 章示例 — 流式输出
 *
 * 用法: PROVIDER=mock node examples/ch05-streaming.js
 *
 * 展示流式 token 输出：每个 text_delta 即时打印。
 */

import { arun } from '../src/harness/agent.js';
import { MockProvider } from '../src/harness/providers/mock.js';
import { ProviderResponse, ToolCallRef } from '../src/harness/providers/base.js';
import { ToolRegistry, calc, read_file, write_file, bash } from '../src/harness/tools/index.js';

const providerName = (process.env.PROVIDER || 'mock').toLowerCase();

function getProvider() {
  switch (providerName) {
    case 'anthropic':
      const { AnthropicProvider } = require('../src/harness/providers/anthropic.js');
      return new AnthropicProvider();
    case 'openai':
      const { OpenAIProvider } = require('../src/harness/providers/openai.js');
      return new OpenAIProvider();
    case 'mock':
    default:
      return new MockProvider([
        new ProviderResponse({
          toolCalls: [new ToolCallRef('call-1', 'write_file', {
            path: '/tmp/ch05-demo.txt',
            content: 'hello world',
          })],
        }),
        new ProviderResponse({
          toolCalls: [new ToolCallRef('call-2', 'read_file', { path: '/tmp/ch05-demo.txt' })],
        }),
        new ProviderResponse({
          text: 'I wrote "hello world" to /tmp/ch05-demo.txt and read it back.',
          input_tokens: 150,
          output_tokens: 25,
        }),
      ]);
  }
}

const registry = new ToolRegistry([calc, read_file, write_file, bash]);
const provider = getProvider();

process.stdout.write('Assistant: ');

const answer = await arun(
  provider,
  registry,
  'Write hello world to /tmp/ch05-demo.txt, read it back, and tell me what happened.',
  {
    onEvent: (e) => {
      if (e.kind === 'text_delta') process.stdout.write(e.text);
    },
    onToolCall: (c) => {
      process.stdout.write(`\n  🔧 ${c.name}(${JSON.stringify(c.args)})`);
    },
    onToolResult: (r) => {
      const icon = r.is_error ? '✗' : '→';
      const preview = r.content.length > 60 ? r.content.slice(0, 60) + '...' : r.content;
      process.stdout.write(` ${icon} ${preview}\n  `);
    },
  },
);

console.log('\n\n---');
console.log('Final:', answer);
