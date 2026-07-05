/**
 * 第 4 章测试 — 工具协议
 *
 * 覆盖 Tool 数据类、装饰器 schema 推导、ToolRegistry、
 * 4 个标准工具、升级后的 loop（registry 替代裸 tools）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { Tool, tool, ToolRegistry } from '../src/harness/tools/index.js';
import { calc, read_file, write_file, bash } from '../src/harness/tools/std.js';
import { ProviderResponse } from '../src/harness/providers/base.js';
import { MockProvider } from '../src/harness/providers/mock.js';
import { run } from '../src/harness/agent.js';

// ── §4.2: Tool 数据类 ────────────────────────────────────

describe('Tool 数据类', () => {
  it('Tool 携带 name / description / input_schema / run / sideEffects', () => {
    const t = new Tool({
      name: 'calc',
      description: 'Evaluate an expression.',
      inputSchema: { type: 'object', properties: { expr: { type: 'string' } }, required: ['expr'] },
      run: ({ expr }) => String(eval(expr)),
      sideEffects: ['read'],
    });

    expect(t.name).toBe('calc');
    expect(t.description).toBe('Evaluate an expression.');
    expect(t.inputSchema.required).toEqual(['expr']);
    expect(t.run({ expr: '2+2' })).toBe('4');
    expect(t.sideEffects.has('read')).toBe(true);
  });

  it('sideEffects 默认为空 Set', () => {
    const t = new Tool({
      name: 'noop',
      description: 'No side effects.',
      inputSchema: { type: 'object', properties: {} },
      run: () => 'ok',
    });
    expect(t.sideEffects.size).toBe(0);
  });

  it('schemaForProvider 返回 Anthropic-flavored dict', () => {
    const t = new Tool({
      name: 'calc',
      description: 'Eval',
      inputSchema: { type: 'object', properties: {} },
      run: () => '4',
    });
    const s = t.schemaForProvider();
    expect(s).toEqual({
      name: 'calc',
      description: 'Eval',
      input_schema: { type: 'object', properties: {} },
    });
  });
});

// ── §4.3: 装饰器 schema 推导 ────────────────────────────

describe('tool() 装饰器', () => {
  it('从函数名推断 name（显式传 description）', () => {
    function greet(/** @type {string} */ name) { return `Hello ${name}`; }
    const t = tool({ description: 'Greet the user.' })(greet);
    expect(t.name).toBe('greet');
    expect(t.description).toBe('Greet the user.');
  });

  it('从 @param 推断 schema（显式传 description）', () => {
    function hi(/** @type {string} */ name, /** @type {number} */ age) { return `${name} is ${age}`; }
    const t = tool({ description: 'Say hello.' })(hi);
    const s = t.inputSchema;
    expect(s.properties.name).toEqual({ type: 'string' });
    expect(s.properties.age).toEqual({ type: 'number' });
    expect(s.required).toEqual(['name', 'age']);
  });

  it('带默认值的参数不在 required 里（显式传 description）', () => {
    function cmd(/** @type {string} */ command, timeout = 30) { return command; }
    const t = tool({ description: 'Run command.' })(cmd);
    expect(t.inputSchema.required).toEqual(['command']);
  });

  it('显式覆盖 name 和 sideEffects（显式传 description）', () => {
    function add(a) { return a + 1; }
    const t = tool({ name: 'increment', description: 'Increment.', sideEffects: ['mutate'] })(add);
    expect(t.name).toBe('increment');
    expect(t.sideEffects.has('mutate')).toBe(true);
  });

  it('没有 docstring → 抛错', () => {
    function f(x) { return x; }
    expect(() => tool()(f)).toThrow(/has no description/);
  });
});

// ── §4.4: ToolRegistry ────────────────────────────────────

describe('ToolRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('add + schemas', () => {
    const t = new Tool({
      name: 'echo', description: 'Echo back', inputSchema: { type: 'object', properties: {} },
      run: () => 'echo',
    });
    registry.add(t);
    expect(registry.schemas()).toHaveLength(1);
    expect(registry.schemas()[0].name).toBe('echo');
  });

  it('重复 tool name → 抛错', () => {
    const t = new Tool({ name: 'x', description: 'x', inputSchema: { type: 'object', properties: {} }, run: () => '' });
    registry.add(t);
    expect(() => registry.add(t)).toThrow(/duplicate tool name/);
  });

  it('dispatch 正常调用', () => {
    registry.add(new Tool({
      name: 'add', description: 'Add two numbers',
      inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
      run: ({ a, b }) => String(a + b),
    }));
    const result = registry.dispatch('add', { a: 1, b: 2 }, 'call-1');
    expect(result.is_error).toBe(false);
    expect(result.content).toBe('3');
  });

  it('dispatch unknown tool → is_error + 列出可用工具', () => {
    registry.add(new Tool({
      name: 'calc', description: 'Calc', inputSchema: { type: 'object', properties: {} }, run: () => '4',
    }));
    const result = registry.dispatch('calculator', {}, 'call-1');
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('unknown tool');
    expect(result.content).toContain('calc');
  });

  it('dispatch tool throws → is_error 不崩', () => {
    registry.add(new Tool({
      name: 'crash', description: 'Always crashes',
      inputSchema: { type: 'object', properties: {} },
      run: () => { throw new Error('BOOM'); },
    }));
    const result = registry.dispatch('crash', {}, 'call-1');
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('BOOM');
  });

  it('size', () => {
    expect(registry.size).toBe(0);
    const t = new Tool({ name: 'a', description: 'a', inputSchema: { type: 'object', properties: {} }, run: () => '' });
    registry.add(t);
    expect(registry.size).toBe(1);
  });
});

