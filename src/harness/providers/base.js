/**
 * Provider 协议 — 第 3 章升级
 *
 * 相比第 2 章加了 3 样：
 *   1. token 计数 — provider 知道，记账器（第 7 章）不用猜
 *   2. reasoning_* — thinking/reasoning 一等公民
 *   3. name 字段 — 让日志和追踪能识别哪家 provider
 *
 * 去掉了 kind 判别字段，换成 is_final / is_tool_call 两个属性。
 */

/**
 * ProviderResponse — 文本和工具调用的统一返回。
 *
 * is_final  → text 有效（模型给出最终答案）
 * is_tool_call → tool_name/tool_args/tool_call_id 有效
 * reasoning_* 与上面正交——可能同时出现。
 *
 * @class ProviderResponse
 */
export class ProviderResponse {
  /**
   * @param {object} [opts]
   * @param {string | null} [opts.text]
   * @param {string | null} [opts.tool_call_id]
   * @param {string | null} [opts.tool_name]
   * @param {Record<string,*> | null} [opts.tool_args]
   * @param {string | null} [opts.reasoning_text]
   * @param {Record<string,*>} [opts.reasoning_metadata]
   * @param {number} [opts.input_tokens]
   * @param {number} [opts.output_tokens]
   * @param {number} [opts.reasoning_tokens]
   */
  constructor(opts = {}) {
    this.text = opts.text ?? null;
    this.tool_call_id = opts.tool_call_id ?? null;
    this.tool_name = opts.tool_name ?? null;
    this.tool_args = opts.tool_args ?? null;
    this.reasoning_text = opts.reasoning_text ?? null;
    this.reasoning_metadata = opts.reasoning_metadata ?? {};
    this.input_tokens = opts.input_tokens ?? 0;
    this.output_tokens = opts.output_tokens ?? 0;
    this.reasoning_tokens = opts.reasoning_tokens ?? 0;
  }

  /** 模型调了工具时返回 true */
  get is_tool_call() {
    return this.tool_name !== null;
  }

  /** 模型给出最终答案时返回 true */
  get is_final() {
    return this.text !== null && this.tool_name === null;
  }
}
