#!/usr/bin/env node

import { program } from 'commander';
import ora from 'ora';
import { spawn, execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { buildPrompt } from './prompt.js';

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

// Parse GitHub repo identifier (supports user/repo or full URL)
function parseGitHubRepo(repo) {
  const urlMatch = repo.match(/github\.com[/:]([^/]+\/[^/.]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  return repo;
}

// Clone a GitHub repo to a temp directory
function cloneRepo(repo, spinner) {
  const repoId = parseGitHubRepo(repo);
  const cloneUrl = `https://github.com/${repoId}.git`;
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

// Stage definitions for progress tracking
const STAGES = [
  { file: 'exploration_notes.md', checkpoint: 'STAGE_1_COMPLETE', label: 'Exploring codebase' },
  { file: 'narrative_outline.md', checkpoint: 'STAGE_2_COMPLETE', label: 'Creating narrative outline' },
  { file: 'narrative_outline.md', checkpoint: 'STAGE_3_COMPLETE', label: 'Reviewing flow' },
  { file: 'snippets_mapping.md', checkpoint: 'STAGE_4_COMPLETE', label: 'Identifying code snippets' },
  { file: 'story.json', checkpoint: null, label: 'Crafting explanations' },
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

// Generate a story
async function generateStory(query, options = {}) {
  const { cwd = process.cwd(), repoId = null } = options;

  ensureDirectories();

  const generationId = uuidv4();
  const generationDir = path.join(TMP_DIR, generationId);
  fs.mkdirSync(generationDir, { recursive: true });

  const commitHash = getCommitHash(cwd);
  const prompt = buildPrompt(query, generationDir, commitHash, generationId, repoId);

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

  // Poll for progress updates
  const progressInterval = setInterval(() => {
    const stage = getCurrentStage(generationDir);
    if (stage !== currentStage && stage < STAGES.length) {
      currentStage = stage;
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
      env: { ...process.env },
    });

    // Send prompt via stdin
    claude.stdin.write(prompt);
    claude.stdin.end();

    let stderr = '';
    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claude.on('error', (error) => {
      clearInterval(progressInterval);
      spinner.fail(`Failed to spawn Claude CLI: ${error.message}`);
      reject(error);
    });

    claude.on('close', (code) => {
      clearInterval(progressInterval);

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

          // Update manifest
          const manifestPath = path.join(STORIES_DIR, 'manifest.json');
          let manifest = { stories: [] };
          if (fs.existsSync(manifestPath)) {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          }
          manifest.stories.unshift({
            id: story.id,
            title: story.title,
            commitHash: story.commitHash,
            createdAt: story.createdAt,
          });
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

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
        spinner.fail('Generation failed - story.json not created');
        console.log(`\n  Check intermediate files in: ${generationDir}\n`);
        if (stderr) {
          console.log(`  stderr: ${stderr.slice(0, 500)}\n`);
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
  .argument('<query>', 'Question about the codebase to generate a story for')
  .option('-r, --repo <repo>', 'GitHub repository (user/repo or full URL)')
  .action(async (query, options) => {
    let repoId = null;
    let exitCode = 0;

    const spinner = ora({ prefixText: '  ' });

    try {
      if (options.repo) {
        spinner.start();
        const result = cloneRepo(options.repo, spinner);
        activeCloneDir = result.tempDir;
        repoId = result.repoId;
        spinner.stop();
      }

      await generateStory(query, {
        cwd: activeCloneDir || process.cwd(),
        repoId,
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
