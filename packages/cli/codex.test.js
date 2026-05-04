import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildCodexExecArgs } from './codex.js';

describe('buildCodexExecArgs', () => {
  it('allows normal story generation outside git repositories', () => {
    const args = buildCodexExecArgs({
      model: null,
      cwd: '/workspace/related-projects',
      generationDir: '/workspace/related-projects/stories/.tmp/abc',
    });

    assert.ok(args.includes('--skip-git-repo-check'));
  });

  it('passes model overrides through to Codex', () => {
    const args = buildCodexExecArgs({
      model: 'gpt-5.4-mini',
      cwd: '/workspace/project',
      generationDir: '/workspace/project/stories/.tmp/abc',
    });

    assert.deepEqual(args.slice(0, 3), ['exec', '--model', 'gpt-5.4-mini']);
  });
});
