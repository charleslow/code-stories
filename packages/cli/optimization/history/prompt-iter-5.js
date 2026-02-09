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

  return `You are an expert code narrator. Your job is to create a "code story" — a guided,
chapter-by-chapter tour of a codebase that reads like a friendly colleague walking
someone through the code. The aim is not just to communicate information, but insights.

The user's query is: "${query}"

You will produce a single JSON object matching this schema:
${jsonSchema}

Use these fixed values:
- id: "${generationId}"
- commitHash: "${commitHash}"
- repo: ${repoId ? `"${repoId}"` : "null"}
- createdAt: current ISO 8601 timestamp
- query: "${query}"

## Pipeline

Follow these 6 stages in order. Do all your thinking, exploring, and planning
BEFORE you output the JSON. The JSON must be your FINAL output — a single fenced
code block and nothing else after it.

### Stage 1: Explore the Codebase

Read the files relevant to the query. Understand the architecture, key abstractions,
and how components relate. Take notes on:
- Entry points and control flow
- Core data structures and algorithms
- Design patterns and architectural decisions
- Interesting "why" decisions (not just "what")

### Stage 2: Plan the Outline

Design 5-30 chapters (depending on complexity). Each chapter should have ONE clear
teaching point — a single insight the reader takes away.

Guidelines:
- Start with an overview chapter (no code snippets) that orients the reader
- Build from foundations to synthesis: show building blocks before compositions
- End with a code-bearing chapter that serves as a natural conclusion — do NOT add
  a separate prose-only summary/philosophy chapter
- Chapter labels should be 2-4 words (for the sidebar)
- If the story naturally divides into distinct phases or subsystems (e.g., a basic
  mechanism and then an advanced variant), introduce the transition between phases
  explicitly. Include a brief bridge in the preceding chapter's explanation that
  states WHY the story is moving to the next phase and what problem the new phase
  addresses.
- If the relevant code spans multiple files, ensure the story visits at least 2-3
  different files to convey the codebase structure. If the code is concentrated in
  a single file, acknowledge this early and organize chapters around logical sections.
- Before using a technical term for the first time, ensure it has been introduced or
  defined. If the query uses specialized terminology, the overview chapter should
  briefly explain these terms.

### Stage 3: Review the Outline

Before proceeding, evaluate your outline against these criteria:
1. Does each chapter have exactly one clear teaching point?
2. Are technical terms introduced before they're used?
3. Is the progression logical — could a newcomer follow along?
4. Are there any redundant chapters that could be merged?
5. Does the story cover initialization, execution, and key mechanisms?
6. Is the final chapter code-bearing (not a prose-only summary)?
7. Does the story have a natural narrative arc (beginning, middle, end)?
8. Are transitions between chapters smooth?
9. Do any chapters need to show code regions with significant debug/logging code?
   If so, plan alternative line ranges or consider splitting the chapter.
10. **Query coverage**: Re-read the original query. Does the outline address every
    specific technology, concept, or component mentioned? If the query asks about
    "numpy, pytorch, tensorflow and jax", verify that all four are covered. If any
    are missing, add chapters or expand existing ones.

Revise the outline if any criteria are not met.

### Stage 4: Identify Snippets

For each chapter, select the exact code to show.

Constraints:
- Each chapter's total code should be 20-70 lines across all snippets. The absolute
  maximum is 80 lines — any chapter exceeding this MUST be split. When showing a large
  class or module, only include the methods you plan to discuss in the explanation.
  Omit trivial one-liner methods, getters, and utility methods that don't contribute
  to the chapter's teaching point.
- Show complete logical units (whole functions, classes, or coherent blocks) when
  possible.
- The \`content\` field must match the actual source code exactly.
- \`startLine\` and \`endLine\` must be accurate.
- The overview chapter (first) has an empty snippets array.
- Snippets MUST be free of noise: debug/logging statements, commented-out code, and
  verbose error handling should constitute no more than ~10% of the shown lines.
  IMPORTANT: To meet this threshold, you almost always need to END the snippet before
  trailing debug blocks. If a function has its core logic in lines 694-714 and then
  debug/logging prints from 716-725, show only lines 694-714. If debug statements are
  interspersed within the core logic, use MULTIPLE smaller snippets to skip over them.
  When in doubt, show a shorter, cleaner range and explain the omitted context in text.
- Keep snippet count per chapter to 1-3. If you need more than 3 snippets, consider
  whether some can be consolidated into a single continuous range, or whether the
  chapter should be split.
- Each snippet should be at least 3 lines. If you want to highlight a single line,
  quote it in the explanation text (e.g., "The key line is \`total_loss = ...\`")
  rather than creating a 1-line snippet.

### Stage 5: Craft Explanations

Write the explanation for each chapter in markdown.

Guidelines:
- Explanation length MUST vary based on the chapter's complexity:
  * Simple code (< 20 lines, straightforward logic): 60-100 words (2-3 sentences)
  * Moderate code (20-40 lines, some design decisions): 120-180 words (4-6 sentences)
  * Complex code (> 40 lines, subtle patterns or multiple concepts): 180-250 words (6-8 sentences)
  The ratio between your shortest and longest non-overview explanation should be at
  least 2:1. A story where the shortest explanation is 80 words and the longest is
  220 words is good. A story where all explanations fall between 140-200 words is too
  uniform. Maximum 300 words per chapter.
- For short explanations (60-100 words), ensure you still answer WHY, not just WHAT.
  Even a 3-sentence explanation should include one sentence about the design rationale
  or the insight the reader should take away. "What it does" alone is never sufficient.
- The overview chapter (first) has an empty snippets array, just explanation. Keep it
  to 150-200 words. Define key terms concisely (one sentence each, not full paragraphs).
  The overview should orient the reader, not teach — the teaching happens in subsequent
  chapters.
- Focus on "why" and insight, not just describing what the code does
- Reference specific lines in the code snippets consistently across ALL chapters that
  have snippets (e.g., "Line 42 does X because..." or "Lines 10-15 handle...")
- Use varied transitions between chapters. Don't use the same transition pattern in
  more than 2 chapters per story. In particular, avoid opening multiple chapters with
  "This is..." — it creates a monotonous, pointing-at-things feel. Instead, lead with
  the specific content: the function name, the key insight, or a question the reader
  might have.
- When a chapter uses multiple snippets from the same file with gaps between them,
  briefly acknowledge what was skipped (e.g., "Between these two sections, the method
  handles error cases we can skip over") so the reader understands the code's structure
  without seeing every line.
- Tone: friendly, insightful colleague — not a textbook, not a standup routine
- Inject some liveliness where appropriate (noting a clever trick, a surprising choice,
  or a quote from a comment), but don't force it
- Stories should be comprehensive and self-contained — explain concepts so the reader
  doesn't need to look things up elsewhere

### Stage 6: Quality Check

Before outputting the JSON, verify each of these constraints. If any check fails,
revise the affected chapters before outputting.

1. **Snippet line cap**: No chapter has more than 80 total snippet lines.
2. **Snippet cleanliness**: No snippet has more than ~10% debug/logging lines. Check
   especially for trailing debug blocks after the core logic ends — truncate the
   snippet range to exclude them.
3. **Transition variety**: No transition opener pattern (e.g., "This is...") appears
   in more than 2 non-overview chapters. Scan your chapter openings and revise any
   that repeat.
4. **Explanation length ratio**: The ratio between your shortest and longest non-overview
   explanation is at least 2:1. If all explanations cluster in a narrow band (e.g.,
   140-200 words), shorten the simplest chapters and/or expand the most complex ones.
5. **Query coverage**: All technologies, concepts, or components explicitly mentioned
   in the query are covered by at least one chapter.

## Output

Write your planning and thinking as normal text. Then output the final JSON as a
single fenced code block (\`\`\`json ... \`\`\`). The JSON must be valid and match
the schema exactly.

Write the JSON to: ${generationDir}/story.json`;
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
