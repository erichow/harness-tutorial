/**
 * Tool 装饰器 — 第 4 章
 *
 * 把普通函数变成 Tool。从函数签名推导 input_schema，
 * 从 JSDoc/docstring 取 description，从参数取 name 和 side_effects。
 *
 * schema 推断故意简单：str / int / float / bool / array / optional —
 * 足够本书所有工具。复杂 schema 直接手写 inputSchema 调 new Tool()。
 * 第 6 章切到 Ajv 校验时承重。
 */

import { Tool } from './base.js';

/**
 * @param {string} type
 * @returns {{ type: string }}
 */
function _basicSchema(type) {
  return { type };
}

/**
 * 从函数签名推导 JSON Schema。
 * 只支持 str/number/boolean/array/optional，够本书所有工具。
 *
 * @param {Function} fn
 * @returns {{ type: 'object', properties: Record<string, object>, required: string[] }}
 */
function _schemaFromSignature(fn) {
  const src = fn.toString();
  const match = src.match(/^\s*(?:async\s+)?function\s+\w*\s*\(([^)]*)\)/m);
  if (!match) {
    return { type: 'object', properties: {}, required: [] };
  }

  const params = match[1];
  const properties = {};
  const required = [];

  if (params.trim()) {
    for (const raw of params.split(',')) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      // 处理默认值: "name = 'default'" → required=false, type=string
      const eqIdx = trimmed.indexOf('=');
      const hasDefault = eqIdx !== -1;
      const paramPart = hasDefault ? trimmed.slice(0, eqIdx).trim() : trimmed;

      // 处理解构: "{ name, email }" — 跳过
      if (paramPart.startsWith('{') || paramPart.startsWith('[')) {
        continue;
      }

      // 处理 rest: "...args"
      if (paramPart.startsWith('...')) {
        continue;
      }

      // 剥离内联 JSDoc type 注释: "/** @type {string} */ name" → "name"
      let cleanName = paramPart;
      let inlineType = null;
      const inlineMatch = paramPart.match(/\/\*\*\s*@type\s*\{([^}]+)\}\s*\*\//);
      if (inlineMatch) {
        inlineType = inlineMatch[1].trim().toLowerCase();
        cleanName = paramPart.slice(inlineMatch[0].length).trim();
      }

      const name = cleanName;
      if (!name) continue;

      // 同时尝试匹配 JSDoc @param（后备）
      const jsdocMatch = src.match(
        new RegExp(`@param\\s+\\{([^}]+)\\}\\s+(?:\\[?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]?)`, 'i')
      );

      // 优先用内联 @type（比 @param 更可靠，因为紧跟参数）
      if (inlineType) {
        properties[name] = _jsdocToSchema(inlineType);
      } else if (jsdocMatch) {
        // 从 JSDoc @param 匹配类型（如果有）
        const jsType = jsdocMatch[1].trim().toLowerCase();
        properties[name] = _jsdocToSchema(jsType);
      } else {
        // 从默认值推断类型
        if (hasDefault) {
          const defVal = trimmed.slice(eqIdx + 1).trim();
          properties[name] = _defaultToSchema(defVal);
        } else {
          // 默认 string — 模型最常填的就是 string
          properties[name] = { type: 'string' };
        }
      }

      if (!hasDefault) {
        required.push(name);
      }
    }
  }

  return { type: 'object', properties, required };
}

/**
 * 从 JSDoc 类型字符串转 JSON Schema。
 * @param {string} jsType
 * @returns {object}
 */
function _jsdocToSchema(jsType) {
  // string
  if (jsType === 'string') return { type: 'string' };
  // number / int / float
  if (jsType === 'number' || jsType === 'int' || jsType === 'integer' || jsType === 'float') {
    return { type: 'number' };
  }
  // boolean
  if (jsType === 'boolean' || jsType === 'bool') return { type: 'boolean' };
  // string[] / Array<string>
  const arrMatch = jsType.match(/^(?:string|number|boolean)\[\]$/);
  if (arrMatch) {
    return { type: 'array', items: { type: jsType.replace('[]', '') } };
  }
  // number= (optional with default)
  if (jsType.endsWith('=')) {
    return _jsdocToSchema(jsType.slice(0, -1));
  }
  // fallback
  return { type: 'string' };
}

/**
 * 从默认值字符串推断 schema。
 * @param {string} defVal
 * @returns {object}
 */
function _defaultToSchema(defVal) {
  if (/^\d+(\.\d+)?$/.test(defVal)) return { type: 'number' };
  if (defVal === 'true' || defVal === 'false') return { type: 'boolean' };
  if (defVal === '[]' || defVal.startsWith('[')) return { type: 'array', items: { type: 'string' } };
  return { type: 'string' };
}

/**
 * 把普通函数变成 Tool。
 *
 * 支持两种调用方式：
 *   1. @tool({ name:'...', sideEffects:['read'] })
 *   2. @tool() / @tool   （从函数名/文档自动推导）
 *
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {string} [opts.description]
 * @param {import('./base.js').SideEffect[]} [opts.sideEffects]
 * @returns {Function | Tool}
 */
export function tool(opts = {}) {
  // 当直接用作 @tool 时（无括号调用），opts 就是函数本身
  if (typeof opts === 'function') {
    return _wrap(opts, {});
  }

  /**
   * @param {Function} fn
   * @returns {Tool}
   */
  return function wrap(fn) {
    return _wrap(fn, opts);
  };
}

/**
 * @param {Function} fn
 * @param {object} opts
 * @returns {Tool}
 */
function _wrap(fn, opts) {
  const name = opts.name || fn.name;
  const description = opts.description || _extractDocstring(fn);
  if (!description) {
    throw new Error(`tool "${name}" has no description`);
  }
  const inputSchema = _schemaFromSignature(fn);

  return new Tool({
    name,
    description,
    inputSchema,
    run: (...args) => String(fn(...args)),
    sideEffects: opts.sideEffects || [],
  });
}

/**
 * 从函数源码提取文档字符串（取 /** ... * / 的第一个段落）。
 * @param {Function} fn
 * @returns {string}
 */
function _extractDocstring(fn) {
  const src = fn.toString();
  const match = src.match(/\/\*\*([\s\S]*?)\*\//);
  if (!match) return '';
  return match[1]
    .replace(/^\s*\*\s?/gm, '')
    .replace(/@\w+.*$/gm, '')   // 去 JSDoc tags
    .trim();
}
