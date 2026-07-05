/**
 * Mock Provider — 第 2 章
 *
 * 脚本化的 fake，走查固定的 ProviderResponse 列表，
 * 每调一次 complete 前进一格。
 * 离线、确定性、零成本。
 */

/**
 * @implements {import('./base.js').Provider}
 */
export class MockProvider {
  /**
   * @param {import('./base.js').ProviderResponse[]} responses
   */
  constructor(responses) {
    this._responses = [...responses];
    this._index = 0;
  }

  /**
   * @param {object[]} _transcript
   * @param {object[]} _tools
   * @returns {import('./base.js').ProviderResponse}
   */
  complete(_transcript, _tools) {
    if (this._index >= this._responses.length) {
      throw new Error('mock ran out of responses');
    }
    return this._responses[this._index++];
  }
}
