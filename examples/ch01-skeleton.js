/**
 * 第 1 章示例 — 验证项目骨架
 *
 * 运行: node examples/ch01-skeleton.js
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf-8'),
);

console.log('╔══════════════════════════════════════╗');
console.log('║   🏗️  Agent Harness — 项目骨架就绪  ║');
console.log('╚══════════════════════════════════════╝');
console.log();

console.log(`📦 ${pkg.name} v${pkg.version}`);
console.log(`📍 入口:     ${pkg.main}`);
console.log(`🟢 Node:     ${process.version}`);
console.log();

console.log('📋 后续章节将建造的子系统：');
console.log();

const roadmap = [
  ['第 2 章', 'agent.js',       'Agent 概念与最小循环 (run)'],
  ['第 3 章', 'messages.js',    '有类型的消息系统 (4 种 Block)'],
  ['第 3 章', 'providers/',     'Provider 适配器 (base + mock)'],
  ['第 4 章', 'tools/',         '工具协议与 ToolRegistry'],
  ['第 5 章', 'agent.js',       '流式循环 (arun + StreamEvent)'],
  ['第 6 章', 'tools/',         '安全执行：4 道闸门'],
  ['第 7 章', 'context/',       '上下文窗口记账 (Accountant)'],
  ['第 8 章', 'context/',       '压缩策略 (Compactor)'],
  ['第 9 章', 'context/',       '外部草稿本 (Scratchpad)'],
  ['第 10 章','context/',       'BM25 检索 (DocumentIndex)'],
  ['第 11 章','tools/',         '为模型设计的工具 (ACI)'],
  ['第 12 章','tools/',         '动态工具加载 (ToolCatalog)'],
  ['第 13 章','mcp/',           'MCP 外部工具'],
  ['第 14 章','permissions/',   '沙箱与权限'],
  ['第 15 章','agent.js',       '子智能体 (Sub-agent)'],
  ['第 16 章','plans/',         '结构化计划 (Planner)'],
  ['第 17 章','agent.js',       '并行执行'],
  ['第 18 章','observability/', '可观测性 (OpenTelemetry)'],
  ['第 19 章','evals/',         '评测 (Evals)'],
  ['第 20 章','cost/',          '成本控制'],
  ['第 21 章','checkpoint/',    '可恢复与持久化'],
  ['第 22 章','-',              '跨 provider 迁移'],
];

for (const [ch, file, desc] of roadmap) {
  const done = file === '-' ? '  ' : '⬚';
  console.log(`  ${done}  ${ch.padEnd(6)} ${file.padEnd(17)} ${desc}`);
}

console.log();
console.log('🧪 运行测试:  npm test');
console.log('📖 下一章:    第 2 章 — Agent 概念与最小循环');
