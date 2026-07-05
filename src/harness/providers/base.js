/**
 * Provider 协议 — 第 5 章升级
 *
 * 相比第 3-4 章的变化：
 *   1. ToolCallRef — 把单数 tool_name/tool_args 升级为 tool_calls: ToolCallRef[]
 *      支持模型一次返回多个工具调用
 *   2. astream() — 异步流式协议（替代同步 complete）
 *   3. acomplete() — 便利方法：accumulate(astream(...))
 *
 * 向后兼容属性（tool_name / tool_args / tool_call_id）仍可用，
 * 但只返回第一个 tool call —— 第 13 章多调用时必须迁移。
 */

/**
 * 一次工具调用（Provider 还没来得及写入 transcript 时的形状）。
 * 和 messages.ToolCall 不同——那是 transcript 里的 block。
 *
 * @class ToolCallRef
 * @property {string} id
 * @property {string} name
 * @property {Record<string, *>} args
 */
export class ToolCallRef {
  /**
   * @param {string} id
   * @param {string} name
   * @param {Record<string, *>} args
   */
  constructor(id, name, args) {
    this.id = id;
    this.name = name;
    this.args = args;
  }
}

/**
 * ProviderResponse — 文本和工具调用的统一返回（第 5 章升级）。
 *
 * @class ProviderResponse
 */
export class ProviderResponse {
  /**
   * @param {object} [opts]
   * @param {string | null} [opts.text]
   * @param {ToolCallRef[]} [opts.toolCalls]
   * @param {string | null} [opts.reasoningText]
   * @param {Record<string,*>} [opts.reasoningMetadata]
   * @param {number} [opts.inputTokens]
   * @param {number} [opts.outputTokens]
   * @param {number} [opts.reasoningTokens]
   */
  constructor(opts = {}) {
    this.text = opts.text ?? null;

    // 向后兼容：单数 tool_name/tool_args/tool_call_id → ToolCallRef[]
    /** @type {ToolCallRef[]} */
    this.tool_calls = opts.toolCalls ?? [];
    if (this.tool_calls.length === 0 && (opts.tool_name || opts.tool_call_id)) {
      this.tool_calls = [
        new ToolCallRef(
          opts.tool_call_id ?? opts.toolCallId ?? 'call-0',
          opts.tool_name ?? 'unknown',
          opts.tool_args ?? opts.toolArgs ?? {},
        ),
      ];
    }

    this.reasoning_text = opts.reasoningText ?? opts.reasoning_text ?? null;
    this.reasoning_metadata = opts.reasoningMetadata ?? opts.reasoning_metadata ?? {};
    this.input_tokens = opts.inputTokens ?? opts.input_tokens ?? 0;
    this.output_tokens = opts.outputTokens ?? opts.output_tokens ?? 0;
    this.reasoning_tokens = opts.reasoningTokens ?? opts.reasoning_tokens ?? 0;
  }

  /** 模型调了工具时返回 true */
  get is_tool_call() {
    return this.tool_calls.length > 0;
  }

  /** 模型给出最终答案时返回 true */
  get is_final() {
    return this.text !== null && this.tool_calls.length === 0;
  }

  // ── 向后兼容属性（只返回第一个 tool call）──────

  /** @returns {string | null} */
  get tool_call_id() {
    return this.tool_calls.length > 0 ? this.tool_calls[0].id : null;
  }

  /** @returns {string | null} */
  get tool_name() {
    return this.tool_calls.length > 0 ? this.tool_calls[0].name : null;
  }

  /** @returns {Record<string,*> | null} */
  get tool_args() {
    return this.tool_calls.length > 0 ? this.tool_calls[0].args : null;
  }
}

/**
 * Provider 协议（第 5 章）。
 *
 * astream 返回异步迭代器，产出 StreamEvent。
 *
 * @typedef {object} Provider
 * @property {string} name
 * @property {(transcript: object, tools: object[]) => AsyncIterator<import('./events.js').StreamEvent>} astream
 * @property {(transcript: object, tools: object[]) => Promise<ProviderResponse>} [acomplete]
 */
