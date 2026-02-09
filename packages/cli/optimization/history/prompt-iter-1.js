#!/usr/bin/env node

import { program } from 'commander';
import ora from 'ora';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// Configuration (use absolute paths so they work regardless of cwd)
const STORIES_DIR = path.resolve('./stories');
const TMP_DIR = path.join(STORIES_DIR, '.tmp');

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(STORIES_DIR)) {
    fs.mkdirSync(STORIES_DIR, { recursive: true });
  }
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

// Get current commit hash
function getCommitHash(cwd = process.cwd()) {
  try {
    return execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();
  } catch {
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
  execSync(`git clone --depth 1 "${cloneUrl}" "${tempDir}"`, {
    encoding: 'utf-8',
    stdio: 'pipe',
  });

  return { tempDir, repoId };
}

// Clean up cloned repo
function cleanupClone(tempDir) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
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

// Build the prompt for Claude
function buildPrompt(query, generationDir, commitHash, generationId, repoId) {
  const jsonSchema = `{
  "id": "string (UUID)",
  "title": "string",
  "query": "string",
  "repo": "string or null (GitHub user/repo if from remote)",
  "commitHash": "string",
  "createdAt": "string (ISO 8601)",
  "chapters": [
    {
      "id": "string (e.g., chapter-0)",
      "label": "string (2-4 words for sidebar)",
      "snippets": [
        {
          "filePath": "string (relative path)",
          "startLine": "number (1-indexed)",
          "endLine": "number (1-indexed)",
          "content": "string (actual code)"
        }
      ],
      "explanation": "string (markdown)"
    }
  ]
}`;

  return `You are creating a "code story" - a narrative-driven walkthrough that answers:
"${query}"

A code story is a sequence of "chapters". Each chapter shows a code snippet alongside
a markdown explanation. The story should flow like a guided tour through the
codebase, not a dry reference manual.

CRITICAL INSTRUCTIONS:
1. You MUST complete each stage fully before proceeding to the next
2. You MUST write the checkpoint marker at the end of each stage's file
3. You MUST verify the previous checkpoint exists before starting a new stage
4. Do NOT skip stages or work on multiple stages simultaneously

Working directory for this generation: ${generationDir}/

==========================================================================
STAGE 1: EXPLORE
==========================================================================
Analyze the codebase to understand the relevant code for this query.

Write your findings to: ${generationDir}/exploration_notes.md

Structure your notes as:

## Relevant Files
- List each file with a brief description of its role

## Key Components
- Important classes, functions, constants
- Their responsibilities and relationships

## Flow Analysis
- How data/control flows through the system for this query
- The sequence of operations

## Entry Points
- Where does the flow start?
- What triggers the process?

## Dependencies
- What calls what?
- External libraries or services involved

Be thorough but focused on what's relevant to the query.

End the file with exactly this line:
<!-- CHECKPOINT: STAGE_1_COMPLETE -->

==========================================================================
STAGE 2: OUTLINE
==========================================================================
Read ${generationDir}/exploration_notes.md and verify it contains STAGE_1_COMPLETE.

Create a narrative outline for the code story.

Write to: ${generationDir}/narrative_outline.md

Structure as:

## Story Title
(A clear, descriptive title for this code story)

## Overview
(2-3 sentences summarizing what this story will cover and why it matters)

## Chapter Sequence

### Chapter 1: [Short Label]
- **Purpose**: Why this chapter exists in the narrative
- **What to show**: Which file(s) and roughly which code
- **Key points**: What the reader should learn from this chapter
- **Transition**: How this connects to the next chapter

### Chapter 2: [Short Label]
...continue for all chapters...

Guidelines:
- Start with context/overview (first chapter may have no code, just explanation)
- Each chapter should have ONE main teaching point
- Chapters should build on each other logically
- End with resolution/summary if appropriate
- Aim for 5-25 chapters depending on complexity
- Labels should be 2-4 words (e.g., "Entry Point", "Parse Request", "Database Query")

End the file with exactly this line:
<!-- CHECKPOINT: STAGE_2_COMPLETE -->

==========================================================================
STAGE 3: REVIEW
==========================================================================
Read ${generationDir}/narrative_outline.md and verify it contains STAGE_2_COMPLETE.

Critically review the outline for quality and flow.

Evaluate:
1. **Logical Flow**: Does each chapter naturally lead to the next?
2. **Completeness**: Are there gaps where the reader would be confused?
3. **Redundancy**: Are any chapters repetitive or unnecessary?
4. **Pacing**: Is the story well-paced? Not too fast or too slow?
5. **Clarity**: Will a reader unfamiliar with the codebase follow along?
6. **Cohesion**: Does the story feel unified, not fragmented?

If you find issues, revise the outline directly in the file.

Add a section at the end:

## Review Notes
- What changes were made and why
- Any concerns or trade-offs in the narrative

Replace the Stage 2 checkpoint with:
<!-- CHECKPOINT: STAGE_3_COMPLETE -->

==========================================================================
STAGE 4: IDENTIFY SNIPPETS
==========================================================================
Read ${generationDir}/narrative_outline.md and verify it contains STAGE_3_COMPLETE.

For each chapter in the outline, identify the exact code snippets to display.

Write to: ${generationDir}/snippets_mapping.md

For each chapter:

### Chapter N: [Label]

**Snippet 1:**
- File: path/to/file.py (relative to codebase root)
- Lines: start-end (1-indexed, inclusive)
- Reason: Why this specific code segment was chosen

**Snippet 2 (if needed):**
- File: path/to/other.py
- Lines: start-end
- Reason: Why showing this alongside snippet 1

Constraints:
- Each chapter's total code should be ~40-80 lines max (fits 1-2 screens)
- Prefer showing complete logical units (whole functions when possible)
- If a function is too long, show the most relevant portion
- Snippets should be self-contained enough to understand
- Include imports/context only if essential for understanding
- The overview chapter (Chapter 1) typically has no snippets

End the file with exactly this line:
<!-- CHECKPOINT: STAGE_4_COMPLETE -->

==========================================================================
STAGE 5: CRAFT EXPLANATIONS & OUTPUT JSON
==========================================================================
Read ${generationDir}/snippets_mapping.md and verify it contains STAGE_4_COMPLETE.

Now create the final story JSON with context-aware explanations.

Read the code for each snippet identified in Stage 4. For each chapter, write an
explanation that:

1. **Connects to previous**: Reference what we just saw (except for first chapter)
   Example: "Building on the router we just saw..."

2. **Explains the code**: What this code does and WHY it matters
   Example: "This function validates the input before passing it to..."

3. **Highlights key details**: Point out important lines, patterns, or decisions
   Example: "Notice how line 23 handles the edge case where..."

4. **Bridges to next**: Subtle setup for what's coming (except for last chapter)
   Example: "The result is then passed to the service layer, which we'll see next."

The explanation should feel like a knowledgeable colleague walking you through
the code, not a dry API reference.

Write to: ${generationDir}/story.json

Use these values:
- id: "${generationId}"
- query: "${query.replace(/"/g, '\\"')}"
- repo: ${repoId ? `"${repoId}"` : 'null'}
- commitHash: "${commitHash}"
- createdAt: "${new Date().toISOString()}"

The JSON must match this schema exactly:
${jsonSchema}

Additional guidelines for explanations:
- Use markdown formatting (headers, **bold**, \`code references\`)
- Reference specific function/variable names from the snippets
- Keep explanations concise but insightful (3-8 sentences typical)
- The overview chapter (first) has empty snippets array, just explanation
- Use phrases like "Notice how...", "This is where...", "Building on..."
- Don't just describe what the code does - explain WHY it's designed this way

When story.json is complete, generation is finished.`;
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
      '--dangerously-skip-permissions',
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
