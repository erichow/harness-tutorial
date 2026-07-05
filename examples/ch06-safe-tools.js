/**
 * examples/ch06-safe-tools.js — 第 6 章：安全工具执行演示
 *
 * 跑法：node examples/ch06-safe-tools.js
 *
 * 展示 ToolRegistry 的 4 道闸门：
 *   ① unknown tool → "Did you mean ...?"
 *   ② schema 校验 → 结构化错误
 *   ③ loop detector → 3 次重复拦截
 *   ④ 正常执行
 */

import { ToolRegistry, calc, json_query } from '../src/harness/tools/index.js';
import { MockProvider } from '../src/harness/providers/mock.js';
import { arun } from '../src/harness/agent.js';

// ── 闸门 ①：unknown tool → "Did you mean ...?" ─────────────

console.log('=== Gate 1: unknown tool ===');
const reg1 = new ToolRegistry([calc]);
const r1 = reg1.dispatch('calculator', { expression: '2+2' }, 'call-1');
console.log(`  dispatch('calculator', {expression:'2+2'})`);
console.log(`  → is_error: ${r1.is_error}`);
console.log(`  → ${r1.content}`);
console.log();

// ── 闸门 ②：schema 校验 ────────────────────────────────────

console.log('=== Gate 2: schema validation ===');
const reg2 = new ToolRegistry([calc]);

const r2a = reg2.dispatch('calc', {}, 'call-2');
console.log(`  dispatch('calc', {})`);
console.log(`  → is_error: ${r2a.is_error}`);
console.log(`  → ${r2a.content}`);

const r2b = reg2.dispatch('calc', { expression: 42 }, 'call-3');
console.log(`  dispatch('calc', {expression: 42})`);
console.log(`  → is_error: ${r2b.is_error}`);
console.log(`  → ${r2b.content}`);

const r2c = reg2.dispatch('calc', { expression: '2+2' }, 'call-4');
console.log(`  dispatch('calc', {expression: '2+2'})`);
console.log(`  → is_error: ${r2c.is_error}`);
console.log(`  → result: ${r2c.content}`);
console.log();

// ── 闸门 ③：loop detector ──────────────────────────────────

console.log('=== Gate 3: loop detector ===');
const reg3 = new ToolRegistry([calc]);
for (let i = 0; i < 5; i++) {
  const r = reg3.dispatch('calc', { expression: '1+1' }, `call-${i}`);
  const suffix = r.is_error
    ? 'LOOP: ' + r.content.substring(0, 50) + '...'
    : 'result=' + r.content;
  console.log(`  call ${i + 1}: ${suffix}`);
}
console.log();

// ── 闸门 ④：正常执行 ──────────────────────────────────────

console.log('=== Gate 4: json_query ===');
const reg4 = new ToolRegistry([json_query]);

const r4a = reg4.dispatch('json_query', {
  data: '{"user":{"name":"Alice","age":30}}',
  path: 'user.name',
}, 'call-q1');
console.log(`  query user.name → ${r4a.content}`);

const r4b = reg4.dispatch('json_query', {
  data: '{"user":{"name":"Alice","age":30}}',
  path: 'user.email',
}, 'call-q2');
console.log(`  query user.email → is_error: ${r4b.is_error}, ${r4b.content}`);

const r4c = reg4.dispatch('json_query', {
  data: '[10, 20, 30]',
  path: '1',
}, 'call-q3');
console.log(`  query array[1] → ${r4c.content}`);
console.log();

// ── 多错误一次性报告 ──────────────────────────────────────

console.log('=== Multiple errors at once ===');
const reg5 = new ToolRegistry([json_query]);
const r5 = reg5.dispatch('json_query', {}, 'call-multi');
console.log(`  dispatch('json_query', {})`);
console.log(`  → ${r5.content}`);
console.log();

// ── Agent 集成演示 ─────────────────────────────────────────

console.log('=== Agent with safe registry ===');

// MockProvider: Turn 1 → 模型拼错工具名 calculator，收到 Did you mean
//               Turn 2 → 模型纠正为 calc，参数名 expr 错了，收到 schema 错误
//               Turn 3 → 模型纠正参数名 → 成功
const provider = new MockProvider([
  { tool_name: 'calculator', tool_args: { expression: '1+2' }, tool_call_id: 't1' },
  { tool_name: 'calc', tool_args: { expr: '1+2' }, tool_call_id: 't2' },
  { tool_name: 'calc', tool_args: { expression: '1+2' }, tool_call_id: 't3' },
  { text: '1 + 2 = 3', is_final: true },
]);

const registry = new ToolRegistry([calc]);

console.log('  Running agent...');
let turn = 0;
const answer = await arun(provider, registry, 'What is 1 + 2?', {
  system: 'You are a calculator assistant.',
  onToolCall: ({ name, args }) => {
    turn++;
    console.log(`  Turn ${turn}: model calls ${name}(${JSON.stringify(args)})`);
  },
  onToolResult: (result) => {
    if (result.is_error) {
      console.log(`  → registry error: ${result.content.substring(0, 80)}...`);
    } else {
      console.log(`  → registry result: ${result.content}`);
    }
  },
});

console.log(`  Final answer: ${answer}`);
console.log();
console.log('Done — all 4 gates exercised.');
