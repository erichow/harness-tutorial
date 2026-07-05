/**
 * Mock Provider — 第 5 章升级
 *
 * 支持 astream() 异步流式接口。
 * 每条 mock 响应展开为 TextDelta + Completed 事件序列。
 * 工具调用响应展开为 ToolCallStart + ToolCallDelta + Completed。
 */

import { ProviderResponse } from './base.js';
import { TextDelta, ToolCallStart, ToolCallDelta, Completed, ReasoningDelta } from './events.js';

export class MockProvider {
  /**
   * @param {ProviderResponse[]} responses
   */
  constructor(responses) {
    this.name = 'mock';
    this._responses = responses.map(r =>
      r instanceof ProviderResponse ? r : new ProviderResponse(r),
    );
    this._index = 0;
  }

  /**
   * 异步流式 — 把 ProviderResponse 展开为事件序列。
   * @param {object} _transcript
   * @param {object[]} _tools
   * @returns {AsyncGenerator<import('./events.js').StreamEvent>}
   */
  async *astream(_transcript, _tools) {
    if (this._index >= this._responses.length) {
      throw new Error('mock ran out of responses');
    }
    const response = this._responses[this._index++];

    // reasoning
    if (response.reasoning_text) {
      yield ReasoningDelta(response.reasoning_text);
    }

    // tool calls
    for (const tc of response.tool_calls) {
      yield ToolCallStart(tc.id, tc.name);
      const json = JSON.stringify(tc.args);
      // 把 JSON 分成几片模拟流式
      const chunkSize = Math.max(1, Math.ceil(json.length / 3));
      for (let i = 0; i < json.length; i += chunkSize) {
        yield ToolCallDelta(tc.id, json.slice(i, i + chunkSize));
      }
    }

    // text
    if (response.text) {
      // 分片模拟流式
      const words = response.text.split(' ');
      for (let i = 0; i < words.length; i++) {
        yield TextDelta((i > 0 ? ' ' : '') + words[i]);
      }
    }

    // completed
    yield Completed({
      inputTokens: response.input_tokens,
      outputTokens: response.output_tokens,
      reasoningTokens: response.reasoning_tokens,
      reasoningMetadata: response.reasoning_metadata,
    });
  }

  /**
   * 便利：accumulate 后返回 ProviderResponse。
   * @param {object} transcript
   * @param {object[]} tools
   * @returns {Promise<ProviderResponse>}
   */
  async acomplete(transcript, tools) {
    const { accumulate } = await import('./accumulate.js');
    return accumulate(this.astream(transcript, tools));
  }

  // ── 向后兼容同步接口（给 run() 用）──────

  /**
   * @param {object} _transcript
   * @param {object[]} _tools
   * @returns {ProviderResponse}
   */
  complete(_transcript, _tools) {
    if (this._index >= this._responses.length) {
      throw new Error('mock ran out of responses');
    }
    return this._responses[this._index++];
  }
}
