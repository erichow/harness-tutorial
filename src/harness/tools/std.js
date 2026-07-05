/**
 * 标准工具集 — 第 4 章
 *
 * 4 个工具，每个都有理由：
 *   calc       — 安全的算术（正则防代码注入）
 *   read_file  — 读文件（read）
 *   write_file — 写文件（write）
 *   bash       — 跑 shell 命令（read + network）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { Tool } from './base.js';

// ── calc ──────────────────────────────────────────────────

export const calc = new Tool({
  name: 'calc',
  description: [
    'Evaluate a Python-style arithmetic expression.',
    '',
    'Accepts: +, -, *, /, **, parentheses, integer and float literals.',
    'Does NOT allow: function calls, imports, attribute access,',
    'subscripts, comprehensions, names.',
    '',
    'Side effects: none. Safe to retry.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: { expression: { type: 'string' } },
    required: ['expression'],
  },
  run: ({ expression }) => {
    const SAFE_RE = /^[\d\s+\-*/%().eE]+$/;
    if (!SAFE_RE.test(expression)) {
      throw new Error(
        `forbidden characters in expression. Only digits, operators, parentheses, spaces, and dots allowed.`,
      );
    }
    const result = new Function(`"use strict"; return (${expression})`)();
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error(`expression did not evaluate to a finite number: ${result}`);
    }
    return String(result);
  },
  sideEffects: ['read'],
});

// ── read_file ─────────────────────────────────────────────

export const read_file = new Tool({
  name: 'read_file',
  description: [
    'Read a UTF-8 text file and return its contents.',
    '',
    'path: relative or absolute filesystem path.',
    'Side effects: reads the filesystem, no writes.',
    '',
    'Returns the file contents. For very large files, prefer a viewport reader.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  },
  run: ({ path: filePath }) => fs.readFileSync(filePath, 'utf-8'),
  sideEffects: ['read'],
});

// ── write_file ────────────────────────────────────────────

export const write_file = new Tool({
  name: 'write_file',
  description: [
    'Overwrite a file with the given content.',
    '',
    'path: relative or absolute filesystem path. The file will be CREATED',
    'or OVERWRITTEN; its previous contents are lost.',
    '',
    'Side effects: writes to the filesystem. NOT safe to call twice with',
    'different content expecting either version to survive.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['path', 'content'],
  },
  run: ({ path: filePath, content }) => {
    const dir = path.dirname(filePath);
    if (dir && dir !== '.') {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return `wrote ${content.length} bytes to ${filePath}`;
  },
  sideEffects: ['write'],
});

// ── bash ──────────────────────────────────────────────────

export const bash = new Tool({
  name: 'bash',
  description: [
    'Run a shell command in the current working directory.',
    '',
    'command: a shell command line.',
    'timeout_seconds: hard time limit; default 30, cap 300.',
    '',
    'Side effects: MAY read/write files, MAY make network calls —',
    'depends on the command. Caller is responsible for the blast radius.',
    '',
    'Returns combined stdout+stderr with the exit code appended.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      timeout_seconds: { type: 'number' },
    },
    required: ['command'],
  },
  run: ({ command, timeout_seconds: timeoutSeconds = 30 }) => {
    const timeout = Math.min(Number(timeoutSeconds) || 30, 300);
    try {
      const result = execSync(command, {
        timeout: timeout * 1000,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        shell: true,
      });
      return `exit=0\n---stdout---\n${result}`;
    } catch (e) {
      return [
        `exit=${e.status ?? -1}`,
        `---stdout---`,
        e.stdout || '',
        `---stderr---`,
        e.stderr || '',
      ].join('\n');
    }
  },
  sideEffects: ['read', 'network'],
});

// ── json_query ────────────────────────────────────────────

export const json_query = new Tool({
  name: 'json_query',
  description: [
    'Query JSON data with a simple dot-path expression.',
    '',
    'data: a JSON string (object or array).',
    'path: a dot-separated path; e.g. "items.0.name" or "user.email".',
    'Array indices are integers; object keys are dot-separated.',
    '',
    'Returns the queried value as JSON, or an error string if',
    'the path does not exist.',
    '',
    'Side effects: none.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: 'string' },
      path: { type: 'string' },
    },
    required: ['data', 'path'],
  },
  run: ({ data, path: jsonPath }) => {
    const obj = JSON.parse(data);
    let current = obj;
    for (const part of jsonPath.split('.')) {
      if (Array.isArray(current)) {
        current = current[parseInt(part, 10)];
      } else if (typeof current === 'object' && current !== null) {
        if (!(part in current)) {
          throw new Error(`path not found: ${part}`);
        }
        current = current[part];
      } else {
        throw new Error(`cannot index ${typeof current} with ${part}`);
      }
    }
    return JSON.stringify(current);
  },
  sideEffects: ['read'],
});
