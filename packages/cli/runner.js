import { spawn } from 'child_process';
import { getCheckpointStatus, formatMissingCheckpoints } from './checkpoints.js';

// Shared subprocess runner used by runCodex and runClaude.
// Polls for checkpoint progress, enforces a per-stage timeout, and resolves
// only after the child process closes (even on the timeout-success path).
export function runSubprocess(cmd, args, { prompt, cwd, generationDir, checkpoints, timeoutMs, verbose, onCheckpoint, model, notFoundMsg, stageLabel }) {
  return new Promise((resolve, reject) => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.CLAUDECODE;
    delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
    delete cleanEnv.CLAUDE_CODE_SESSION;

    const child = spawn(cmd, args, { cwd, env: cleanEnv });

    child.stdin.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });

    let stdout = '';
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (verbose) process.stdout.write(chunk);
    });
    child.stdin.write(prompt);
    child.stdin.end();

    let stderr = '';
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (verbose) process.stderr.write(chunk);
    });

    let settled = false;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(progressInterval);
      if (error) reject(error);
      else resolve();
    };

    let lastCompleted = 0;
    const progressInterval = setInterval(() => {
      const status = getCheckpointStatus(generationDir, checkpoints);
      if (status.completed > lastCompleted) {
        lastCompleted = status.completed;
        if (onCheckpoint) onCheckpoint(status.completed - 1);
      }
    }, 1000);

    const timer = setTimeout(() => {
      const status = getCheckpointStatus(generationDir, checkpoints);
      child.kill('SIGTERM');
      if (!status.complete) {
        settle(new Error(
          `Stage timed out after ${timeoutMs / 60_000} minutes` +
          formatMissingCheckpoints(status)
        ));
      }
      // When complete at timeout, let the close event settle so we wait for
      // child shutdown before callers can finalize or delete the temp dir.
    }, timeoutMs);

    child.on('error', (error) => {
      settle(new Error(
        error.code === 'ENOENT' ? notFoundMsg : `Failed to spawn ${cmd}: ${error.message}`
      ));
    });

    child.on('close', (code) => {
      const status = getCheckpointStatus(generationDir, checkpoints);
      if (status.complete) {
        settle();
      } else {
        let msg = `${stageLabel} did not produce expected outputs (exit code: ${code})`;
        if (model) msg += ` [model: ${model}]`;
        msg += formatMissingCheckpoints(status);
        if (stderr) msg += `\nstderr: ${stderr.slice(0, 500)}`;
        if (stdout) msg += `\nstdout: ${stdout.slice(0, 500)}`;
        settle(new Error(msg));
      }
    });
  });
}
