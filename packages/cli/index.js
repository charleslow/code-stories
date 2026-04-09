#!/usr/bin/env node

import { program } from 'commander';
import ora from 'ora';
import { spawn, execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { buildPrompt } from './prompt.js';
import { buildPRPrompt } from './prompt-pr.js';
import { fetchPRData } from './pr.js';
import { detectPlatform, resolveCli, parseRepoId, getCloneUrl, checkoutMR } from './hosting.js';

// Configuration (resolved relative to cwd)
const STORIES_DIR = path.resolve('./stories');
const TMP_DIR = path.join(STORIES_DIR, '.tmp');
const MARKER_FILE = path.join(STORIES_DIR, '.code-stories');

// Ensure directories exist
function ensureDirectories() {
  if (fs.existsSync(STORIES_DIR)) {
    // Warn if directory exists but wasn't created by code-stories
    const entries = fs.readdirSync(STORIES_DIR);
    if (entries.length > 0 && !fs.existsSync(MARKER_FILE)) {
      console.warn('Warning: stories/ directory exists but was not created by code-stories. Proceeding may overwrite existing files.');
    }
  } else {
    fs.mkdirSync(STORIES_DIR, { recursive: true });
  }
  // Create marker file
  if (!fs.existsSync(MARKER_FILE)) {
    fs.writeFileSync(MARKER_FILE, '');
  }
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

// Get current commit hash
function getCommitHash(cwd = process.cwd()) {
  try {
    return execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();
  } catch (e) {
    console.warn('Failed to get commit hash:', e.message);
    return 'unknown';
  }
}

// Clone a repo to a temp directory
function cloneRepo(repo, host, spinner) {
  const repoId = parseRepoId(repo);
  const cloneUrl = getCloneUrl(repoId, { host, useSSH: true });
  const tempDir = path.join(os.tmpdir(), `code-stories-${uuidv4()}`);

  spinner.text = `Cloning ${repoId}...`;
  try {
    execFileSync('git', ['clone', '--depth', '1', cloneUrl, tempDir], {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 60_000,
    });
  } catch (e) {
    if (e.killed) {
      throw new Error('Git clone timed out after 60 seconds. The repository may be too large or the network is slow.');
    }
    throw e;
  }

  return { tempDir, repoId };
}

// Clean up cloned repo
function cleanupClone(tempDir) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {
    console.warn('Failed to clean up cloned repo:', e.message);
  }
}

// Clone a repo for PR/MR review (full clone, then checkout branch)
function cloneRepoForPR(repo, prNumber, host, cli, spinner) {
  const repoId = parseRepoId(repo);
  const cloneUrl = getCloneUrl(repoId, { host });
  const tempDir = path.join(os.tmpdir(), `code-stories-${uuidv4()}`);

  spinner.text = `Cloning ${repoId}...`;
  try {
    execFileSync('git', ['clone', cloneUrl, tempDir], {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 120_000,
    });
  } catch (e) {
    if (e.killed) {
      throw new Error('Git clone timed out after 120 seconds. The repository may be too large or the network is slow.');
    }
    throw e;
  }

  const mrLabel = cli === 'glab' ? 'MR' : 'PR';
  spinner.text = `Checking out ${mrLabel} #${prNumber}...`;
  try {
    checkoutMR(prNumber, tempDir, cli);
  } catch (e) {
    if (e.killed) {
      throw new Error(`${mrLabel} checkout timed out after 60 seconds.`);
    }
    throw e;
  }

  return { tempDir, repoId };
}

// Maximum time (ms) the Codex subprocess may run before being killed.
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Flat stage definitions for progress tracking (used by getCurrentStage and listIncompleteGenerations)
const STAGES = [
  { file: 'exploration_scan.md', checkpoint: 'EXPLORATION_SCANNED', label: 'Scanning file tree' },
  { file: 'exploration_read.md', checkpoint: 'EXPLORATION_READ', label: 'Reading key files' },
  { file: 'exploration_notes.md', checkpoint: 'STAGE_1_COMPLETE', label: 'Documenting architecture' },
  { file: 'narrative_outline.md', checkpoint: 'STAGE_2_COMPLETE', label: 'Planning outline' },
  { file: 'snippets_mapping.md', checkpoint: 'STAGE_3_COMPLETE', label: 'Identifying snippets' },
  { file: 'explanations_draft.md', checkpoint: 'STAGE_4_COMPLETE', label: 'Crafting explanations' },
  { file: 'story.json', checkpoint: null, label: 'Finalizing story' },
];

// Check current stage based on files (flat index into STAGES)
function getCurrentStage(generationDir) {
  let stage = 0;

  for (let i = 0; i < STAGES.length; i++) {
    const { file, checkpoint } = STAGES[i];
    const filePath = path.join(generationDir, file);

    if (!fs.existsSync(filePath)) break;

    if (checkpoint) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes(checkpoint)) break;
    }

    stage = i + 1;
  }

  return stage;
}

