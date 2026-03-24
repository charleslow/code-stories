// Maximum number of lines to include from the raw diff in the prompt.
// Large diffs can exceed Claude's context window and cause generation to stall.
const MAX_DIFF_LINES = 1500;

/**
 * Truncate a raw diff to MAX_DIFF_LINES, splitting at file boundaries when possible.
 */
function truncateDiff(rawDiff) {
  const lines = rawDiff.split('\n');
  if (lines.length <= MAX_DIFF_LINES) return rawDiff;

  // Find the last file boundary ("diff --git") that fits within the limit
  let cutoff = MAX_DIFF_LINES;
  for (let i = MAX_DIFF_LINES - 1; i > 0; i--) {
    if (lines[i].startsWith('diff --git ')) {
      cutoff = i;
      break;
    }
  }

  const truncated = lines.slice(0, cutoff).join('\n');
  const omittedLines = lines.length - cutoff;
  return `${truncated}\n\n... (${omittedLines} lines omitted — diff too large. Use Read/Grep to inspect full files as needed.)`;
}

// Build the prompt for PR review mode
export function buildPRPrompt(query, generationDir, commitHash, generationId, repoId, prData) {
  const { metadata, diff, rawDiff } = prData;

  const jsonSchema = `{
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

  return `You are an expert code reviewer and narrator. Your job is to create a "PR review story" —
a guided, chapter-by-chapter walkthrough of a pull request that helps reviewers understand what
changed, why it changed, and what to watch for. The aim is not just to communicate information,
but to give the reviewer a deep understanding of the changes and their implications.

The user's query is: "${query}"

## PR Context

**PR #${metadata.number}: ${metadata.title}**
- Author: ${metadata.author}
- Base: ${metadata.baseBranch} ← Head: ${metadata.headBranch}
- URL: ${metadata.url}
${metadata.labels.length > 0 ? `- Labels: ${metadata.labels.join(', ')}` : ''}

### PR Description
${metadata.description || '(no description provided)'}

### Files Changed
${diffSummary}

### Comments
${commentsSection}
${linkedIssuesSection ? `\n### Linked Issues\n${linkedIssuesSection}` : ''}

### Full Diff
\`\`\`diff
${truncateDiff(rawDiff)}
\`\`\`

You will produce a single JSON object matching this schema:
${jsonSchema}

Use these fixed values:
- id: "${generationId}"
- commitHash: "${commitHash}"
- repo: ${repoId ? `"${repoId}"` : "null"}
- createdAt: current ISO 8601 timestamp
- query: "${query}"
- pr: populate with the PR metadata provided above

## Snippet Types

Each snippet has a \`type\` field: either \`"code"\` or \`"diff"\`.

- Use \`type: "diff"\` when the change itself IS the point being discussed. Include the \`lines\`
  array with accurate \`oldLineNumber\`/\`newLineNumber\` values computed from the diff hunks.
  For added lines, \`oldLineNumber\` is null. For removed lines, \`newLineNumber\` is null.
  For context lines, both are present. The \`content\` field should still contain the raw text
  (for fallback rendering), and \`startLine\`/\`endLine\` should reflect the new file line range.
- Use \`type: "code"\` for surrounding context that helps the reader understand the changes.
  These are regular code snippets (no \`lines\` array needed).
- Think carefully about which type is best for each segment. Not every snippet needs to be a diff.
- Don't assume the reader knows the codebase well — provide context generously.

## Critical Instruction

Do NOT just focus on the PR diff. The reader may not be familiar with this codebase. Explore
surrounding context and explain it when necessary for understanding the changes. A good PR review
story builds context BEFORE showing diffs, so the reader understands what they're looking at.

## Pipeline

Follow these 6 stages in order. Do all your thinking, exploring, and planning
BEFORE you output the JSON. The JSON must be your FINAL output — a single fenced
code block and nothing else after it.

### Stage 1: Explore the Codebase

#### Step 1.1: Analyze the diff
Study the diff provided above. Identify the key changes, their scope, and potential concerns.
Use Glob to discover the project structure around the changed files.

**Checkpoint:** Write your diff analysis and relevant files to ${generationDir}/exploration_scan.md.
End the file with the line: EXPLORATION_SCANNED

#### Step 1.2: Read surrounding context
Read the changed files AND their surrounding context — callers, dependencies, tests, related
modules. Understand what the code looked like before and how the changes fit in.

**Checkpoint:** Write your notes to ${generationDir}/exploration_read.md.
End the file with the line: EXPLORATION_READ

#### Step 1.3: Document findings and concerns
Synthesize your understanding of:
- What the PR is trying to accomplish
- How the changes achieve this goal
- Potential concerns, edge cases, or issues
- Impact on the broader codebase

**Checkpoint:** Write your full exploration notes to ${generationDir}/exploration_notes.md.
End the file with the line: STAGE_1_COMPLETE

### Stage 2: Plan the Outline

Design 5-20 chapters grouped by logical concern (NOT file-by-file). Each chapter should have
ONE clear teaching point.

Guidelines:
- Start with an overview chapter (no snippets) that orients the reader to the PR's purpose
- Build context BEFORE showing diffs: show the existing code/architecture first, then the changes
- Group related changes together even if they span multiple files
- Include inline review callouts for concerns, suggestions, and questions
- End with a summary chapter (no snippets) that consolidates findings and overall assessment
- Chapter labels should be 2-4 words (for the sidebar)

**Checkpoint:** Write your outline to ${generationDir}/narrative_outline.md.
End the file with the line: STAGE_2_COMPLETE

### Stage 3: Review the Outline

Evaluate your outline against these criteria:
1. Does each chapter have exactly one clear teaching point?
2. Is context shown BEFORE diffs in each chapter?
3. Are concerns distributed across relevant chapters (not all lumped at the end)?
4. Could a newcomer unfamiliar with this codebase follow along?
5. Are there any redundant chapters that could be merged?
6. Is the final chapter a prose-only summary with consolidated concerns?
7. Does the story cover both what changed and why?

Revise the outline if any criteria are not met.

**Checkpoint:** Write your revised outline to ${generationDir}/narrative_outline_reviewed.md.
End the file with the line: STAGE_3_COMPLETE

### Stage 4: Identify Snippets

For each chapter, select the exact code or diff segments to show.

Constraints:
- Each chapter's total code should be 20-70 lines across all snippets. Absolute max 80 lines.
- Use a mix of \`type: "code"\` and \`type: "diff"\` snippets as appropriate
- For diff snippets, include the \`lines\` array with accurate line numbers computed from
  the diff hunks. Track oldLineNumber and newLineNumber carefully:
  * Context lines: both old and new line numbers present, increment both
  * Added lines: oldLineNumber is null, only newLineNumber increments
  * Removed lines: newLineNumber is null, only oldLineNumber increments
- Show complete logical units when possible
- The \`content\` field must match the actual source code exactly
- \`startLine\` and \`endLine\` must be accurate
- Overview (first) and summary (last) chapters have empty snippets arrays
- Keep snippet count per chapter to 1-3

**Checkpoint:** Write your snippet selections to ${generationDir}/snippets_mapping.md.
End the file with the line: STAGE_4_COMPLETE

### Stage 5: Craft Explanations

Write the explanation for each chapter in markdown.

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
End the file with the line: STAGE_5_COMPLETE

### Stage 6: Quality Check

Before outputting the JSON, verify each constraint:

1. **Snippet line cap**: No chapter has more than 80 total snippet lines.
2. **Context before diffs**: Each chapter that shows diffs also provides context.
3. **Diff line validation**: All diff snippets have valid \`lines\` arrays with correct
   oldLineNumber/newLineNumber tracking.
4. **Bookend chapters have no snippets**: First (overview) and last (summary) chapters.
5. **Concern distribution**: Review concerns are spread across relevant chapters.
6. **PR field populated**: The \`pr\` field in the output JSON contains full PR metadata.
7. **Query coverage**: The story addresses the user's query.

## Output

Write your planning and thinking as normal text. Then output the final JSON as a
single fenced code block (\`\`\`json ... \`\`\`). The JSON must be valid and match
the schema exactly.

Write the JSON to: ${generationDir}/story.json`;
}
