/**
 * FallbackProvider — 第 5 章
 *
 * 主备双路，组合式继承。loop 不知道它是复合的。
 * 要三路回退？包两个 FallbackProvider。
 */

import { accumulate } from './accumulate.js';

export class FallbackProvider {
  /**
   * @param {import('./base.js').Provider} primary
   * @param {import('./base.js').Provider} secondary
   */
  constructor(primary, secondary) {
    this.name = 'fallback';
    this.primary = primary;
    this.secondary = secondary;
  }

  /**
   * @param {object} transcript
   * @param {object[]} tools
   * @returns {AsyncGenerator<import('./events.js').StreamEvent>}
   */
  async *astream(transcript, tools) {
    try {
      for await (const event of this.primary.astream(transcript, tools)) {
        yield event;
      }
      return;
    } catch (e) {
      // 主 provider 失败 → fall through to secondary
      // RetryBudgetExceeded 或任何不可恢复错误
    }
    for await (const event of this.secondary.astream(transcript, tools)) {
      yield event;
    }
  }

  /**
   * @param {object} transcript
   * @param {object[]} tools
   * @returns {Promise<import('./base.js').ProviderResponse>}
   */
  async acomplete(transcript, tools) {
    return accumulate(this.astream(transcript, tools));
  }
}
