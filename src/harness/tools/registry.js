/**
 * ToolRegistry — 第 4 章
 *
 * 持有工具、给 provider 渲染 schema、按名分发调用。
 *
 * 核心设计：
 *   dispatch 返回 ToolResult，永不抛异常 —— loop 不再需要
 *   为每次调用包 try/except。未知工具不是异常，是模型能读懂的
 *   结构化错误。
 *
 *   错误消息会列出可用工具 —— 模型可以用它在下回合纠正自己。
 */

import { ToolResult } from '../messages.js';
import { Tool } from './base.js';

export class ToolRegistry {
  /**
   * @param {Tool[]} [tools]
   */
  constructor(tools) {
    /** @type {Map<string, Tool>} */
    this._tools = new Map();
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
   * 按名分发工具调用。永不抛异常——错误作为 is_error ToolResult 返回。
   *
   * @param {string} name     — 工具名
   * @param {object} args     — 参数 dict
   * @param {string} callId   — provider 的工具调用 ID
   * @returns {import('../messages.js').ToolResultType}
   */
  dispatch(name, args, callId) {
    if (!this._tools.has(name)) {
      const available = [...this._tools.keys()].sort();
      return ToolResult(
        callId,
        `unknown tool: ${name}. available: ${JSON.stringify(available)}`,
        true,
      );
    }

    const tool = this._tools.get(name);

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

  /**
   * 工具数量。
   * @returns {number}
   */
  get size() {
    return this._tools.size;
  }
}
