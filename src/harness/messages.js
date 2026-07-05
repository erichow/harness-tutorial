/**
 * 消息系统 — 第 2-3 章
 *
 * 第 2 章（最小版）：Message = { role, content } —— 够跑循环
 * 第 3 章（完整版）：引入 4 种 Block —— TextBlock / ToolCallBlock / ToolResultBlock / ReasoningBlock
 */

/**
 * @typedef {'user' | 'assistant' | 'system'} Role
 *
 * @typedef {object} Message
 * @property {Role} role
 * @property {string} content
 *
 * @typedef {Message[]} Transcript
 */

export {};  // 目前无导出值；类型通过 JSDoc 定义，第 3 章会导出更多
