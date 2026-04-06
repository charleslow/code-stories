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
const GENERATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Maximum time (ms) allowed without any stage progress before aborting.
const STALL_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

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

// Build a resume prompt that includes completed intermediate files
function buildResumePrompt(generationDir, meta) {
  const completedStage = getCurrentStage(generationDir);

  // Gather completed + any partial intermediate file contents
  const completedFiles = STAGES.slice(0, completedStage)
    .map(({ file }) => ({ name: file, path: path.join(generationDir, file) }))
    .filter(f => fs.existsSync(f.path))
    .map(f => ({ name: f.name, content: fs.readFileSync(f.path, 'utf-8') }));

  if (completedStage < STAGES.length) {
    const partialPath = path.join(generationDir, STAGES[completedStage].file);
    if (fs.existsSync(partialPath)) {
      const content = fs.readFileSync(partialPath, 'utf-8');
      if (content.trim()) {
        completedFiles.push({ name: STAGES[completedStage].file, content, partial: true });
      }
    }
  }

  const filesSection = completedFiles.map(f => {
    const tag = f.partial ? ' (PARTIAL — not yet completed)' : ' (COMPLETED)';
    return `### ${f.name}${tag}\n\`\`\`\n${f.content}\n\`\`\``;
  }).join('\n\n');

  const remainingStages = STAGES.slice(completedStage)
    .map((s, i) => `Stage ${completedStage + i + 1}: ${s.label}`);

  // Use the original prompt builder to get the full prompt, then wrap it
  const isPR = meta.isPR && meta.prData;
  const originalPrompt = isPR
    ? buildPRPrompt(meta.query, generationDir, meta.commitHash, meta.generationId, meta.repoId, meta.prData)
    : buildPrompt(meta.query, generationDir, meta.commitHash, meta.generationId, meta.repoId);

  return `${originalPrompt}

## IMPORTANT: This is a RESUME of a previously interrupted generation

The previous generation was interrupted at stage ${completedStage + 1} of ${STAGES.length}.
The following intermediate files have already been produced. Do NOT redo completed work.
Instead, read the completed files below, pick up from where things left off, and continue
through the remaining stages to completion.

### Completed progress (${completedStage} of ${STAGES.length - 1} stages done)

${filesSection}

### Remaining work
${remainingStages.map(s => `- ${s}`).join('\n')}

**Resume instructions:**
1. Read and internalize ALL the completed intermediate files above — they represent
   significant work that should not be discarded or redone.
2. If there is a partial file, complete it first (keep what's good, fix or extend as needed).
3. Continue with the remaining stages in order.
4. The final output must still be a valid story.json written to ${generationDir}/story.json.
5. Do NOT rewrite completed checkpoint files — they are already done.`;
}

