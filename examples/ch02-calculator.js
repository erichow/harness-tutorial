/**
 * 第 2 章示例 — Calculator
 *
 * 两个回合的 agent（第 4 章适配版）：
 *   round 1: 模型请求调用 calc("2 + 2")
 *   round 2: 模型读到结果，给出 final answer "2 + 2 is 4."
 *
 * 运行: node examples/ch02-calculator.js
 */

import { run } from '../src/harness/agent.js';
import { ProviderResponse } from '../src/harness/providers/base.js';
import { MockProvider } from '../src/harness/providers/mock.js';
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

// ---- Mock provider ----

const mock = new MockProvider([
  new ProviderResponse({
    tool_name: 'calc',
    tool_args: { expression: '2 + 2' },
    tool_call_id: 'call-1',
  }),
  new ProviderResponse({ text: '2 + 2 is 4.' }),
]);

// ---- Registry ----

const registry = new ToolRegistry([calcTool]);

// ---- Run ----

const answer = run(mock, registry, 'What is 2 + 2?');
console.log(answer);  // → "2 + 2 is 4."
