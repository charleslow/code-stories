import fs from 'fs';
import path from 'path';

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

// Build a single prompt for PR review story generation.
// Returns { prompt, checkpoints } for a single LLM call.
export function buildPRPrompt(query, generationDir, commitHash, generationId, repoId, prData) {
  const { metadata, diff, rawDiff } = prData;

  // Write diffs to files so the agent can grep through them
  const diffsDir = writeDiffFiles(generationDir, diff, rawDiff);

  // Format diff summary for the prompt
  const diffSummary = diff.map(f => {
    const added = f.hunks.reduce((n, h) => n + h.lines.filter(l => l.type === 'added').length, 0);
    const removed = f.hunks.reduce((n, h) => n + h.lines.filter(l => l.type === 'removed').length, 0);
    return `  ${f.path} (+${added} -${removed})`;
  }).join('\n');

  // Format comments
  const commentsSection = metadata.comments.length > 0
    ? metadata.comments.map(c => {
      const location = c.path ? ` (${c.path}${c.line ? `:${c.line}` : ''})` : '';
      return `- **${c.author}**${location}: ${c.body}`;
    }).join('\n')
    : 'No comments.';

  // Format linked issues
  const linkedIssuesSection = metadata.linkedIssues && metadata.linkedIssues.length > 0
    ? metadata.linkedIssues.map(issue =>
      `- #${issue.number}: ${issue.title}\n  ${issue.body || '(no description)'}`
    ).join('\n')
    : '';

  const prContext = `## PR Context

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

  const snippetTypes = `## Snippet Types

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

  return {
    checkpoints: [
      { file: 'exploration_scan.md', checkpoint: 'EXPLORATION_SCANNED' },
      { file: 'exploration_read.md', checkpoint: 'EXPLORATION_READ' },
      { file: 'exploration_notes.md', checkpoint: 'STAGE_1_COMPLETE' },
      { file: 'narrative_outline.md', checkpoint: 'STAGE_2_COMPLETE' },
      { file: 'snippets_mapping.md', checkpoint: 'STAGE_3_COMPLETE' },
      { file: 'explanations_draft.md', checkpoint: 'STAGE_4_COMPLETE' },
      { file: 'story.json', checkpoint: null },
    ],
    prompt: `You are an expert code reviewer and narrator. Your job is to help create a "PR review story" —
a guided, chapter-by-chapter walkthrough of a pull request that helps reviewers understand what
changed, why it changed, and what to watch for. The aim is not just to communicate information,
but to give the reviewer a deep understanding of the changes and their implications.

The user's query is: "${query}"

${prContext}

${snippetTypes}

You will produce a single JSON object matching this schema:
${PR_JSON_SCHEMA}

Use these fixed values:
- id: "${generationId}"
- commitHash: "${commitHash}"
- repo: ${repoId ? `"${repoId}"` : "null"}
- createdAt: current ISO 8601 timestamp
- query: "${query}"
- pr: populate with the PR metadata provided above

## Instructions

Follow these stages in order. Each stage has checkpoint files you MUST write before
proceeding to the next stage. If a checkpoint file already exists with the expected
marker, you may skip that stage.

---

## Stage 1: Explore the Codebase & Analyze the Diff

### Step 1.1: Analyze the diff
Study the diff provided above. Identify the key changes, their scope, and potential concerns.
Use Glob to discover the project structure around the changed files.

**Checkpoint:** Write your diff analysis and relevant files to ${generationDir}/exploration_scan.md.
End the file with the line: EXPLORATION_SCANNED

### Step 1.2: Read surrounding context
Read the changed files AND their surrounding context — callers, dependencies, tests, related
modules. Understand what the code looked like before and how the changes fit in.

**Checkpoint:** Write your notes to ${generationDir}/exploration_read.md.
End the file with the line: EXPLORATION_READ

### Step 1.3: Document findings and concerns
Synthesize your understanding of:
- What the PR is trying to accomplish
- How the changes achieve this goal
- Potential concerns, edge cases, or issues
- Impact on the broader codebase

**Checkpoint:** Write your full exploration notes to ${generationDir}/exploration_notes.md.
End the file with the line: STAGE_1_COMPLETE

---

## Stage 2: Plan the Outline

Review your exploration notes, then design the chapter outline for the PR review story.

Design 5-20 chapters grouped by logical concern (NOT file-by-file). Each chapter should have
ONE clear teaching point.

Guidelines:
- Start with an overview chapter (no snippets) that orients the reader to the PR's purpose
- Do NOT just focus on the PR diff — the reader may not know this codebase. Build context
  BEFORE showing diffs: show existing code/architecture first, then the changes
- Group related changes together even if they span multiple files
- Include inline review callouts for concerns, suggestions, and questions
- End with a summary chapter (no snippets) that consolidates findings and overall assessment
- Chapter labels should be 2-4 words (for the sidebar)

Before finalizing, verify your outline against this checklist and revise if needed:
1. Does each chapter have exactly one clear teaching point?
2. Is context shown BEFORE diffs in each chapter?
3. Are concerns distributed across relevant chapters (not all lumped at the end)?
4. Could a newcomer unfamiliar with this codebase follow along?
5. Are there any redundant chapters that could be merged?
6. Is the final chapter a prose-only summary with consolidated concerns?
7. Does the story cover both what changed and why?

**Checkpoint:** Write your verified outline to ${generationDir}/narrative_outline.md.
End the file with the line: STAGE_2_COMPLETE

---

## Stage 3: Identify Snippets

Review your outline, then select the exact code or diff segments to show in each chapter.

Constraints:
- Each chapter's total code should be 20-70 lines across all snippets. Absolute max 80 lines.
- Use a mix of \`type: "code"\` and \`type: "diff"\` snippets as appropriate
- For diff snippets, include the \`lines\` array with accurate line numbers (see Snippet Types above)
- Show complete logical units when possible
- The \`content\` field must match the actual source code exactly
- \`startLine\` and \`endLine\` must be accurate
- Overview (first) and summary (last) chapters have empty snippets arrays
- Keep snippet count per chapter to 1-3

For each chapter, document:
- The chapter ID and label
- Each snippet: filePath, startLine, endLine, type
- For diff snippets: the lines array with oldLineNumber, newLineNumber, type, content
- Read the actual source files and verify the code content at those line ranges

**Checkpoint:** Write your snippet selections to ${generationDir}/snippets_mapping.md.
End the file with the line: STAGE_3_COMPLETE

---

## Stage 4: Craft Explanations

Review your outline and snippet selections, then write the explanation for each chapter
in markdown.

Guidelines:
- Explanation length MUST vary based on complexity (60-300 words range)
- Focus on "why" and insight, not just describing what the code does
- Reference specific lines in the snippets
- Use review-focused callouts in blockquotes:
  * \`[!CONCERN]\` — potential issues, bugs, or risks (renders red)
  * \`[!SUGGESTION]\` — improvement ideas or alternatives (renders blue)
  * \`[!QUESTION]\` — things the reviewer should verify or ask about (renders yellow)
  * \`[!NOTE]\` — important context or observations (renders default)
- Explain the intent behind changes, not just what they do
- Tone: friendly, thorough reviewer — not adversarial, not rubber-stamping

**Checkpoint:** Write your draft explanations to ${generationDir}/explanations_draft.md.
End the file with the line: STAGE_4_COMPLETE

---

## Stage 5: Quality Check & Final Output

Read back all your work:
- ${generationDir}/exploration_notes.md (findings & concerns)
- ${generationDir}/narrative_outline.md (chapter outline)
- ${generationDir}/snippets_mapping.md (selected code snippets)
- ${generationDir}/explanations_draft.md (draft explanations)

Assemble the complete story JSON from your work. Before outputting, verify each
constraint. If any check fails, revise before outputting.

1. **Snippet line cap**: No chapter exceeds 80 total snippet lines.
2. **Context before diffs**: Each chapter that shows diffs also provides context.
3. **Diff line validation**: All diff snippets have valid \`lines\` arrays.
4. **Bookend chapters**: Overview (first) and summary (last) have empty snippets arrays.
5. **Concern distribution**: Review concerns are spread across relevant chapters.
6. **PR field populated**: The \`pr\` field contains full PR metadata.
7. **Query coverage**: The story addresses the user's query.

For each snippet, read the actual source file to verify the content matches exactly
and the line numbers are accurate. Fix any discrepancies.

## Output

Output the final JSON as a single fenced code block (\`\`\`json ... \`\`\`).
The JSON must be valid and match the schema exactly.

Write the JSON to: ${generationDir}/story.json`,
  };
}
