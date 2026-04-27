import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { formatMissingCheckpoints, getCheckpointStatus } from './checkpoints.js';

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-stories-checkpoints-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('getCheckpointStatus', () => {
  it('reports complete when all files and markers exist', () => withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'notes.md'), 'done\nSTAGE_COMPLETE\n');
    fs.writeFileSync(path.join(dir, 'story.json'), '{}\n');

    const status = getCheckpointStatus(dir, [
      { file: 'notes.md', checkpoint: 'STAGE_COMPLETE' },
      { file: 'story.json', checkpoint: null },
    ]);

    assert.equal(status.complete, true);
    assert.equal(status.completed, 2);
    assert.deepEqual(status.missing, []);
  }));

  it('stops at the first missing file', () => withTempDir((dir) => {
    const status = getCheckpointStatus(dir, [
      { file: 'notes.md', checkpoint: 'STAGE_COMPLETE' },
      { file: 'story.json', checkpoint: null },
    ]);

    assert.equal(status.complete, false);
    assert.equal(status.completed, 0);
    assert.deepEqual(status.missing, ['notes.md (missing)']);
  }));

  it('reports missing checkpoint markers', () => withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'notes.md'), 'draft only\n');

    const status = getCheckpointStatus(dir, [
      { file: 'notes.md', checkpoint: 'STAGE_COMPLETE' },
    ]);

    assert.equal(status.complete, false);
    assert.equal(status.completed, 0);
    assert.deepEqual(status.missing, ['notes.md (missing marker STAGE_COMPLETE)']);
  }));
});

describe('formatMissingCheckpoints', () => {
  it('renders a concise diagnostic for incomplete output', () => {
    assert.equal(
      formatMissingCheckpoints({ missing: ['story.json (missing)'] }),
      '\nmissing checkpoints: story.json (missing)',
    );
  });

  it('renders an empty string when no diagnostics are present', () => {
    assert.equal(formatMissingCheckpoints({ missing: [] }), '');
  });
});
