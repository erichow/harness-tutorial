/**
 * Tool 协议 — 第 4 章
 *
 * Tool = 一份契约，模型能猜到的名字 + 模型能读懂的描述 +
 *       模型必须匹配的 schema + 调用的 callable + 副作用画像。
 *
 * SideEffect 标签（现在就声明，第 14 章 PermissionManager 和第 21 章
 * Checkpointer 靠它决定怎么对待这个工具）：
 *   read    — 只读状态。可重试、可并行。
 *   write   — 改本地状态。通常幂等可重试。
 *   network — 外部服务。重试需要厂商侧的幂等。
 *   mutate  — 外部可见的、不可逆副作用。可能需要人类批准。
 *
 * @typedef {'read' | 'write' | 'network' | 'mutate'} SideEffect
 */

/**
 * 一个暴露给模型的 callable。
 *
 * @class Tool
 * @property {string} name         — 模型用它来叫你的稳定标识符
 * @property {string} description  — 模型读的契约文本。必须声明 scope、前置条件、副作用
 * @property {object} input_schema — JSON Schema for arguments dict
 * @property {(...args: any[]) => string} run — callable，接受 kwargs 返回字符串
 * @property {Set<SideEffect>} sideEffects — 声明的效果标签
 */
export class Tool {
  /**
   * @param {object} opts
   * @param {string} opts.name
   * @param {string} opts.description
   * @param {object} opts.inputSchema
   * @param {(...args: any[]) => string} opts.run
   * @param {Set<SideEffect> | SideEffect[]} [opts.sideEffects]
   */
  constructor({ name, description, inputSchema, run, sideEffects }) {
    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
    /**
     * 执行工具。args 是 schema 定义的 kwargs dict。
     * 按值顺序展开为位置参数（和 Python **args 等价）。
     */
    this._fn = run;
    this.sideEffects = new Set(sideEffects ?? []);
  }

  /**
   * 执行工具。args 值按序展开为位置参数。
   * @param {Record<string, *>} args
   * @returns {string}
   */
  run(args) {
    return String(this._fn(args));
  }

  /**
   * Provider 期望的 dict 形状（Anthropic-flavored）。
   * @returns {{ name: string, description: string, input_schema: object }}
   */
  schemaForProvider() {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.inputSchema,
    };
  }
}
