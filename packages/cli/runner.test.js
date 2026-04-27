import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { runSubprocess } from './runner.js';

async function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-stories-runner-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// A subprocess that drains stdin and hangs until killed.
const HANG_ARGS = ['-e', 'process.stdin.resume(); setTimeout(() => {}, 60000)'];

const BASE_OPTS = {
  prompt: '',
  cwd: os.tmpdir(),
  checkpoints: [],
  timeoutMs: 200,
  verbose: false,
  onCheckpoint: null,
  model: null,
  notFoundMsg: 'node not found',
  stageLabel: 'Test stage',
};

describe('runSubprocess timeout behaviour', () => {
  it('resolves when all checkpoints are present at timeout (process still running)', () =>
    withTempDir(async (dir) => {
      fs.writeFileSync(path.join(dir, 'output.md'), 'DONE\n');
      const checkpoints = [{ file: 'output.md', checkpoint: 'DONE' }];

      await assert.doesNotReject(
        runSubprocess(process.execPath, HANG_ARGS, {
          ...BASE_OPTS,
          generationDir: dir,
          checkpoints,
        })
      );
    })
  );

  it('rejects with a timeout error when checkpoints are missing at timeout', () =>
    withTempDir(async (dir) => {
      const checkpoints = [{ file: 'output.md', checkpoint: 'DONE' }];

      await assert.rejects(
        runSubprocess(process.execPath, HANG_ARGS, {
          ...BASE_OPTS,
          generationDir: dir,
          checkpoints,
        }),
        /timed out/
      );
    })
  );

  it('waits for child close before resolving on timeout-success', () =>
    // The subprocess writes a sentinel file in its SIGTERM handler, just before
    // exiting. With the fixed code (settle deferred to close event), the file
    // is guaranteed to exist once the promise resolves. With the old code
    // (settle called immediately after kill), the file could still be absent.
    withTempDir(async (dir) => {
      const sentinelFile = path.join(dir, 'child-closed');
      fs.writeFileSync(path.join(dir, 'output.md'), 'DONE\n');
      const checkpoints = [{ file: 'output.md', checkpoint: 'DONE' }];

      // Inline script: on SIGTERM, busy-wait 30 ms to create a detectable gap,
      // write the sentinel, then exit. The busy-wait is intentional: it makes
      // the race visible without relying on OS scheduling.
      const script = `
        const fs = require('fs');
        process.on('SIGTERM', () => {
          const end = Date.now() + 30;
          while (Date.now() < end) {}
          fs.writeFileSync(${JSON.stringify(sentinelFile)}, 'closed');
          process.exit(0);
        });
        process.stdin.resume();
        setTimeout(() => {}, 60000);
      `;

      await runSubprocess(process.execPath, ['-e', script], {
        ...BASE_OPTS,
        generationDir: dir,
        checkpoints,
      });

      assert.ok(
        fs.existsSync(sentinelFile),
        'promise must not resolve until the child close event fires'
      );
    })
  );
});

describe('runSubprocess normal exit', () => {
  it('resolves when the process exits normally with all checkpoints written', () =>
    withTempDir(async (dir) => {
      // Subprocess writes the checkpoint file, then exits cleanly.
      const outFile = path.join(dir, 'result.md');
      const script = `
        const fs = require('fs');
        fs.writeFileSync(${JSON.stringify(outFile)}, 'DONE\\n');
        process.exit(0);
      `;
      const checkpoints = [{ file: 'result.md', checkpoint: 'DONE' }];

      await assert.doesNotReject(
        runSubprocess(process.execPath, ['-e', script], {
          ...BASE_OPTS,
          generationDir: dir,
          checkpoints,
          timeoutMs: 10_000,
        })
      );
    })
  );

  it('rejects when the process exits without writing the expected checkpoint', () =>
    withTempDir(async (dir) => {
      const checkpoints = [{ file: 'result.md', checkpoint: 'DONE' }];

      await assert.rejects(
        runSubprocess(process.execPath, ['-e', 'process.exit(0)'], {
          ...BASE_OPTS,
          generationDir: dir,
          checkpoints,
          timeoutMs: 10_000,
        }),
        /did not produce expected outputs/
      );
    })
  );
});
