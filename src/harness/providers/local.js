/**
 * Local Provider — 第 3 章
 *
 * 一行代码搞定：继承 OpenAIProvider，换 base_url。
 * llama.cpp / vLLM / Ollama / LM Studio 只要是 OpenAI chat-completions
 * 协议的本地服务器都能跑——这是 OSS 事实标准。
 */

import { OpenAIProvider } from './openai.js';

const DEFAULT_MODEL = 'llama-3.1-8b-instruct';
const DEFAULT_BASE_URL = 'http://localhost:8000/v1';

export class LocalProvider extends OpenAIProvider {
  /**
   * @param {object} [opts]
   * @param {string} [opts.model]
   * @param {string} [opts.baseUrl]
   */
  constructor(opts = {}) {
    const model = opts.model ?? DEFAULT_MODEL;
    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    // lazy import — 本地不一定装了 openai 包
    let client;
    try {
      const { default: OpenAI } = require('openai');
      client = new OpenAI({ baseURL: baseUrl, apiKey: 'not-needed' });
    } catch {
      // openai 包没装也无妨，只在需要 complete 时才 lazy init
      client = undefined;
    }
    super({ model, client });
    this.name = 'local';
    this._baseUrl = baseUrl;
  }
}
