/**
 * tests/ch06-validation.test.js — 第 6 章：安全工具执行
 *
 * 覆盖 ToolRegistry 的 4 道闸门：
 *   ① unknown tool → "Did you mean ...?"
 *   ② schema 校验 → 结构化错误
 *   ③ loop detector → 3 次连续重复 → 拦截
 *   ④ happy path → 正常执行
 */

import { describe, it, expect } from 'vitest';
import { ToolRegistry, calc, json_query } from '../src/harness/tools/index.js';
import { Tool } from '../src/harness/tools/base.js';

// ── 共享 fixture ──────────────────────────────────────────

function makeRegistry() {
  return new ToolRegistry([calc, json_query]);
}

// ── 闸门 ①：unknown tool ──────────────────────────────────

describe('gate 1: unknown tool', () => {
  it('returns error with Did you mean suggestion for close name', () => {
    const reg = makeRegistry();
    const result = reg.dispatch('calculator', { expression: '2+2' }, 'call-1');
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("Did you mean 'calc'?");
  });

  it('returns error without suggestion for unrelated name', () => {
    const reg = makeRegistry();
    const result = reg.dispatch('fly_to_moon', {}, 'call-1');
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('unknown tool');
    expect(result.content).not.toContain('Did you mean');
  });

  it('lists available tools', () => {
    const reg = makeRegistry();
    const result = reg.dispatch('xyz', {}, 'call-2');
    expect(result.content).toContain('Available:');
    expect(result.content).toContain('calc');
    expect(result.content).toContain('json_query');
  });
});

// ── 闸门 ②：schema 校验 ──────────────────────────────────

describe('gate 2: schema validation', () => {
  it('missing required property → structured error', () => {
    const reg = makeRegistry();
    const result = reg.dispatch('calc', {}, 'call-1');
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("calc: invalid arguments.");
    expect(result.content).toContain('expression');
    expect(result.content).toContain('required');
  });

  it('wrong type → structured error mentioning type', () => {
    const reg = makeRegistry();
    const result = reg.dispatch('calc', { expression: 42 }, 'call-1');
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('invalid arguments');
    // ajv says "must be string" for type mismatch
    const lower = result.content.toLowerCase();
    expect(lower.includes('string') || lower.includes('str')).toBe(true);
  });

  it('multiple errors all reported at once', () => {
    const reg = makeRegistry();
    // json_query requires both 'data' and 'path'
    const result = reg.dispatch('json_query', {}, 'call-1');
    expect(result.is_error).toBe(true);
    // should mention both missing fields
    expect(result.content).toContain('data');
    expect(result.content).toContain('path');
  });

  it('valid args pass validation', () => {
    const reg = makeRegistry();
    const result = reg.dispatch('calc', { expression: '2+2' }, 'call-1');
    expect(result.is_error).toBe(false);
    expect(result.content).toBe('4');
  });
});

// ── 闸门 ③：loop detector ────────────────────────────────

describe('gate 3: loop detection', () => {
  it('detects 3 identical consecutive calls', () => {
    const reg = makeRegistry();
    // 前两次通过
    reg.dispatch('calc', { expression: '1+1' }, 'call-1');
    reg.dispatch('calc', { expression: '1+1' }, 'call-2');
    reg.dispatch('calc', { expression: '1+1' }, 'call-3');
    // 第四次被拦截
    const result = reg.dispatch('calc', { expression: '1+1' }, 'call-4');
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('tool-call loop');
  });

  it('exact match — different args are NOT a loop', () => {
    const reg = makeRegistry();
    reg.dispatch('calc', { expression: '1+1' }, 'call-1');
    reg.dispatch('calc', { expression: '1+2' }, 'call-2');
    reg.dispatch('calc', { expression: '1+3' }, 'call-3');
    // 参数不同 → 不触发 loop
    const result = reg.dispatch('calc', { expression: '1+4' }, 'call-4');
    expect(result.is_error).toBe(false);
  });

  it('same args but different tool is NOT a loop', () => {
    const reg = makeRegistry();
    reg.dispatch('calc', { expression: '1+1' }, 'call-1');
    reg.dispatch('json_query', { data: '{"a":1}', path: 'a' }, 'call-2');
    reg.dispatch('calc', { expression: '1+1' }, 'call-3');
    // 中间换了工具 → 连续链断了 → 不触发
    const result = reg.dispatch('calc', { expression: '1+1' }, 'call-4');
    expect(result.is_error).toBe(false);
  });

  it('interrupted by different call resets the counter', () => {
    const reg = makeRegistry();
    reg.dispatch('calc', { expression: '1+1' }, 'call-1');
    reg.dispatch('calc', { expression: '1+1' }, 'call-2');
    reg.dispatch('calc', { expression: '2+2' }, 'call-3'); // 不同参数 — 重置
    reg.dispatch('calc', { expression: '1+1' }, 'call-4');
    reg.dispatch('calc', { expression: '1+1' }, 'call-5');
    reg.dispatch('calc', { expression: '1+1' }, 'call-6');
    const result = reg.dispatch('calc', { expression: '1+1' }, 'call-7');
    expect(result.is_error).toBe(true); // 重新积累到 3
  });
});

// ── 闸门 ④：happy path ────────────────────────────────────

describe('gate 4: happy path', () => {
  it('calc works', () => {
    const reg = makeRegistry();
    const result = reg.dispatch('calc', { expression: '2+2' }, 'call-1');
    expect(result.is_error).toBe(false);
    expect(result.content).toBe('4');
  });

  it('json_query works', () => {
    const reg = makeRegistry();
    const result = reg.dispatch('json_query', {
      data: '{"user":{"name":"Alice","age":30}}',
      path: 'user.name',
    }, 'call-1');
    expect(result.is_error).toBe(false);
    expect(result.content).toBe('"Alice"');
  });

  it('json_query array index works', () => {
    const reg = makeRegistry();
    const result = reg.dispatch('json_query', {
      data: '[10, 20, 30]',
      path: '1',
    }, 'call-1');
    expect(result.is_error).toBe(false);
    expect(result.content).toBe('20');
  });

  it('json_query path not found returns error from tool', () => {
    const reg = makeRegistry();
    const result = reg.dispatch('json_query', {
      data: '{"a":1}',
      path: 'b',
    }, 'call-1');
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('path not found');
  });
});