// Run the Codex subprocess with the given prompt.
// Polls for checkpoint files and calls onCheckpoint when progress is detected.
function runCodex({ prompt, cwd, generationDir, checkpoints, timeoutMs, verbose, onCheckpoint }) {
  return new Promise((resolve, reject) => {
    const args = [
      'exec',
      '--full-auto',
      '-C', cwd,
      '--add-dir', generationDir,
      '-',  // read prompt from stdin
    ];
    const codex = spawn('codex', args, { cwd });

    // Send prompt via stdin
    codex.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE') throw err;
    });
    let stdout = '';
    codex.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (verbose) process.stdout.write(chunk);
    });
    codex.stdin.write(prompt);
    codex.stdin.end();

    let stderr = '';
    codex.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (verbose) process.stderr.write(chunk);
    });

    // Poll for checkpoint progress within this stage
    let lastCompleted = 0;
    const progressInterval = setInterval(() => {
      let completed = 0;
      for (const cp of checkpoints) {
        const filePath = path.join(generationDir, cp.file);
        if (!fs.existsSync(filePath)) break;
        if (cp.checkpoint) {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (!content.includes(cp.checkpoint)) break;
        }
        completed++;
      }
      if (completed > lastCompleted) {
        lastCompleted = completed;
        if (onCheckpoint) onCheckpoint(completed - 1);
      }
    }, 1000);

    // Per-stage timeout
    const timer = setTimeout(() => {
      clearInterval(progressInterval);
      codex.kill('SIGTERM');
      reject(new Error(`Stage timed out after ${timeoutMs / 60_000} minutes`));
    }, timeoutMs);

    codex.on('error', (error) => {
      clearTimeout(timer);
      clearInterval(progressInterval);
      reject(new Error(`Failed to spawn Codex CLI: ${error.message}`));
    });

    codex.on('close', (code) => {
      clearTimeout(timer);
      clearInterval(progressInterval);

      // Verify all checkpoints for this stage are complete
      const allComplete = checkpoints.every(cp => {
        const filePath = path.join(generationDir, cp.file);
        if (!fs.existsSync(filePath)) return false;
        if (cp.checkpoint) {
          const content = fs.readFileSync(filePath, 'utf-8');
          return content.includes(cp.checkpoint);
        }
        return true;
      });

      if (allComplete) {
        resolve();
      } else {
        let msg = `Stage did not produce expected outputs (exit code: ${code})`;
        if (stderr) msg += `\nstderr: ${stderr.slice(0, 500)}`;
        if (stdout) msg += `\nstdout: ${stdout.slice(0, 500)}`;
        reject(new Error(msg));
      }
    });
  });
}

// Update manifest.json with file locking for concurrent safety.
// Uses mkdir as an atomic lock primitive (fails if dir already exists).
function updateManifest(storiesDir, entry) {
  const manifestPath = path.join(storiesDir, 'manifest.json');
  const lockPath = manifestPath + '.lock';
  const maxRetries = 50;
  const retryDelayMs = 100;

  // Acquire lock
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.mkdirSync(lockPath);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (i === maxRetries - 1) {
        throw new Error(
          `Could not acquire manifest lock after ${maxRetries} retries. ` +
          `If no other process is running, delete ${lockPath}`
        );
      }
      // Synchronous sleep before retrying
      const end = Date.now() + retryDelayMs;
      while (Date.now() < end) { /* busy wait */ }
    }
  }

  try {
    let manifest = { stories: [] };
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    }
    manifest.stories.unshift(entry);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  } finally {
    fs.rmdirSync(lockPath);
  }
}

