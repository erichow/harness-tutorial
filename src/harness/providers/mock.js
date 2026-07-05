/**
 * Mock Provider — 第 3 章升级
 *
 * 适配新的 ProviderResponse（无 kind 字段，用 is_final/is_tool_call）。
 * 支持 reasoning 模拟。
 */

import { ProviderResponse } from './base.js';

export class MockProvider {
  /**
   * @param {import('./base.js').ProviderResponse[]} responses
   */
  constructor(responses) {
    this.name = 'mock';
    this._responses = [...responses];
    this._index = 0;
  }

  /**
   * @param {import('../messages.js').Transcript} _transcript
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
