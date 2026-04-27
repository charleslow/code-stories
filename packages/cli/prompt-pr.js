import fs from 'fs';
import path from 'path';
import { NARRATOR_PREAMBLE, formatCheckpointInstruction } from './prompt.js';

/**
 * Write per-file diffs into a diffs/ subdirectory inside generationDir.
 * Returns the path to the diffs directory.
 */
function writeDiffFiles(generationDir, diff, rawDiff) {
  const diffsDir = path.join(generationDir, 'diffs');
  fs.mkdirSync(diffsDir, { recursive: true });

  // Write each file's diff as a separate file
  for (const file of diff) {
    // Sanitize path: replace / with __ to flatten into a single directory
    const safeName = file.path.replace(/\//g, '__') + '.diff';
    const hunksText = file.hunks.map(h => {
      const lines = h.lines.map(l => {
        if (l.type === 'added') return `+${l.content}`;
        if (l.type === 'removed') return `-${l.content}`;
        return ` ${l.content}`;
      }).join('\n');
      return `@@ -${h.oldStart} +${h.newStart} @@\n${lines}`;
    }).join('\n\n');
    fs.writeFileSync(path.join(diffsDir, safeName), hunksText);
  }

  // Also write the full raw diff for comprehensive grep
  fs.writeFileSync(path.join(diffsDir, '_full.diff'), rawDiff);

  return diffsDir;
}

const PR_JSON_SCHEMA = `{
  "id": "string (UUID)",
  "title": "string",
  "query": "string",
  "repo": "string or null (GitHub user/repo if from remote)",
  "commitHash": "string",
  "createdAt": "string (ISO 8601)",
  "pr": {
    "number": "number",
    "title": "string",
    "description": "string",
    "baseBranch": "string",
    "headBranch": "string",
    "author": "string",
    "url": "string",
    "labels": ["string"],
    "comments": [
      {
        "author": "string",
        "body": "string",
        "path": "string or undefined (file path for review comments)",
        "line": "number or undefined (line number for review comments)",
        "createdAt": "string (ISO 8601)"
      }
    ]
  },
  "chapters": [
    {
      "id": "string (e.g., chapter-0)",
      "label": "string (2-4 words for sidebar)",
      "snippets": [
        {
          "filePath": "string (relative path)",
          "startLine": "number (1-indexed)",
          "endLine": "number (1-indexed)",
          "content": "string (actual code)",
          "type": "'code' | 'diff'",
          "lines": [
            {
              "oldLineNumber": "number | null",
              "newLineNumber": "number | null",
              "type": "'added' | 'removed' | 'context'",
              "content": "string"
            }
          ]
        }
      ],
      "explanation": "string (markdown)"
    }
  ]
}`;

function buildPRContext(generationDir, prData) {
  const { metadata, diff, rawDiff } = prData;

  const diffsDir = writeDiffFiles(generationDir, diff, rawDiff);

  const diffSummary = diff.map(f => {
    const added = f.hunks.reduce((n, h) => n + h.lines.filter(l => l.type === 'added').length, 0);
    const removed = f.hunks.reduce((n, h) => n + h.lines.filter(l => l.type === 'removed').length, 0);
    return `  ${f.path} (+${added} -${removed})`;
  }).join('\n');

  const commentsSection = metadata.comments.length > 0
    ? metadata.comments.map(c => {
      const location = c.path ? ` (${c.path}${c.line ? `:${c.line}` : ''})` : '';
      return `- **${c.author}**${location}: ${c.body}`;
    }).join('\n')
    : 'No comments.';

  const linkedIssuesSection = metadata.linkedIssues && metadata.linkedIssues.length > 0
    ? metadata.linkedIssues.map(issue =>
      `- #${issue.number}: ${issue.title}\n  ${issue.body || '(no description)'}`
    ).join('\n')
    : '';

  return `## PR Context

**PR #${metadata.number}: ${metadata.title}**
- Author: ${metadata.author}
- Base: ${metadata.baseBranch} <- Head: ${metadata.headBranch}
- URL: ${metadata.url}
${metadata.labels.length > 0 ? `- Labels: ${metadata.labels.join(', ')}` : ''}

### PR Description
${metadata.description || '(no description provided)'}

### Files Changed
${diffSummary}

### Comments
${commentsSection}
${linkedIssuesSection ? `\n### Linked Issues\n${linkedIssuesSection}` : ''}

### Diffs

Per-file diffs have been written to: ${diffsDir}
- Each changed file has its own \`.diff\` file (e.g., \`src__utils__foo.js.diff\`)
- The full combined diff is in \`_full.diff\`
- Use Grep and Read to explore the diffs as needed — do NOT try to read them all at once for large PRs`;
}

const PR_SNIPPET_TYPES = `## Snippet Types

Each snippet has a \`type\` field: either \`"code"\` or \`"diff"\`.

- Use \`type: "diff"\` when the change itself IS the point being discussed. Include the \`lines\`
  array with accurate \`oldLineNumber\`/\`newLineNumber\` values computed from the diff hunks.
  For added lines, \`oldLineNumber\` is null. For removed lines, \`newLineNumber\` is null.
  For context lines, both are present. The \`content\` field should still contain the raw text
  (for fallback rendering), and \`startLine\`/\`endLine\` should reflect the new file line range.
- Use \`type: "code"\` for surrounding context that helps the reader understand the changes.
  These are regular code snippets (no \`lines\` array needed).
- Think carefully about which type is best for each segment. Not every snippet needs to be a diff.
- Don't assume the reader knows the codebase well — provide context generously.`;

export function buildPRExplorePrompt(query, generationDir, prContext) {
  return {
    checkpoints: [
      { file: 'exploration_scan.md', checkpoint: 'EXPLORATION_SCANNED' },
      { file: 'exploration_read.md', checkpoint: 'EXPLORATION_READ' },
      { file: 'exploration_notes.md', checkpoint: 'STAGE_1_COMPLETE' },
    ],
    prompt: `${NARRATOR_PREAMBLE}

You are reviewing a pull request and creating a PR review story.
The user's query is: "${query}"

${prContext}

## Your Task: Stage 1 — Explore the Codebase & Analyze the Diff

Follow these steps in strict order. Write each checkpoint file before moving to the next.
If a checkpoint file already exists with the expected marker, skip that step.

### Step 1.1: Analyze the diff
Study the diff provided above. Identify key changes, scope, and potential concerns.
Use Glob to discover project structure around changed files.

${formatCheckpointInstruction('Write your diff analysis and relevant files', `${generationDir}/exploration_scan.md`, 'EXPLORATION_SCANNED')}

### Step 1.2: Read surrounding context
Read the changed files AND surrounding context — callers, dependencies, tests, related modules.
Understand what code did before and how changes fit in.

${formatCheckpointInstruction('Write your notes', `${generationDir}/exploration_read.md`, 'EXPLORATION_READ')}

### Step 1.3: Document findings and concerns
Synthesize your understanding of:
- What the PR is trying to accomplish
- How the changes achieve this goal
- Potential concerns, edge cases, or issues
- Impact on the broader codebase
- Unfamiliar terms, APIs, or framework concepts a newcomer will need defined
- Important boundaries: which caller, subsystem, process, or layer hands off to which
  next layer after the changed code runs
- Runtime behavior that matters for review: ordering, retries, fallback paths, failure
  handling, or invariants the patch relies on
- Scope boundaries: what the PR obviously does not cover, even if a reader might assume
  it does from the diff alone

${formatCheckpointInstruction('Write your full exploration notes', `${generationDir}/exploration_notes.md`, 'STAGE_1_COMPLETE')}`,
  };
}

export function buildPROutlinePrompt(query, generationDir, explorationNotes, prContext) {
  return {
    checkpoints: [
      { file: 'narrative_outline.md', checkpoint: 'STAGE_2_COMPLETE' },
    ],
    prompt: `${NARRATOR_PREAMBLE}

You are reviewing a pull request and creating a PR review story.
The user's query is: "${query}"

${prContext}

## Your Task: Stage 2 — Plan the Chapter Outline

You are receiving a handoff from the PR exploration stage. The synthesized exploration
notes are embedded below. You may read additional detail from:
- ${generationDir}/exploration_scan.md
- ${generationDir}/exploration_read.md

<exploration_notes>
${explorationNotes}
</exploration_notes>

---

Design 5-20 chapters grouped by logical concern (NOT file-by-file). Each chapter should
have ONE clear teaching point.

Guidelines:
- Start with an overview chapter (no snippets) that orients the reader to the PR's purpose
- Do NOT just focus on the PR diff — build context BEFORE showing diffs
- Group related changes together even if they span multiple files
- Include inline review callouts for concerns, suggestions, and questions
- End with a summary chapter (no snippets) that consolidates findings and assessment
- Chapter labels should be 2-4 words (for the sidebar)
- The overview should define important unfamiliar terms and state what this review story
  can and cannot conclude from the diff plus surrounding code
- If the PR changes an end-to-end flow, reserve chapters for boundary crossings so readers
  can see what calls into the patch, what leaves it, and what handles it next

Before finalizing, verify your outline against this checklist and revise if needed:
1. Does each chapter have exactly one clear teaching point?
2. Is context shown BEFORE diffs in each chapter?
3. Are concerns distributed across relevant chapters?
4. Could a newcomer unfamiliar with this codebase follow along?
5. Are there redundant chapters that should be merged?
6. Is the final chapter a prose-only summary with consolidated concerns?
7. Does the story cover both what changed and why?
8. Where will important terms be defined before the reader hits the diff?
9. Which chapters make boundary crossings explicit instead of only summarizing files?
10. Which chapters explain a meaningful runtime behavior, edge case, or invariant?
11. Where does the story state major scope limits or unverifiable assumptions?

${formatCheckpointInstruction('Write your verified outline', `${generationDir}/narrative_outline.md`, 'STAGE_2_COMPLETE')}`,
  };
}

export function buildPRSnippetsPrompt(generationDir, narrativeOutline, prContext) {
  return {
    checkpoints: [
      { file: 'snippets_mapping.md', checkpoint: 'STAGE_3_COMPLETE' },
    ],
    prompt: `${NARRATOR_PREAMBLE}

You are reviewing a pull request and creating a PR review story.

${prContext}

${PR_SNIPPET_TYPES}

## Your Task: Stage 3 — Identify Snippets

You are receiving a handoff from the outline stage. The chapter outline is embedded below.
Read actual source files and diff files to verify exact snippets.

<narrative_outline>
${narrativeOutline}
</narrative_outline>

---

Constraints:
- Each chapter's total code should be 20-70 lines across all snippets. Absolute max 80 lines.
- Use a mix of \`type: "code"\` and \`type: "diff"\` snippets as appropriate.
- For diff snippets, include the \`lines\` array with accurate line numbers.
- Show complete logical units when possible.
- The \`content\` field must match the actual source code exactly.
- \`startLine\` and \`endLine\` must be accurate.
- Overview (first) and summary (last) chapters have empty snippets arrays.
- Keep snippet count per chapter to 1-3.

For each chapter, document:
- chapter ID and label
- each snippet: filePath, startLine, endLine, type
- for diff snippets: lines array (oldLineNumber, newLineNumber, type, content)

${formatCheckpointInstruction('Write your snippet selections', `${generationDir}/snippets_mapping.md`, 'STAGE_3_COMPLETE')}`,
  };
}

export function buildPRExplanationsPrompt(query, generationDir, explorationNotes, narrativeOutline, snippetsMapping, prContext) {
  return {
    checkpoints: [
      { file: 'explanations_draft.md', checkpoint: 'STAGE_4_COMPLETE' },
    ],
    prompt: `${NARRATOR_PREAMBLE}

You are reviewing a pull request and creating a PR review story.
The user's query is: "${query}"

${prContext}

## Your Task: Stage 4 — Craft Explanations

You are receiving a handoff from snippet selection. All context is embedded below.

<exploration_notes>
${explorationNotes}
</exploration_notes>

<narrative_outline>
${narrativeOutline}
</narrative_outline>

<snippets_mapping>
${snippetsMapping}
</snippets_mapping>

---

Guidelines:
- Explanation length MUST vary based on complexity (60-300 words range)
- Focus on "why" and insight, not just describing what code does
- Reference specific lines in snippets
- Use review-focused callouts in blockquotes:
  * \`[!CONCERN]\` — potential issues, bugs, or risks
  * \`[!SUGGESTION]\` — improvement ideas or alternatives
  * \`[!QUESTION]\` — things reviewers should verify
  * \`[!NOTE]\` — important context or observations
- Explain intent behind changes, not just what they do
- For each snippet-bearing chapter, explain at least TWO of the following when code
  supports it: boundary/handoff, concrete mechanics, runtime behavior, or design implication
- Define unfamiliar terms on first use in plain language
- If the patch omits surrounding machinery, fallback branches, or external guarantees,
  say so explicitly so the review story does not overclaim completeness
- Tone: friendly, thorough reviewer — not adversarial, not rubber-stamping

${formatCheckpointInstruction('Write your draft explanations', `${generationDir}/explanations_draft.md`, 'STAGE_4_COMPLETE')}`,
  };
}

export function buildPRAssemblePrompt(query, generationDir, commitHash, generationId, repoId, prData, prContext) {
  return {
    checkpoints: [
      { file: 'story.json', checkpoint: null },
    ],
    prompt: `${NARRATOR_PREAMBLE}

You are reviewing a pull request and creating a PR review story.
The user's query is: "${query}"

${prContext}

${PR_SNIPPET_TYPES}

## Your Task: Stage 5 — Quality Check & Final Output

Read back all work from generation directory:
- ${generationDir}/exploration_notes.md
- ${generationDir}/narrative_outline.md
- ${generationDir}/snippets_mapping.md
- ${generationDir}/explanations_draft.md

Use these fixed values in final JSON:
- id: "${generationId}"
- commitHash: "${commitHash}"
- repo: ${repoId ? `"${repoId}"` : 'null'}
- query: "${query}"
- createdAt: current ISO 8601 timestamp
- pr: populate from PR metadata in the context above

Assemble complete story JSON, then verify constraints before outputting:
1. Snippet line cap: no chapter exceeds 80 total snippet lines.
2. Context before diffs: chapters with diff snippets also provide context.
3. Diff line validation: diff snippets have valid \`lines\` arrays.
4. Bookend chapters: overview and summary have empty snippets arrays.
5. Concern distribution: review concerns are spread across relevant chapters.
6. PR field populated: \`pr\` contains full metadata.
7. Query coverage: story addresses the user's query.
8. Follow-up resistance: story defines key terms, names handoff boundaries, covers
   meaningful runtime behavior where relevant, and states major omissions/scope limits.
9. Grounding check: snippet-bearing chapters let reader answer at least one
   "where exactly?", "what happens next?", or "what happens if this fails?" question.

For each snippet, verify source content and line numbers against actual files.

## Output

The JSON schema is:
${PR_JSON_SCHEMA}

Output final JSON as a single fenced code block (\`\`\`json ... \`\`\`).
The JSON must be valid and match the schema exactly.

Write the JSON to: ${generationDir}/story.json`,
  };
}

// Backward-compatible helper for tests and callers that expect a single builder.
export function buildPRPrompt(query, generationDir, commitHash, generationId, repoId, prData) {
  const prContext = buildPRContext(generationDir, prData);
  return buildPRAssemblePrompt(query, generationDir, commitHash, generationId, repoId, prData, prContext);
}

export function preparePRPipelineContext(generationDir, prData) {
  return {
    prContext: buildPRContext(generationDir, prData),
  };
}
