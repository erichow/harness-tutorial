/**
 * 消息、回合与转录 — 第 3 章
 *
 * 把 dict 变成类型，让 harness 跨厂商可移植。
 *
 *   Block = TextBlock | ToolCall | ToolResult | ReasoningBlock
 *   Message = role + Block[] + UUID + timestamp
 *   Transcript = Message[] + system
 *
 * 从这一章起，loop、adapter、记账器全部依赖这些类型，
 * 不再依赖裸 dict。
 */

// ── Block 工厂 ────────────────────────────────────────────

/**
 * @param {string} text
 * @returns {{ kind: 'text', text: string }}
 */
export function TextBlock(text) {
  return Object.freeze({ kind: 'text', text });
}

/**
 * @param {string} id
 * @param {string} name
 * @param {Record<string, *>} args
 * @returns {{ kind: 'tool_call', id: string, name: string, args: Record<string, *> }}
 */
export function ToolCall(id, name, args) {
  return Object.freeze({ kind: 'tool_call', id, name, args });
}

/**
 * @param {string} callId
 * @param {string} content
 * @param {boolean} [isError=false]
 * @returns {{ kind: 'tool_result', call_id: string, content: string, is_error: boolean }}
 */
export function ToolResult(callId, content, isError = false) {
  return Object.freeze({ kind: 'tool_result', call_id: callId, content, is_error: isError });
}

/**
 * @param {string} text
 * @param {Record<string, *>} [metadata={}]
 * @returns {{ kind: 'reasoning', text: string, metadata: Record<string, *> }}
 */
export function ReasoningBlock(text, metadata = {}) {
  return Object.freeze({ kind: 'reasoning', text, metadata });
}

// ── Message ────────────────────────────────────────────────

/**
 * @typedef {'user' | 'assistant' | 'system'} Role
 */

/**
 * Message — 一条有类型的记录，不是 dict。
 *
 * @class Message
 * @property {Role} role
 * @property {object[]} blocks
 * @property {string} id
 * @property {number} createdAt — Date.now()
 */
export class Message {
  /**
   * @param {Role} role
   * @param {object[]} blocks
   * @param {object} [opts]
   * @param {string} [opts.id]
   * @param {number} [opts.createdAt]
   */
  constructor(role, blocks, opts = {}) {
    this.role = role;
    this.blocks = blocks;
    this.id = opts.id ?? _uuid();
    this.createdAt = opts.createdAt ?? Date.now();
  }

  // ── 工厂方法 ──────────────────────────────────────────

  /** @param {string} text */
  static userText(text) {
    return new Message('user', [TextBlock(text)]);
  }

  /**
   * @param {string} text
   * @param {object} [reasoning] — ReasoningBlock | undefined
   */
  static assistantText(text, reasoning) {
    const blocks = [];
    if (reasoning) blocks.push(reasoning);
    blocks.push(TextBlock(text));
    return new Message('assistant', blocks);
  }

  /**
   * @param {object} call — ToolCall
   * @param {object} [reasoning]
   */
  static assistantToolCall(call, reasoning) {
    const blocks = [];
    if (reasoning) blocks.push(reasoning);
    blocks.push(call);
    return new Message('assistant', blocks);
  }

  /** @param {object} result — ToolResult */
  static toolResult(result) {
    // Anthropic 惯例：tool result 挂在 user；adapter 出门时改写成 OpenAI 的 "tool"
    return new Message('user', [result]);
  }

  /**
   * 一键从 ProviderResponse 创建 assistant 消息。
   * @param {import('./providers/base.js').ProviderResponse} response
   */
  static fromAssistantResponse(response) {
    const blocks = [];
    if (response.reasoning_text) {
      blocks.push(ReasoningBlock(response.reasoning_text, response.reasoning_metadata));
    }
    // 第 5 章升级：迭代所有 tool_calls（不再是单数 tool_name）
    if (response.is_tool_call) {
      for (const ref of response.tool_calls) {
        blocks.push(ToolCall(ref.id, ref.name, ref.args));
      }
    }
    if (response.is_final && response.text) {
      blocks.push(TextBlock(response.text));
    }
    return new Message('assistant', blocks);
  }
}

// ── Transcript ────────────────────────────────────────────

/**
 * Transcript — 薄 wrapper，不是裸 list。
 *
 * @class Transcript
 * @property {Message[]} messages
 * @property {string | null} system
 */
export class Transcript {
  /**
   * @param {object} [opts]
   * @param {Message[]} [opts.messages]
   * @param {string | null} [opts.system]
   */
  constructor(opts = {}) {
    this.messages = opts.messages ?? [];
    this.system = opts.system ?? null;
  }

  /** @param {Message} message */
  append(message) {
    this.messages.push(message);
  }

  /** @param {Message[]} messages */
  extend(messages) {
    this.messages.push(...messages);
  }

  /** @returns {Message | undefined} */
  last() {
    return this.messages[this.messages.length - 1];
  }

  /** @returns {number} */
  get length() {
    return this.messages.length;
  }
}

// ── 内部工具 ─────────────────────────────────────────────

let _nextId = 0;
function _uuid() {
  return `msg-${Date.now()}-${_nextId++}`;
}
