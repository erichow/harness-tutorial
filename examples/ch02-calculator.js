/**
 * 第 2 章示例 — Calculator
 *
 * 两个回合的 agent：
 *   round 1: 模型请求调用 calc("2 + 2")
 *   round 2: 模型读到结果，给出 final answer "2 + 2 is 4."
 *
 * 运行: node examples/ch02-calculator.js
 */

import { run } from '../src/harness/agent.js';
import { ProviderResponse } from '../src/harness/providers/base.js';
import { MockProvider } from '../src/harness/providers/mock.js';

// ---- 工具 ----

function calc(expression) {
  // 生产中危险，mock 里无害
  return String(eval(expression));
}

// ---- Mock provider ----

const mock = new MockProvider([
  new ProviderResponse({
    tool_name: 'calc',
    tool_args: { expression: '2 + 2' },
    tool_call_id: 'call-1',
  }),
  new ProviderResponse({ text: '2 + 2 is 4.' }),
]);

// ---- Tool schemas ----

const toolSchemas = [{
  name: 'calc',
  description: 'Evaluate a Python arithmetic expression.',
  input_schema: {
    type: 'object',
    properties: { expression: { type: 'string' } },
    required: ['expression'],
  },
}];

// ---- Run ----

const answer = run(mock, { calc }, toolSchemas, 'What is 2 + 2?');
console.log(answer);  // → "2 + 2 is 4."