// Generate a story
async function generateStory(query, options = {}) {
  const { cwd = process.cwd(), repoId = null, prData = null, verbose = false, resume = null } = options;

  ensureDirectories();

  let generationId, generationDir, commitHash, prompt;

  if (resume) {
    // Resume mode: reuse existing generation directory
    generationDir = resume.generationDir;
    generationId = resume.meta.generationId;
    commitHash = resume.meta.commitHash;
    prompt = buildResumePrompt(generationDir, resume.meta);
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
      isPR: !!prData,
      prData: prData || null,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(generationDir, 'metadata.json'), JSON.stringify(meta, null, 2));

    prompt = prData
      ? buildPRPrompt(query, generationDir, commitHash, generationId, repoId, prData)
      : buildPrompt(query, generationDir, commitHash, generationId, repoId);
  }

  if (!resume) {
    console.log('\n  Code Stories Generator\n');
    if (repoId) {
      console.log(`  Repo: ${repoId}`);
    }
    console.log(`  Query: "${query}"`);
    console.log(`  Commit: ${commitHash.slice(0, 7)}`);
    console.log('');
  }

  const initialStage = resume ? getCurrentStage(resume.generationDir) : 0;
  const initialPercent = Math.round((initialStage / STAGES.length) * 100);
  const initialLabel = initialStage < STAGES.length ? STAGES[initialStage].label : 'Finalizing';

  const spinner = verbose
    ? null
    : ora({ text: `${initialLabel} (${initialPercent}%)`, prefixText: '  ' }).start();

  let currentStage = initialStage;
  let lastProgressAt = Date.now();

  // Poll for progress updates and detect stalls
  const progressInterval = setInterval(() => {
    const stage = getCurrentStage(generationDir);
    if (stage !== currentStage && stage < STAGES.length) {
      currentStage = stage;
      lastProgressAt = Date.now();
      const percent = Math.round((stage / STAGES.length) * 100);
      if (spinner) {
        spinner.text = `${STAGES[stage].label} (${percent}%)`;
      } else {
        console.log(`  [${percent}%] ${STAGES[stage].label}`);
      }
    }
  }, 1000);

  return new Promise((resolve, reject) => {
    // Spawn Claude CLI
    const allowedTools = 'Read,Grep,Glob,Write';
    const args = [
      '-p',
      '--allowedTools', allowedTools,
      '--add-dir', generationDir,
    ];
    if (verbose) {
      args.push('--verbose');
    }
    const claude = spawn('claude', args, {
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
    claude.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (verbose) {
        process.stdout.write(chunk);
      }
    });
    claude.stdin.write(prompt);
    claude.stdin.end();

    let stderr = '';
    claude.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (verbose) {
        process.stderr.write(chunk);
      }
    });

    function fail(message) {
      if (spinner) spinner.fail(message);
      else console.error(`  Error: ${message}`);
    }

    function succeed(message) {
      if (spinner) spinner.succeed(message);
      else console.log(`  Done: ${message}`);
    }

    const genId = path.basename(generationDir);

    function clearTimers() {
      clearInterval(progressInterval);
      clearInterval(stallTimer);
      clearTimeout(generationTimer);
    }

    // Overall generation timeout
    const generationTimer = setTimeout(() => {
      clearTimers();
      claude.kill('SIGTERM');
      fail(`Generation timed out after ${GENERATION_TIMEOUT_MS / 60_000} minutes. Resume with: code-stories --resume ${genId}`);
      reject(new Error('Generation timed out'));
    }, GENERATION_TIMEOUT_MS);

    // Stall detection — abort if no stage progress for too long
    const stallTimer = setInterval(() => {
      const elapsed = Date.now() - lastProgressAt;
      if (elapsed > STALL_TIMEOUT_MS) {
        clearTimers();
        claude.kill('SIGTERM');
        const stuckLabel = STAGES[currentStage]?.label || 'unknown stage';
        fail(`Generation stalled at "${stuckLabel}" for ${Math.round(elapsed / 60_000)} minutes. Resume with: code-stories --resume ${genId}`);
        reject(new Error('Generation stalled'));
      }
    }, 10_000);

    claude.on('error', (error) => {
      clearTimers();
      fail(`Failed to spawn Claude CLI: ${error.message}`);
      reject(error);
    });

    claude.on('close', (code) => {
      clearTimers();

      // Check if story.json was created
      const storyPath = path.join(generationDir, 'story.json');
      if (fs.existsSync(storyPath)) {
        try {
          const { story, finalPath } = finalizeStory(generationDir);
          succeed(`Story generated: ${story.title}`);
          console.log(`\n  Saved to: ${finalPath}\n`);
          resolve(story);
        } catch (error) {
          fail(`Error processing story: ${error.message}`);
          reject(error);
        }
      } else {
        fail(`Generation failed - story.json not created (exit code: ${code})`);
        console.log(`\n  Check intermediate files in: ${generationDir}`);
        console.log(`  To resume: code-stories --resume ${genId}\n`);
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
      if (meta.repoId && meta.isPR && meta.prData) {
        // PR stories need the cloned repo — check if we can work from cwd
        // For now, use cwd (assumes user is in the right directory or repo was local)
        console.log('  Note: PR resume works best from the original repo directory.\n');
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
