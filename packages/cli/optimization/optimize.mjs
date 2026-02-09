#!/usr/bin/env node

/**
 * Prompt Optimization Loop for code-stories CLI
 *
 * Runs iterative cycles where Claude:
 * 1. Generates stories using the current prompt (via the CLI tool)
 * 2. Evaluates the output against overall_goals.md
 * 3. Writes reflections for that iteration
 * 4. Proposes and applies prompt improvements
 *
 * Each iteration builds on previous reflections so Claude learns over time.
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OPTIMIZATION_DIR = path.resolve('/app/optimization');
const RESULTS_DIR = path.join(OPTIMIZATION_DIR, 'results');
const CLI_ENTRY = '/app/index.js';
const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS || '5', 10);
const QUERIES_TO_TEST = parseInt(process.env.QUERIES_TO_TEST || '2', 10);

// Ensure results directory exists
fs.mkdirSync(RESULTS_DIR, { recursive: true });

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

function parseQueries(queriesMd) {
  const queries = [];
  const lines = queriesMd.split('\n');
  let currentRepo = null;
  let inQuerySection = false;
  for (const line of lines) {
    if (line.startsWith('## Query')) {
      inQuerySection = true;
      continue;
    }
    if (!inQuerySection) continue;
    const repoMatch = line.match(/^repo:\s*(.+)/i);
    if (repoMatch) {
      currentRepo = repoMatch[1].trim();
      continue;
    }
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      queries.push({ query: trimmed, repo: currentRepo });
      currentRepo = null;
    }
  }
  return queries;
}

function runCommand(cmd, args, { input, cwd, timeout = 18_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: cwd || '/app',
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    if (input) {
      proc.stdin.write(input);
      proc.stdin.end();
    }

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runClaude(prompt, { timeout = 18_000_000 } = {}) {
  const result = await runCommand('claude', [
    '-p',
    '--dangerously-skip-permissions',
    '--output-format', 'text',
  ], {
    input: prompt,
    timeout,
  });

  if (result.code !== 0) {
    const stderrSnippet = result.stderr ? result.stderr.slice(0, 500) : 'none';
    throw new Error(`Claude exited with code ${result.code}. stderr: ${stderrSnippet}`);
  }
  return result.stdout;
}

async function generateStory(query, repo) {
  console.log(`  Running: code-stories "${query.slice(0, 60)}..."${repo ? ` (repo: ${repo})` : ''}`);
  const args = [CLI_ENTRY, query];
  if (repo) args.push('--repo', repo);
  const result = await runCommand('node', args, {
    cwd: '/app',
    timeout: 18_000_000,
  });
  return {
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function getLatestStory() {
  const manifestPath = '/app/stories/manifest.json';
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFile(manifestPath));
  if (manifest.stories.length === 0) return null;
  const latest = manifest.stories[0];
  const storyPath = `/app/stories/${latest.id}.json`;
  if (!fs.existsSync(storyPath)) return null;
  return JSON.parse(readFile(storyPath));
}

function getPreviousReflections(iteration, maxReflections = 3) {
  const reflections = [];
  const startFrom = Math.max(1, iteration - maxReflections);
  for (let i = startFrom; i < iteration; i++) {
    const reflPath = path.join(RESULTS_DIR, `iteration-${i}`, 'reflections.md');
    if (fs.existsSync(reflPath)) {
      reflections.push(`### Iteration ${i} Reflections\n${readFile(reflPath)}`);
    }
  }
  return reflections.join('\n\n---\n\n');
}

function getCurrentPromptSource() {
  // Read the buildPrompt function from index.js
  const source = readFile(CLI_ENTRY);
  const match = source.match(/function buildPrompt\([\s\S]*?^}/m);
  if (match) return match[0];
  // Fallback: return the whole file
  return source;
}

async function runIteration(iteration, queries, goals) {
  const iterDir = path.join(RESULTS_DIR, `iteration-${iteration}`);
  fs.mkdirSync(iterDir, { recursive: true });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`ITERATION ${iteration} / ${MAX_ITERATIONS}`);
  console.log(`${'='.repeat(60)}\n`);

  // Save the prompt used for this iteration
  const currentPromptSource = getCurrentPromptSource();
  fs.writeFileSync(path.join(iterDir, 'current_prompt.js'), currentPromptSource);
  console.log(`  Current prompt saved to iteration-${iteration}/current_prompt.js`);

  // --- Phase 1: Generate stories with current prompt ---
  console.log('Phase 1: Generating stories with current prompt...\n');

  const selectedQueries = queries.slice(0, QUERIES_TO_TEST);
  const storyResults = [];

  for (const { query, repo } of selectedQueries) {
    const result = await generateStory(query, repo);
    const story = result.exitCode === 0 ? getLatestStory() : null;

    storyResults.push({
      query,
      repo,
      success: result.exitCode === 0,
      story,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    // Save individual result
    const safeQuery = query.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_');
    fs.writeFileSync(
      path.join(iterDir, `story_${safeQuery}.json`),
      JSON.stringify(story || { error: 'generation failed' }, null, 2)
    );

    // Save logs for failed stories
    if (result.exitCode !== 0) {
      fs.writeFileSync(
        path.join(iterDir, `story_${safeQuery}_log.txt`),
        `EXIT CODE: ${result.exitCode}\n\n--- STDOUT ---\n${result.stdout}\n\n--- STDERR ---\n${result.stderr}`
      );
    }
  }

  // Fail if all stories failed
  if (!storyResults.some(r => r.success)) {
    throw new Error(`Iteration ${iteration}: All ${storyResults.length} story generations failed. Cannot proceed with evaluation.`);
  }

  // --- Phase 2: Evaluate results and write reflections ---
  console.log('\nPhase 2: Evaluating results and writing reflections...\n');

  const previousReflections = getPreviousReflections(iteration);
  const currentPrompt = getCurrentPromptSource();

  const storySummaries = storyResults.map((r, i) => {
    if (!r.success || !r.story) {
      return `### Query ${i + 1}: "${r.query}"\n**FAILED** - Story generation did not produce output.\nstderr: ${r.stderr?.slice(0, 300) || 'none'}`;
    }
    const s = r.story;
    const chapterSummary = s.chapters.map((ch) =>
      `- **${ch.label}**: ${ch.snippets.length} snippet(s), explanation length: ${ch.explanation.length} chars`
    ).join('\n');
    return `### Query ${i + 1}: "${r.query}"\n**Title**: ${s.title}\n**Chapters**: ${s.chapters.length}\n${chapterSummary}\n\n**Sample explanation (Chapter 2)**:\n${s.chapters[1]?.explanation?.slice(0, 500) || 'N/A'}`;
  }).join('\n\n---\n\n');

  const evaluationPrompt = `You are a prompt engineer optimizing a code story generation tool.

## Overall Goals (North Star)
${goals}

## Current buildPrompt Function
\`\`\`javascript
${currentPrompt}
\`\`\`

${previousReflections ? `## Reflections From Previous Iterations\n${previousReflections}\n` : ''}

## Stories Generated This Iteration
${storySummaries}

## Your Task

Write a detailed reflection for this iteration. Structure it as:

### What Worked Well
- Specific things the current prompt does well (cite examples from the stories)

### What Needs Improvement
- Specific problems observed (cite examples from the stories)
- How these relate to the overall goals

### Patterns Across Queries
- Common strengths or weaknesses across different query types

### Specific Prompt Changes to Try Next
- Concrete, actionable changes to the buildPrompt function
- For each change, explain WHY it should help
- Reference specific lines or sections of the prompt to modify

### Priority Score (1-10)
Rate how close the current output is to the overall goals. 10 = perfect.

Be honest and specific. Vague feedback like "make it better" is not useful.`;

  const reflections = await runClaude(evaluationPrompt);
  if (!reflections || reflections.trim().length < 50) {
    throw new Error(`Iteration ${iteration}: Reflections output is empty or too short (${reflections?.trim().length || 0} chars). Claude may have failed silently.`);
  }
  fs.writeFileSync(path.join(iterDir, 'reflections.md'), reflections);
  console.log(`  Reflections saved to iteration-${iteration}/reflections.md`);

  // --- Phase 3: Generate and apply prompt improvements ---
  console.log('\nPhase 3: Generating prompt improvements...\n');

  const improvementPrompt = `You are a prompt engineer. Based on the reflections below, generate an improved version of the buildPrompt function.

## Overall Goals
${goals}

## Current Reflections
${reflections}

${previousReflections ? `## Previous Iteration Reflections (for context)\n${previousReflections}\n` : ''}

## Current buildPrompt Function (from /app/index.js)
\`\`\`javascript
${currentPrompt}
\`\`\`

## Your Task

Output ONLY the improved buildPrompt function. No commentary before or after.
The function signature must remain: function buildPrompt(query, generationDir, commitHash, generationId, repoId)
The jsonSchema variable and the 5-stage structure must be preserved.
The function must return a template string.

Focus your changes on:
1. The specific improvements identified in the reflections
2. Maintaining everything that works well
3. Small, targeted changes (don't rewrite from scratch)

Output the complete function, ready to paste into index.js:`;

  const improvedFunction = await runClaude(improvementPrompt);
  if (!improvedFunction || improvedFunction.trim().length < 50) {
    throw new Error(`Iteration ${iteration}: Improved prompt output is empty or too short (${improvedFunction?.trim().length || 0} chars). Claude may have failed silently.`);
  }
  fs.writeFileSync(path.join(iterDir, 'improved_prompt.js'), improvedFunction);
  console.log(`  Improved prompt saved to iteration-${iteration}/improved_prompt.js`);

  // --- Phase 4: Apply the improvement to index.js ---
  console.log('\nPhase 4: Applying prompt improvement...\n');

  // Create backup before modification
  fs.copyFileSync(CLI_ENTRY, path.join(iterDir, 'index.js.backup'));

  const applyPrompt = `You have access to the filesystem. Your task:

1. Read /app/index.js
2. Read /app/optimization/results/iteration-${iteration}/improved_prompt.js which contains an improved buildPrompt function
3. Replace the buildPrompt function in /app/index.js with the improved version from the file
4. The function starts with "function buildPrompt(" and ends with the closing "}" of that function
5. Make sure the replacement is syntactically valid JavaScript
6. Write the updated file back to /app/index.js

Do not change anything outside the buildPrompt function.`;

  await runClaude(applyPrompt, { timeout: 18_000_000 });

  // Verify the file is still valid
  try {
    execSync('node --check /app/index.js', { encoding: 'utf-8' });
    console.log('  index.js syntax check passed');
  } catch (e) {
    console.error('  ERROR: index.js has syntax errors after modification, reverting...');
    const backup = path.join(iterDir, 'index.js.backup');
    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, CLI_ENTRY);
      console.error('  Reverted to pre-Phase 4 backup.');
    }
    throw new Error(`Iteration ${iteration}: Phase 4 introduced syntax errors in index.js. Reverted and stopping. Error: ${e.message}`);
  }

  // Save a backup of the current state
  fs.copyFileSync(CLI_ENTRY, path.join(iterDir, 'index.js.snapshot'));

  console.log(`\nIteration ${iteration} complete.`);
}

async function main() {
  console.log('=== Code Stories Prompt Optimization Loop ===\n');

  const goals = readFile(path.join(OPTIMIZATION_DIR, 'overall_goals.md'));
  const queriesMd = readFile(path.join(OPTIMIZATION_DIR, 'queries.md'));
  const queries = parseQueries(queriesMd);

  if (queries.length === 0) {
    throw new Error('No queries parsed from queries.md. Check the file format.');
  }
  if (queries.length < QUERIES_TO_TEST) {
    throw new Error(`Only ${queries.length} queries parsed, but QUERIES_TO_TEST=${QUERIES_TO_TEST}. Add more queries or reduce QUERIES_TO_TEST.`);
  }

  console.log(`Goals loaded from overall_goals.md`);
  console.log(`Queries found: ${queries.length}`);
  console.log(`Max iterations: ${MAX_ITERATIONS}`);
  console.log(`Queries per iteration: ${QUERIES_TO_TEST}`);
  console.log(`Queries: ${queries.map(q => `${q.repo ? `[${q.repo}] ` : ''}"${q.query.slice(0, 50)}..."`).join(', ')}`);

  // Save a backup of the original index.js
  fs.copyFileSync(CLI_ENTRY, path.join(RESULTS_DIR, 'index.js.original'));

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    await runIteration(i, queries, goals);
  }

  // --- Final summary ---
  console.log(`\n${'='.repeat(60)}`);
  console.log('OPTIMIZATION COMPLETE');
  console.log(`${'='.repeat(60)}\n`);
  console.log(`Results saved in: ${RESULTS_DIR}/`);
  console.log('Each iteration directory contains:');
  console.log('  - reflections.md     (what worked, what to improve)');
  console.log('  - improved_prompt.js (the updated buildPrompt function)');
  console.log('  - index.js.snapshot  (full file after changes)');
  console.log('  - story_*.json       (generated stories for evaluation)');
  console.log('\nTo use the optimized prompt, copy the final index.js.snapshot');
  console.log('back into your project.');
}

main().catch((err) => {
  console.error('Optimization loop failed:', err);
  process.exit(1);
});