// Validate, copy to stories dir, update manifest, and clean up tmp.
// Returns the story object on success, throws on failure.
function finalizeStory(generationDir) {
  const storyPath = path.join(generationDir, 'story.json');
  const story = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!story.id || !uuidRegex.test(story.id)) {
    throw new Error(`Invalid story ID: "${story.id}" is not a valid UUID`);
  }

  const finalPath = path.join(STORIES_DIR, `${story.id}.json`);
  fs.writeFileSync(finalPath, JSON.stringify(story, null, 2));

  updateManifest(STORIES_DIR, {
    id: story.id,
    title: story.title,
    commitHash: story.commitHash,
    createdAt: story.createdAt,
  });

  fs.rmSync(generationDir, { recursive: true, force: true });
  return { story, finalPath };
}

// Find a generation directory by ID or prefix
function findGenerationDir(idOrPrefix) {
  if (!fs.existsSync(TMP_DIR)) {
    return null;
  }
  const entries = fs.readdirSync(TMP_DIR);

  // Exact match first
  if (entries.includes(idOrPrefix)) {
    return path.join(TMP_DIR, idOrPrefix);
  }

  // Prefix match
  const matches = entries.filter(e => e.startsWith(idOrPrefix));
  if (matches.length === 1) {
    return path.join(TMP_DIR, matches[0]);
  }
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous ID prefix "${idOrPrefix}" matches ${matches.length} generations:\n` +
      matches.map(m => `  ${m}`).join('\n')
    );
  }

  return null;
}

// List all incomplete generations in .tmp/
function listIncompleteGenerations() {
  if (!fs.existsSync(TMP_DIR)) return [];

  const entries = fs.readdirSync(TMP_DIR);
  const results = [];

  for (const entry of entries) {
    const dir = path.join(TMP_DIR, entry);
    if (!fs.statSync(dir).isDirectory()) continue;

    const metaPath = path.join(dir, 'metadata.json');
    const stage = getCurrentStage(dir);
    const stageLabel = stage < STAGES.length ? STAGES[stage].label : 'Complete';

    let meta = null;
    if (fs.existsSync(metaPath)) {
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch {}
    }

    results.push({
      id: entry,
      query: meta?.query || '(unknown)',
      repo: meta?.repoId || null,
      isPR: meta?.isPR || false,
      stage,
      stageLabel,
      createdAt: meta?.createdAt || fs.statSync(dir).birthtime.toISOString(),
    });
  }

  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Generate a story by running the full pipeline as a single Codex invocation
async function generateStory(query, options = {}) {
  const { cwd = process.cwd(), repoId = null, prData = null, verbose = false, resume = null } = options;

  ensureDirectories();

  let generationId, generationDir, commitHash;

  if (resume) {
    // Resume mode: reuse existing generation directory
    generationDir = resume.generationDir;
    generationId = resume.meta.generationId;
    commitHash = resume.meta.commitHash;
  } else {
    // Normal mode: create new generation
    generationId = uuidv4();
    generationDir = path.join(TMP_DIR, generationId);
    fs.mkdirSync(generationDir, { recursive: true });

    commitHash = getCommitHash(cwd);

    // Save metadata for potential future resume
    const meta = {
      generationId,
      query,
      commitHash,
      repoId,
      sourceCwd: cwd,
      isPR: !!prData,
      prData: prData || null,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(generationDir, 'metadata.json'), JSON.stringify(meta, null, 2));
  }

  // Build single prompt with all stages
  const { prompt, checkpoints } = prData
    ? buildPRPrompt(query, generationDir, commitHash, generationId, repoId, prData)
    : buildPrompt(query, generationDir, commitHash, generationId, repoId);

  if (!resume) {
    console.log('\n  Code Stories Generator\n');
    if (repoId) {
      console.log(`  Repo: ${repoId}`);
    }
    console.log(`  Query: "${query}"`);
    console.log(`  Commit: ${commitHash.slice(0, 7)}`);
    console.log('');
  }

  // Count already-completed checkpoints (for resume progress offset)
  let completedCheckpoints = 0;
  for (const cp of checkpoints) {
    const filePath = path.join(generationDir, cp.file);
    if (!fs.existsSync(filePath)) break;
    if (cp.checkpoint) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes(cp.checkpoint)) break;
    }
    completedCheckpoints++;
  }

  const startPercent = Math.round((completedCheckpoints / checkpoints.length) * 100);
  const initialLabel = completedCheckpoints < STAGES.length ? STAGES[completedCheckpoints].label : 'Finalizing';
  const spinner = verbose
    ? null
    : ora({ text: `${initialLabel} (${startPercent}%)`, prefixText: '  ' }).start();

  const genId = path.basename(generationDir);

  // Run the full pipeline as a single Codex invocation
  try {
    await runCodex({
      prompt,
      cwd,
      generationDir,
      checkpoints,
      timeoutMs: TIMEOUT_MS,
      verbose,
      onCheckpoint: (checkpointIdx) => {
        const pct = Math.round(((checkpointIdx + 1) / checkpoints.length) * 100);
        const nextIdx = checkpointIdx + 1;
        const label = nextIdx < STAGES.length ? STAGES[nextIdx].label : 'Finalizing';
        if (spinner) spinner.text = `${label} (${pct}%)`;
      },
    });
  } catch (error) {
    if (spinner) spinner.fail('Generation failed');
    else console.error('  Generation failed');
    console.log(`\n  Check intermediate files in: ${generationDir}`);
    console.log(`  To resume: code-stories --resume ${genId}\n`);
    throw error;
  }

  // Finalize: validate, copy to stories dir, update manifest
  try {
    const { story, finalPath } = finalizeStory(generationDir);
    if (spinner) spinner.succeed(`Story generated: ${story.title}`);
    else console.log(`  Done: Story generated: ${story.title}`);
    console.log(`\n  Saved to: ${finalPath}\n`);
    return story;
  } catch (error) {
    if (spinner) spinner.fail(`Error processing story: ${error.message}`);
    else console.error(`  Error processing story: ${error.message}`);
    throw error;
  }
}

// Track cloned directory globally for signal handlers
let activeCloneDir = null;

function cleanupAndExit(code) {
  if (activeCloneDir) {
    cleanupClone(activeCloneDir);
    activeCloneDir = null;
  }
  process.exit(code);
}

// Handle termination signals
process.on('SIGINT', () => cleanupAndExit(130));
process.on('SIGTERM', () => cleanupAndExit(143));

// CLI setup
program
  .name('code-stories')
  .description('Generate narrative-driven code stories using Codex')
  .version('0.1.0')
  .argument('[query]', 'Question about the codebase to generate a story for')
  .option('-r, --repo <repo>', 'GitHub or GitLab repository (user/repo or full URL)')
  .option('--pr <number>', 'PR/MR number to review', parseInt)
  .option('--resume [id]', 'Resume an interrupted story generation. Pass a generation ID (or prefix) to resume, or omit to list resumable stories.')
  .option('--verbose', 'Show the agent reasoning process for debugging')
  .action(async (query, options) => {

    // Handle --resume mode
    if (options.resume !== undefined) {
      ensureDirectories();

      // --resume with no ID: list incomplete generations
      if (options.resume === true) {
        const incomplete = listIncompleteGenerations();
        if (incomplete.length === 0) {
          console.log('\n  No incomplete stories found.\n');
          process.exit(0);
        }

        console.log('\n  Incomplete stories:\n');
        for (const gen of incomplete) {
          const progress = Math.round((gen.stage / STAGES.length) * 100);
          const prTag = gen.isPR ? ' [PR]' : '';
          console.log(`  ${gen.id}`);
          console.log(`    Query: "${gen.query}"${prTag}`);
          if (gen.repo) console.log(`    Repo: ${gen.repo}`);
          console.log(`    Progress: ${progress}% — next: ${gen.stageLabel}`);
          console.log(`    Started: ${gen.createdAt}`);
          console.log('');
        }
        console.log('  To resume: code-stories --resume <id>\n');
        process.exit(0);
      }

      // --resume <id>: find and resume
      const generationDir = findGenerationDir(options.resume);
      if (!generationDir) {
        console.error(`Error: no incomplete generation found matching "${options.resume}"`);
        console.error('Run "code-stories --resume" to list incomplete stories.');
        process.exit(1);
      }

      const metaPath = path.join(generationDir, 'metadata.json');
      if (!fs.existsSync(metaPath)) {
        console.error(`Error: generation directory found but missing metadata.json.`);
        console.error(`Cannot resume without metadata. Directory: ${generationDir}`);
        process.exit(1);
      }

      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const currentStageNum = getCurrentStage(generationDir);

      if (currentStageNum >= STAGES.length && fs.existsSync(path.join(generationDir, 'story.json'))) {
        console.log('\n  Story appears complete! Finalizing...\n');
        try {
          const { finalPath } = finalizeStory(generationDir);
          console.log(`  Story saved: ${finalPath}\n`);
          process.exit(0);
        } catch (error) {
          console.error(`  Error finalizing: ${error.message}`);
          process.exit(1);
        }
      }

      const progress = Math.round((currentStageNum / STAGES.length) * 100);
      console.log(`\n  Resuming story generation (${progress}% complete)`);
      console.log(`  Query: "${meta.query}"`);
      console.log(`  Next: ${STAGES[currentStageNum]?.label || 'Finalizing'}\n`);

      // For PR stories with a remote repo, we need to re-clone
      let cwd = process.cwd();
      if (meta.repoId) {
        const detected = detectPlatform({ repoArg: meta.repoId });
        const host = detected.host;

        if (meta.isPR && meta.prData) {
          const resolved = resolveCli(detected.platform);
          const spinner = ora({ prefixText: '  ' }).start(`Re-cloning ${meta.repoId} for PR resume...`);
          try {
            const result = cloneRepoForPR(meta.repoId, meta.prData.metadata.number, host, resolved.cli, spinner);
            activeCloneDir = result.tempDir;
            cwd = result.tempDir;
            spinner.stop();
          } catch (error) {
            spinner.fail(error.message);
            process.exit(1);
          }
        } else {
          const spinner = ora({ prefixText: '  ' }).start(`Re-cloning ${meta.repoId} for resume...`);
          try {
            const result = cloneRepo(meta.repoId, host, spinner);
            activeCloneDir = result.tempDir;
            cwd = result.tempDir;
            spinner.stop();
          } catch (error) {
            spinner.fail(error.message);
            process.exit(1);
          }
        }
      } else if (meta.sourceCwd && fs.existsSync(meta.sourceCwd)) {
        cwd = meta.sourceCwd;
      }

      try {
        await generateStory(meta.query, {
          cwd,
          repoId: meta.repoId,
          prData: meta.prData,
          verbose: !!options.verbose,
          resume: { generationDir, meta },
        });
      } catch (error) {
        console.error(`  Resume failed: ${error.message}`);
        process.exit(1);
      }

      process.exit(0);
    }

    // Normal mode
    if (!query && !options.pr) {
      console.error('Error: must provide a query or --pr <number>');
      process.exit(1);
    }

    // Detect platform and resolve CLI
    let cli = null;
    let platform = null;
    let host = null;
    if (options.pr) {
      const detected = detectPlatform({ cwd: process.cwd(), repoArg: options.repo });
      platform = detected.platform;
      host = detected.host;
      const resolved = resolveCli(platform);
      cli = resolved.cli;
    }

    let repoId = null;
    let exitCode = 0;
    let prData = null;

    const spinner = ora({ prefixText: '  ' });

    try {
      if (options.repo) {
        spinner.start();
        if (!platform) {
          const detected = detectPlatform({ repoArg: options.repo });
          platform = detected.platform;
          host = detected.host;
        }
        if (options.pr) {
          const result = cloneRepoForPR(options.repo, options.pr, host, cli, spinner);
          activeCloneDir = result.tempDir;
          repoId = result.repoId;
        } else {
          const result = cloneRepo(options.repo, host, spinner);
          activeCloneDir = result.tempDir;
          repoId = result.repoId;
        }
        spinner.stop();
      }

      const cwd = activeCloneDir || process.cwd();

      if (options.pr) {
        const mrLabel = cli === 'glab' ? 'MR' : 'PR';
        spinner.start(`Fetching ${mrLabel} data...`);
        prData = fetchPRData(options.pr, cwd, cli);
        spinner.stop();

        if (!query) {
          query = `Review ${mrLabel} #${prData.metadata.number}: ${prData.metadata.title}`;
        }
      }

      await generateStory(query, {
        cwd,
        repoId,
        prData,
        verbose: !!options.verbose,
      });
    } catch (error) {
      spinner.fail(error.message);
      exitCode = 1;
    } finally {
      if (activeCloneDir) {
        cleanupClone(activeCloneDir);
        activeCloneDir = null;
      }
    }

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  });

program.parse();
