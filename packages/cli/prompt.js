// Build stage-specific prompts for code story generation.
// Returns an array of stage objects, each with a prompt for a separate LLM call.

const JSON_SCHEMA = `{
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

export function buildStagePrompts(query, generationDir, commitHash, generationId, repoId) {
  const preamble = `You are an expert code narrator. Your job is to help create a "code story" — a guided,
chapter-by-chapter tour of a codebase that reads like a friendly colleague walking
someone through the code. The aim is not just to communicate information, but insights.

The user's query is: "${query}"`;

  return [
    // Stage 1: Explore the Codebase
    {
      label: 'Exploring codebase',
      checkpoints: [
        { file: 'exploration_scan.md', marker: 'EXPLORATION_SCANNED' },
        { file: 'exploration_read.md', marker: 'EXPLORATION_READ' },
        { file: 'exploration_notes.md', marker: 'STAGE_1_COMPLETE' },
      ],
      prompt: `${preamble}

## Your Task: Explore the Codebase

You are performing Stage 1 of a multi-stage code story pipeline. Your job is to
explore the codebase and document your findings. Later stages will use your notes
to plan chapters, select code snippets, and write explanations.

### Step 1.1: Scan the file tree
Use Glob to discover the project structure and identify files relevant to the query.

**Checkpoint:** Write your list of relevant files to ${generationDir}/exploration_scan.md.
End the file with the line: EXPLORATION_SCANNED

### Step 1.2: Read key files
Read the important source files. Take notes on entry points and control flow.

**Checkpoint:** Write your notes to ${generationDir}/exploration_read.md.
End the file with the line: EXPLORATION_READ

### Step 1.3: Document findings
Synthesize your understanding of:
- Core data structures and algorithms
- Design patterns and architectural decisions
- Interesting "why" decisions (not just "what")

**Checkpoint:** Write your full exploration notes to ${generationDir}/exploration_notes.md.
End the file with the line: STAGE_1_COMPLETE`,
    },

    // Stage 2: Plan the Outline
    {
      label: 'Planning outline',
      checkpoints: [
        { file: 'narrative_outline.md', marker: 'STAGE_2_COMPLETE' },
      ],
      prompt: `${preamble}

## Previous Work

The codebase has already been explored. Read these files to review the findings:
- ${generationDir}/exploration_scan.md (file tree scan)
- ${generationDir}/exploration_read.md (key file notes)
- ${generationDir}/exploration_notes.md (architecture findings)

## Your Task: Plan the Outline

You are performing Stage 2 of a multi-stage code story pipeline. Using the exploration
notes from Stage 1, design the chapter outline for the story.

Design 5-30 chapters based on both the codebase complexity AND the user's requested
depth. If the user asks for a detailed, comprehensive, in-depth, or thorough story,
target the higher end of the range (20-30 chapters). A "detailed" story should have
at least 20 chapters — prefer more granular chapters that each cover a focused aspect
rather than fewer chapters that gloss over details. For standard requests on moderately
complex codebases, 10-18 chapters is typical. Only use 5-9 chapters for simple
codebases with narrow queries. Each chapter should have ONE clear teaching point — a
single insight the reader takes away.

Guidelines:
- Start with an overview chapter (no code snippets) that orients the reader
- Build from foundations to synthesis: show building blocks before compositions
- End with a summary chapter (no code snippets) that provides closure to the story
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

Before finalizing, verify your outline against this checklist and revise if needed:
1. Does each chapter have exactly one clear teaching point?
2. Are technical terms introduced before they're used?
3. Is the progression logical — could a newcomer follow along?
4. Are there any redundant chapters that could be merged?
5. Does the story cover initialization, execution, and key mechanisms?
6. Is the final chapter a prose-only summary that provides closure?
7. Does the story have a natural narrative arc (beginning, middle, end)?
8. Are transitions between chapters smooth?
9. Do any chapters need to show code regions with significant debug/logging code?
   If so, plan alternative line ranges or consider splitting the chapter.
10. **Query coverage**: Re-read the original query. Does the outline address every
    specific technology, concept, or component mentioned? If the query asks about
    "numpy, pytorch, tensorflow and jax", verify that all four are covered. If any
    are missing, add chapters or expand existing ones.

**Checkpoint:** Write your verified outline to ${generationDir}/narrative_outline.md.
End the file with the line: STAGE_2_COMPLETE`,
    },

    // Stage 3: Identify Snippets
    {
      label: 'Identifying snippets',
      checkpoints: [
        { file: 'snippets_mapping.md', marker: 'STAGE_3_COMPLETE' },
      ],
      prompt: `${preamble}

## Previous Work

Read these files from prior stages:
- ${generationDir}/exploration_notes.md (architecture findings)
- ${generationDir}/narrative_outline.md (chapter outline)

## Your Task: Identify Snippets

You are performing Stage 3 of a multi-stage code story pipeline. Using the chapter
outline from Stage 2, select the exact code snippets to show in each chapter.

For each chapter in the outline, select the exact code to show.

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
- The overview chapter (first) and summary chapter (last) have empty snippets arrays.
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
- When including an initialization method (e.g., \`__init__\` in Python or a
  constructor in Java/JS), make sure to include the class declaration line as
  well for context.

For each chapter, document:
- The chapter ID and label
- Each snippet: filePath, startLine, endLine
- Read the actual source files and verify the code content at those line ranges

**Checkpoint:** Write your snippet selections to ${generationDir}/snippets_mapping.md.
End the file with the line: STAGE_3_COMPLETE`,
    },

    // Stage 4: Craft Explanations
    {
      label: 'Crafting explanations',
      checkpoints: [
        { file: 'explanations_draft.md', marker: 'STAGE_4_COMPLETE' },
      ],
      prompt: `${preamble}

## Previous Work

Read these files from prior stages:
- ${generationDir}/exploration_notes.md (architecture findings)
- ${generationDir}/narrative_outline.md (chapter outline)
- ${generationDir}/snippets_mapping.md (selected code snippets)

## Your Task: Craft Explanations

You are performing Stage 4 of a multi-stage code story pipeline. Using the outline
and snippet selections from prior stages, write the explanation for each chapter.

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
- The summary chapter (last) has an empty snippets array, just explanation. Keep it
  to 150-250 words. Recap the key insights and design patterns covered in the story,
  highlight any important takeaways, and give the reader a sense of closure. Don't
  just list what was covered — synthesize it into a coherent "big picture" reflection.
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

**Checkpoint:** Write your draft explanations to ${generationDir}/explanations_draft.md.
End the file with the line: STAGE_4_COMPLETE`,
    },

    // Stage 5: Quality Check & Finalize
    {
      label: 'Finalizing story',
      checkpoints: [
        { file: 'story.json', marker: null },
      ],
      prompt: `${preamble}

You will produce a single JSON object matching this schema:
${JSON_SCHEMA}

Use these fixed values:
- id: "${generationId}"
- commitHash: "${commitHash}"
- repo: ${repoId ? `"${repoId}"` : "null"}
- createdAt: current ISO 8601 timestamp
- query: "${query}"

## Previous Work

Read ALL of these files from prior stages:
- ${generationDir}/exploration_notes.md (architecture findings)
- ${generationDir}/narrative_outline.md (chapter outline)
- ${generationDir}/snippets_mapping.md (selected code snippets)
- ${generationDir}/explanations_draft.md (draft explanations)

## Your Task: Quality Check & Final Output

You are performing the final stage of a multi-stage code story pipeline. Assemble
the complete story JSON from the prior stages' work.

Before outputting, verify each constraint. If any check fails, revise before outputting.

1. **Snippet line cap**: No chapter exceeds 80 total snippet lines.
2. **Snippet cleanliness**: No snippet exceeds ~10% debug/logging lines.
3. **Snippet coherence**: All snippets provide sufficient context.
4. **Bookend chapters**: Overview (first) and summary (last) have empty snippets arrays.
5. **Transition variety**: No opener pattern appears in more than 2 non-overview chapters.
6. **Explanation length ratio**: Shortest-to-longest non-overview ratio is at least 1:2.
7. **Query coverage**: All technologies/concepts mentioned in the query are covered.

For each snippet, read the actual source file to verify the content matches exactly
and the line numbers are accurate. Fix any discrepancies.

## Output

Output the final JSON as a single fenced code block (\`\`\`json ... \`\`\`).
The JSON must be valid and match the schema exactly.

Write the JSON to: ${generationDir}/story.json`,
    },
  ];
}
