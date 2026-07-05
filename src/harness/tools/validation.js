/**
 * 工具参数校验 — 第 6 章
 *
 * 在 dispatch 之前校验 args 是否符合 inputSchema，
 * 返回结构化错误列表而不是抛 Python 风格异常。
 *
 * 核心设计：
 *   validate() 返回 list，不抛异常 —— 一次调用可能有多个问题
 *   （类型错 + 缺必填 + 多了未知字段），模型从一条消息里学得
 *   比连续 3 个回合各修一个快得多。
 *
 *   path 是人类可读的：args.expression, args.items[0].name
 *   模型读这个跟人一样顺。
 */

import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

/**
 * 一条校验错误。
 *
 * @class ValidationError
 * @property {string} message — 人类可读的问题描述
 * @property {string} path    — JSON-pointer-ish; e.g. "args.expression"
 */
export class ValidationError {
  /**
   * @param {string} message
   * @param {string} path
   */
  constructor(message, path) {
    this.message = message;
    this.path = path;
    Object.freeze(this);
  }

  toString() {
    return `${this.path}: ${this.message}`;
  }
}

/**
 * 根据 JSON Schema 校验 args dict。
 * 空 list = 校验通过。
 *
 * @param {Record<string, *>} args   — 模型传的参数字典
 * @param {object} schema            — JSON Schema（工具声明的 inputSchema）
 * @returns {ValidationError[]}
 */
export function validate(args, schema) {
  const errors = [];

  // ajv 的 validate 同步返回 boolean
  const validateFn = ajv.compile(schema);
  const valid = validateFn(args);

  if (!valid) {
    for (const err of validateFn.errors || []) {
      // instancePath 可能是 "" 或 "/expression"
      const rawPath = err.instancePath || '';
      const path = 'args' + rawPath.replace(/\//g, '.');
      // 去掉 ajv 在 required 错误中多余的 "must have required property 'xxx'" 前缀
      let message = err.message || 'invalid';
      // 让消息更自然一点
      if (err.keyword === 'required') {
        const missing = err.params?.missingProperty;
        if (missing) {
          message = `'${missing}' is a required property`;
        }
      }
      errors.push(new ValidationError(message, path));
    }
  }

  return errors;
}
