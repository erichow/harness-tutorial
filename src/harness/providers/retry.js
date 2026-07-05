/**
 * RetryPolicy — 第 5 章
 *
 * 指数退避 + jitter + 有界预算。
 *
 * 重试: 429, 500, 502, 503, 504, connection/timeout 错误
 * 不重试: 400, 401, 403, 404
 *
 * 参考: Marc Brooker 2015 "Exponential Backoff And Jitter" (AWS)
 */

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class RetryBudgetExceeded extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'RetryBudgetExceeded';
    this.cause = cause;
  }
}

export class RetryPolicy {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxAttempts=5]
   * @param {number} [opts.baseDelay=1.0]  — 秒
   * @param {number} [opts.maxDelay=30.0]  — 秒
   * @param {number} [opts.maxTotalSeconds=120.0]
   * @param {Set<number>} [opts.retryableStatuses]
   */
  constructor(opts = {}) {
    this.maxAttempts = opts.maxAttempts ?? 5;
    this.baseDelay = (opts.baseDelay ?? 1.0) * 1000; // 转 ms
    this.maxDelay = (opts.maxDelay ?? 30.0) * 1000;
    this.maxTotalMs = (opts.maxTotalSeconds ?? 120.0) * 1000;
    this.retryableStatuses = opts.retryableStatuses ?? new Set([429, 500, 502, 503, 504]);
  }

  /**
   * 用重试策略跑一个 async 函数。
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async run(fn) {
    const start = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e;
        if (!this._retryable(e)) {
          throw e;
        }
        const elapsed = Date.now() - start;
        if (elapsed >= this.maxTotalMs) {
          throw new RetryBudgetExceeded(
            `retry budget exceeded after ${elapsed}ms (max ${this.maxTotalMs}ms)`,
            e,
          );
        }
        const delay = this._delay(attempt, e);
        await sleep(delay);
      }
    }

    throw new RetryBudgetExceeded(
      `all ${this.maxAttempts} attempts failed`,
      lastError,
    );
  }

  /**
   * @param {Error & { status?: number, statusCode?: number }} e
   * @returns {boolean}
   */
  _retryable(e) {
    const status = e.status ?? e.statusCode;
    if (status != null) {
      return this.retryableStatuses.has(status);
    }
    // connection/timeout errors
    if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED') {
      return true;
    }
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      return true;
    }
    return false;
  }

  /**
   * 指数退避 + jitter + Retry-After。
   * @param {number} attempt
   * @param {Error & { retryAfter?: number }} error
   * @returns {number} — delay in ms
   */
  _delay(attempt, error) {
    // 尊重 Retry-After header（如果有）
    if (error.retryAfter != null) {
      return error.retryAfter * 1000;
    }
    const jitter = Math.random() * this.baseDelay;
    const exponential = this.baseDelay * Math.pow(2, attempt);
    return Math.min(exponential + jitter, this.maxDelay);
  }
}
