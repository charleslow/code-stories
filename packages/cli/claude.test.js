import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildClaudePrintArgs } from './claude.js';

describe('buildClaudePrintArgs', () => {
  it('uses non-interactive print mode without requiring a git worktree', () => {
    const args = buildClaudePrintArgs({
      model: null,
      generationDir: '/workspace/related-projects/stories/.tmp/abc',
    });

    assert.ok(args.includes('--print'));
    assert.ok(!args.includes('--dangerously-skip-permissions'));
    assert.ok(!args.includes('--worktree'));
    assert.ok(!args.includes('--from-pr'));
  });

  it('passes model overrides through to Claude', () => {
    const args = buildClaudePrintArgs({
      model: 'claude-sonnet-4-6',
      generationDir: '/workspace/project/stories/.tmp/abc',
    });

    assert.deepEqual(args.slice(-2), ['--model', 'claude-sonnet-4-6']);
  });
});
