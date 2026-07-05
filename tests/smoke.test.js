/**
 * 烟雾测试 — 第 1 章
 *
 * 证明包能 import、Node 版本正确。
 */

import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('Node version >= 18', () => {
    const [major] = process.versions.node.split('.').map(Number);
    expect(major).toBeGreaterThanOrEqual(18);
  });

  it('package imports', async () => {
    const harness = await import('../src/harness/index.js');
    expect(harness).toBeDefined();
  });
});