// ── §4.5: 升级后的 loop ──────────────────────────────────

describe('第 4 章 loop — 用 ToolRegistry', () => {
  it('calculator 两个回合（和第 2 章一样，但用 registry）', () => {
    const mock = new MockProvider([
      new ProviderResponse({ tool_name: 'calc', tool_args: { expression: '2 + 2' }, tool_call_id: 'call-1' }),
      new ProviderResponse({ text: '2 + 2 is 4.' }),
    ]);

    const registry = new ToolRegistry([calc]);

    const result = run(mock, registry, 'What is 2 + 2?');
    expect(result).toBe('2 + 2 is 4.');
  });

  it('unknown tool → registry 返回 is_error，模型自己纠正', () => {
    const reg = new ToolRegistry([
      new Tool({
        name: 'echo', description: 'Echo', inputSchema: { type: 'object', properties: {} },
        run: () => 'echoed',
      }),
    ]);

    const mock = new MockProvider([
      new ProviderResponse({ tool_name: 'nosuchtool', tool_args: {}, tool_call_id: 'call-1' }),
      new ProviderResponse({ text: 'I give up.' }),
    ]);

    const result = run(mock, reg, 'Do something');
    expect(result).toBe('I give up.');
  });

  it('tool throws → registry 返回 is_error，不崩', () => {
    const reg = new ToolRegistry([
      new Tool({
        name: 'crash', description: 'Crash', inputSchema: { type: 'object', properties: {} },
        run: () => { throw new Error('BOOM'); },
      }),
    ]);

    const mock = new MockProvider([
      new ProviderResponse({ tool_name: 'crash', tool_args: {}, tool_call_id: 'call-1' }),
      new ProviderResponse({ text: 'Recovered.' }),
    ]);

    const result = run(mock, reg, 'crash');
    expect(result).toBe('Recovered.');
  });

  it('纯文本响应（无工具）', () => {
    const mock = new MockProvider([new ProviderResponse({ text: 'Hello!' })]);
    const reg = new ToolRegistry();
    expect(run(mock, reg, 'Hi')).toBe('Hello!');
  });

  it('超过 MAX_ITERATIONS → throw', () => {
    const calls = Array.from({ length: 25 }, (_, i) =>
      new ProviderResponse({ tool_name: 'echo', tool_args: { msg: String(i) }, tool_call_id: `call-${i}` })
    );
    const reg = new ToolRegistry([
      new Tool({
        name: 'echo', description: 'Echo', inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
        run: ({ msg }) => msg,
      }),
    ]);
    expect(() => run(new MockProvider(calls), reg, 'loop')).toThrow(/did not finish/);
  });
});

// ── §4.6: 标准工具集 ─────────────────────────────────────

describe('标准工具集', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch04-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calc — 正常算术', () => {
    expect(calc.run({ expression: '2 + 3' })).toBe('5');
    expect(calc.run({ expression: '10 * (2 + 3)' })).toBe('50');
  });

  it('calc — 拒绝危险表达式', () => {
    expect(() => calc.run({ expression: '__import__("os").system("rm")' }))
      .toThrow(/forbidden/);
    expect(() => calc.run({ expression: 'open("/etc/passwd")' }))
      .toThrow(/forbidden/);
  });

  it('read_file — 读文件', () => {
    const p = path.join(tmpDir, 'hello.txt');
    fs.writeFileSync(p, 'hello world');
    expect(read_file.run({ path: p })).toBe('hello world');
  });

  it('write_file — 写文件', () => {
    const p = path.join(tmpDir, 'output.txt');
    const result = write_file.run({ path: p, content: 'test content' });
    expect(result).toContain('wrote');
    expect(fs.readFileSync(p, 'utf-8')).toBe('test content');
  });

  it('write_file — 自动创建父目录', () => {
    const p = path.join(tmpDir, 'deep', 'nested', 'file.txt');
    write_file.run({ path: p, content: 'data' });
    expect(fs.existsSync(p)).toBe(true);
  });

  it('bash — echo', () => {
    const result = bash.run({ command: 'echo hello' });
    expect(result).toContain('exit=0');
    expect(result).toContain('hello');
  });

  it('bash — 失败命令', () => {
    const result = bash.run({ command: 'exit 1' });
    expect(result).toContain('exit=1');
  });
});
