/**
 * ToolRegistry — 第 4-6 章
 *
 * 持有工具、给 provider 渲染 schema、按名分发调用。
 *
 * 第 6 章升级：4 道闸门 dispatch
 *   ① unknown tool → "Did you mean ...?" (Levenshtein 建议)
 *   ② schema 校验 → 结构化 ValidationError 列表
 *   ③ loop detector → (name, sorted-args) 精确匹配 ≥3 次
 *   ④ execute → tool.run(**args)
 *
 * 核心设计：
 *   dispatch 返回 ToolResult，永不抛异常 —— loop 不再需要
 *   为每次调用包 try/except。未知工具不是异常，是模型能读懂的
 *   结构化错误。
 */

import { ToolResult } from '../messages.js';
import { Tool } from './base.js';
import { validate } from './validation.js';

/** 同一 (name, args) 连续这么多次 → 拦截 */
const MAX_REPEAT_CALLS = 3;

export class ToolRegistry {
  /**
   * @param {Tool[]} [tools]
   */
  constructor(tools) {
    /** @type {Map<string, Tool>} */
    this._tools = new Map();
    /** @type {Array<[string, string]>} — (name, JSON-sorted args) */
    this._callHistory = [];
    for (const t of tools || []) {
      this.add(t);
    }
  }

  /**
   * 注册一个工具。重名抛错。
   * @param {Tool} tool
   */
  add(tool) {
    if (this._tools.has(tool.name)) {
      throw new Error(`duplicate tool name: ${tool.name}`);
    }
    this._tools.set(tool.name, tool);
  }

  /**
   * 给 provider 用的 schema 列表（Anthropic-flavored）。
   * @returns {object[]}
   */
  schemas() {
    const result = [];
    for (const t of this._tools.values()) {
      result.push(t.schemaForProvider());
    }
    return result;
  }

  /**
   * 按名分发工具调用 — 4 道闸门。
   * 永不抛异常——错误作为 is_error ToolResult 返回。
   *
   * @param {string} name     — 工具名
   * @param {object} args     — 参数 dict
   * @param {string} callId   — provider 的工具调用 ID
   * @returns {import('../messages.js').ToolResultType}
   */
  dispatch(name, args, callId) {
    // 闸门 ①：未知工具 → "Did you mean ...?"
    if (!this._tools.has(name)) {
      return this._unknownTool(name, callId);
    }

    const tool = this._tools.get(name);

    // 闸门 ②：schema 校验
    const errors = validate(args, tool.inputSchema);
    if (errors.length > 0) {
      return this._validationFailure(name, errors, callId);
    }

    // 记录 + 闸门 ③：loop 检测
    this._record(name, args);
    const loopResult = this._checkLoop(name, args, callId);
    if (loopResult !== null) {
      return loopResult;
    }

    // 闸门 ④：执行
    try {
      const content = tool.run(args);
      return ToolResult(callId, content);
    } catch (e) {
      return ToolResult(
        callId,
        `${name} raised ${e.constructor.name}: ${e.message}`,
        true,
      );
    }
  }

  // ── 闸门 helpers ──────────────────────────────────────────

  /**
   * 未知工具 → 结构化错误 + "Did you mean ...?" 建议。
   * @param {string} name
   * @param {string} callId
   * @returns {import('../messages.js').ToolResultType}
   */
  _unknownTool(name, callId) {
    const available = [...this._tools.keys()];
    const close = _closestMatch(name, available);
    const suggestion = close ? ` Did you mean '${close}'?` : '';
    return ToolResult(
      callId,
      `unknown tool: '${name}'.${suggestion} Available: ${JSON.stringify(available.sort())}`,
      true,
    );
  }

  /**
   * 校验失败 → 结构化错误列表。
   * @param {string} name
   * @param {import('./validation.js').ValidationError[]} errors
   * @param {string} callId
   * @returns {import('../messages.js').ToolResultType}
   */
  _validationFailure(name, errors, callId) {
    const summary = errors.map(e => e.toString()).join('; ');
    return ToolResult(
      callId,
      `${name}: invalid arguments. ${summary}`,
      true,
    );
  }

  /**
   * 记录调用历史，保留最近 100 条。
   * @param {string} name
   * @param {Record<string, *>} args
   */
  _record(name, args) {
    this._callHistory.push([name, JSON.stringify(args, Object.keys(args).sort())]);
    if (this._callHistory.length > 100) {
      this._callHistory = this._callHistory.slice(-100);
    }
  }

  /**
   * 循环检测：同一 (name, sorted-args) 连续 MAX_REPEAT_CALLS → 拦截。
   * @param {string} name
   * @param {Record<string, *>} args
   * @param {string} callId
   * @returns {import('../messages.js').ToolResultType | null}
   */
  _checkLoop(name, args, callId) {
    const key = JSON.stringify(args, Object.keys(args).sort());
    let repeats = 0;
    for (let i = this._callHistory.length - 1; i >= 0; i--) {
      const [hName, hKey] = this._callHistory[i];
      if (hName === name && hKey === key) {
        repeats++;
      } else {
        break; // 只数连续重复
      }
    }
    if (repeats >= MAX_REPEAT_CALLS) {
      return ToolResult(
        callId,
        [
          `tool-call loop detected: ${name} called with identical`,
          `arguments ${MAX_REPEAT_CALLS} times in a row.`,
          'Try a different approach or different arguments, or',
          'stop and return your current best answer.',
        ].join(' '),
        true,
      );
    }
    return null;
  }

  /**
   * 工具数量。
   * @returns {number}
   */
  get size() {
    return this._tools.size;
  }
}

// ── "Did you mean ...?" — difflib.get_close_matches 等价 ──

/**
 * 最长公共子序列长度。
 */
function _lcsLen(a, b) {
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const curr = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1] + 1
        : Math.max(prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * SequenceMatcher.ratio: 2 * matches / (len(a) + len(b))
 */
function _ratio(a, b) {
  const matches = _lcsLen(a, b);
  const total = a.length + b.length;
  return total === 0 ? 1.0 : (2 * matches) / total;
}

/**
 * difflib.get_close_matches 的等价实现。
 * 找 ratio ≥ cutoff 的最佳匹配。
 *
 * @param {string} query
 * @param {string[]} candidates
 * @param {number} [cutoff=0.5]
 * @returns {string | null}
 */
function _closestMatch(query, candidates, cutoff = 0.5) {
  let best = null;
  let bestRatio = cutoff;
  for (const c of candidates) {
    const r = _ratio(query, c);
    if (r >= bestRatio) {
      bestRatio = r;
      best = c;
    }
  }
  return best;
}
