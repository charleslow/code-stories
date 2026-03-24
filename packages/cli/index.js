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

// Maximum time (ms) the Claude subprocess may run before being killed.
const GENERATION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// Maximum time (ms) allowed without any stage progress before aborting.
const STALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Stage definitions for progress tracking
const STAGES = [
  { file: 'exploration_scan.md', checkpoint: 'EXPLORATION_SCANNED', label: 'Scanning file tree' },
  { file: 'exploration_read.md', checkpoint: 'EXPLORATION_READ', label: 'Reading key files' },
  { file: 'exploration_notes.md', checkpoint: 'STAGE_1_COMPLETE', label: 'Documenting architecture' },
  { file: 'narrative_outline.md', checkpoint: 'STAGE_2_COMPLETE', label: 'Planning outline' },
  { file: 'narrative_outline_reviewed.md', checkpoint: 'STAGE_3_COMPLETE', label: 'Reviewing outline' },
  { file: 'snippets_mapping.md', checkpoint: 'STAGE_4_COMPLETE', label: 'Identifying snippets' },
  { file: 'explanations_draft.md', checkpoint: 'STAGE_5_COMPLETE', label: 'Crafting explanations' },
  { file: 'story.json', checkpoint: null, label: 'Finalizing story' },
];

// Check current stage based on files
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

// Generate a story
async function generateStory(query, options = {}) {
  const { cwd = process.cwd(), repoId = null, prData = null } = options;

  ensureDirectories();

  const generationId = uuidv4();
  const generationDir = path.join(TMP_DIR, generationId);
  fs.mkdirSync(generationDir, { recursive: true });

  const commitHash = getCommitHash(cwd);
  const prompt = prData
    ? buildPRPrompt(query, generationDir, commitHash, generationId, repoId, prData)
    : buildPrompt(query, generationDir, commitHash, generationId, repoId);

  console.log('\n  Code Stories Generator\n');
  if (repoId) {
    console.log(`  Repo: ${repoId}`);
  }
  console.log(`  Query: "${query}"`);
  console.log(`  Commit: ${commitHash.slice(0, 7)}`);
  console.log('');

  const spinner = ora({
    text: `${STAGES[0].label} (0%)`,
    prefixText: '  ',
  }).start();

  let currentStage = 0;
  let lastProgressAt = Date.now();

  // Poll for progress updates and detect stalls
  const progressInterval = setInterval(() => {
    const stage = getCurrentStage(generationDir);
    if (stage !== currentStage && stage < STAGES.length) {
      currentStage = stage;
      lastProgressAt = Date.now();
      const percent = Math.round((stage / STAGES.length) * 100);
      spinner.text = `${STAGES[stage].label} (${percent}%)`;
    }
  }, 1000);

  return new Promise((resolve, reject) => {
    // Spawn Claude CLI
    const allowedTools = 'Read,Grep,Glob,Write';
    const claude = spawn('claude', [
      '-p',
      '--allowedTools', allowedTools,
      '--add-dir', generationDir,
    ], {
      cwd,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE')
      ),
    });

    // Send prompt via stdin
    claude.stdin.on('error', (err) => {
      // Handle EPIPE gracefully - Claude process may have exited early
      if (err.code !== 'EPIPE') throw err;
    });
    let stdout = '';
    claude.stdout.on('data', (data) => { stdout += data.toString(); }); // Consume stdout
    claude.stdin.write(prompt);
    claude.stdin.end();

    let stderr = '';
    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Overall generation timeout
    const generationTimer = setTimeout(() => {
      clearInterval(progressInterval);
      clearInterval(stallTimer);
      claude.kill('SIGTERM');
      spinner.fail(`Generation timed out after ${GENERATION_TIMEOUT_MS / 60_000} minutes.`);
      reject(new Error('Generation timed out'));
    }, GENERATION_TIMEOUT_MS);

    // Stall detection — abort if no stage progress for too long
    const stallTimer = setInterval(() => {
      const elapsed = Date.now() - lastProgressAt;
      if (elapsed > STALL_TIMEOUT_MS) {
        clearInterval(progressInterval);
        clearInterval(stallTimer);
        clearTimeout(generationTimer);
        claude.kill('SIGTERM');
        const stuckLabel = STAGES[currentStage]?.label || 'unknown stage';
        spinner.fail(`Generation stalled at "${stuckLabel}" for ${Math.round(elapsed / 60_000)} minutes. This may indicate the diff is too large.`);
        reject(new Error('Generation stalled'));
      }
    }, 10_000);

    claude.on('error', (error) => {
      clearInterval(progressInterval);
      clearInterval(stallTimer);
      clearTimeout(generationTimer);
      spinner.fail(`Failed to spawn Claude CLI: ${error.message}`);
      reject(error);
    });

    claude.on('close', (code) => {
      clearInterval(progressInterval);
      clearInterval(stallTimer);
      clearTimeout(generationTimer);

      // Check if story.json was created
      const storyPath = path.join(generationDir, 'story.json');
      if (fs.existsSync(storyPath)) {
        try {
          const story = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));

          // Validate story.id is a proper UUID
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!story.id || !uuidRegex.test(story.id)) {
            throw new Error(`Invalid story ID: "${story.id}" is not a valid UUID. Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`);
          }

          // Copy to stories directory
          const finalPath = path.join(STORIES_DIR, `${story.id}.json`);
          fs.writeFileSync(finalPath, JSON.stringify(story, null, 2));

          // Update manifest (with file locking for concurrent safety)
          updateManifest(STORIES_DIR, {
            id: story.id,
            title: story.title,
            commitHash: story.commitHash,
            createdAt: story.createdAt,
          });

          // Clean up tmp directory
          fs.rmSync(generationDir, { recursive: true, force: true });

          spinner.succeed(`Story generated: ${story.title}`);
          console.log(`\n  Saved to: ${finalPath}\n`);
          resolve(story);
        } catch (error) {
          spinner.fail(`Error processing story: ${error.message}`);
          reject(error);
        }
      } else {
        spinner.fail(`Generation failed - story.json not created (exit code: ${code})`);
        console.log(`\n  Check intermediate files in: ${generationDir}\n`);
        if (stderr) {
          console.log(`  stderr: ${stderr.slice(0, 1000)}\n`);
        }
        if (stdout) {
          console.log(`  stdout: ${stdout.slice(0, 1000)}\n`);
        }
        reject(new Error('story.json not created'));
      }
    });
  });
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
  .description('Generate narrative-driven code stories using Claude')
  .version('0.1.0')
  .argument('[query]', 'Question about the codebase to generate a story for')
  .option('-r, --repo <repo>', 'GitHub or GitLab repository (user/repo or full URL)')
  .option('--pr <number>', 'PR/MR number to review', parseInt)
  .action(async (query, options) => {
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
