// Build stage-specific prompts for the dual-model story generation pipeline.
// Stages 1, 3, 5 run in Codex. Stages 2, 4 run in Claude CLI.

// Format a checkpoint writing instruction.
// description: what to write (e.g. "Write your notes")
// filePath: absolute path to the output file
// marker: the sentinel string that must appear at the end of the file
export function formatCheckpointInstruction(description, filePath, marker) {
  return `**Checkpoint:** ${description} to \`${filePath}\`.\nEnd the file with the line: ${marker}`;
}

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

export const NARRATOR_PREAMBLE = `You are an expert code narrator. Your job is to help create a "code story" — a guided,
chapter-by-chapter tour of a codebase that reads like a friendly colleague walking
someone through the code. The aim is not just to communicate information, but insights.`;

// Shared prompt constructor used by both normal and PR pipelines to reduce drift.
export function buildStagePrompt({ query, stageTitle, modeContext = null, body }) {
  const queryLine = query ? `The user's query is: "${query}"\n\n` : '';
  const modeBlock = modeContext ? `${modeContext}\n\n` : '';
  return `${NARRATOR_PREAMBLE}

${queryLine}${modeBlock}## Your Task: ${stageTitle}

${body}`;
}

// Stage 1: Explore the codebase (runs in Codex)
export function buildExplorePrompt(query, generationDir) {
  return {
    checkpoints: [
      { file: 'exploration_scan.md', checkpoint: 'EXPLORATION_SCANNED' },
      { file: 'exploration_read.md', checkpoint: 'EXPLORATION_READ' },
      { file: 'exploration_notes.md', checkpoint: 'STAGE_1_COMPLETE' },
    ],
    prompt: buildStagePrompt({
      query,
      stageTitle: 'Stage 1 — Explore the Codebase',
      body: `Your exploration notes will be handed off to a separate model for outline planning.
Write them as a comprehensive, self-contained briefing — the receiving model has not
seen the codebase and will rely on your notes as its primary source of understanding.

Follow these steps in strict order. Write each checkpoint file before moving to the next.
If a checkpoint file already exists with the expected marker, skip that step.

### Step 1.1: Scan the file tree
Use Glob to discover the project structure and identify files relevant to the query.

${formatCheckpointInstruction('Write your list of relevant files', `${generationDir}/exploration_scan.md`, 'EXPLORATION_SCANNED')}

### Step 1.2: Read key files
Read the important source files. Take notes on entry points and control flow.

${formatCheckpointInstruction('Write your notes', `${generationDir}/exploration_read.md`, 'EXPLORATION_READ')}

### Step 1.3: Document findings
Synthesize your understanding into comprehensive notes covering:
- Core data structures and algorithms
- Design patterns and architectural decisions
- Interesting "why" decisions (not just "what")
- Unfamiliar terms or framework jargon a newcomer will need defined
- Important handoff boundaries (who calls whom, what gets passed, which process or
  subsystem owns the next step)
- Runtime invariants, failure modes, or edge cases that are central to understanding
  behavior
- Important scope boundaries: what this story can explain directly from code, and what
  is only implied or intentionally out of scope

${formatCheckpointInstruction('Write your full exploration notes', `${generationDir}/exploration_notes.md`, 'STAGE_1_COMPLETE')}`,
    }),
  };
}

// Stage 2: Plan the chapter outline (runs in Claude CLI)
export function buildOutlinePrompt(query, generationDir, explorationNotes) {
  return {
    checkpoints: [
      { file: 'narrative_outline.md', checkpoint: 'STAGE_2_COMPLETE' },
    ],
    prompt: buildStagePrompt({
      query,
      stageTitle: 'Stage 2 — Plan the Chapter Outline',
      body: `You are receiving a handoff from the codebase exploration stage. The synthesized
exploration notes are embedded below. If you need additional depth on specific files
or code paths, you also have tool access to the raw exploration files:
- ${generationDir}/exploration_scan.md (full file tree scan)
- ${generationDir}/exploration_read.md (detailed per-file reading notes)

<exploration_notes>
${explorationNotes}
</exploration_notes>

---

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
- If the query is asking for an end-to-end flow, architecture, or "how does X work"
  walkthrough, reserve chapters for the important boundary crossings. Do not only
  describe components in isolation; explicitly show the handoff points between them.
- Assume the reader will ask follow-up questions about terminology, exact insertion
  points, runtime behavior, and design implications. Shape the outline so those
  questions are answered by the story itself whenever the code supports it.
- Assume the reader may be technically strong but new to this ecosystem. The story
  should not stop at "component A calls component B"; it should show what gets handed
  off, where the boundary lives, and why that boundary exists.

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
11. **Terminology coverage**: Where will unfamiliar terms be defined in plain English
    before the reader encounters them in the code?
12. **Boundary coverage**: Which chapters make the producer/consumer, caller/callee,
    or process/subsystem handoff explicit?
13. **Behavior coverage**: Which chapters explain an important runtime invariant,
    failure path, retry path, ordering guarantee, or edge case?
14. **Scope coverage**: Where will the story say what it is NOT covering, or what is
    only implied rather than directly shown?

${formatCheckpointInstruction('Write your verified outline', `${generationDir}/narrative_outline.md`, 'STAGE_2_COMPLETE')}`,
    }),
  };
}

// Stage 3: Identify code snippets (runs in Codex)
export function buildSnippetsPrompt(generationDir, narrativeOutline) {
  return {
    checkpoints: [
      { file: 'snippets_mapping.md', checkpoint: 'STAGE_3_COMPLETE' },
    ],
    prompt: buildStagePrompt({
      stageTitle: 'Stage 3 — Identify Snippets',
      body: `You are receiving a handoff from the outline planning stage. The chapter outline is
embedded below. Read the actual source files to find and verify exact code snippets
for each chapter.

<narrative_outline>
${narrativeOutline}
</narrative_outline>

---

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

${formatCheckpointInstruction('Write your snippet selections', `${generationDir}/snippets_mapping.md`, 'STAGE_3_COMPLETE')}`,
    }),
  };
}

// Stage 4: Craft chapter explanations (runs in Claude CLI)
export function buildExplanationsPrompt(query, generationDir, explorationNotes, narrativeOutline, snippetsMapping) {
  return {
    checkpoints: [
      { file: 'explanations_draft.md', checkpoint: 'STAGE_4_COMPLETE' },
    ],
    prompt: buildStagePrompt({
      query,
      stageTitle: 'Stage 4 — Craft Explanations',
      body: `You are receiving a handoff from the snippet selection stage. All context from previous
stages is embedded below.

You have full tool access to:
- The repository source files (in your working directory) — use these to read code,
  verify snippet content, or explore additional context beyond what's listed below.
- ${generationDir}/ — read any of the detailed exploration files, and write scratch
  notes here if useful before producing the final draft.

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
  to 150-220 words. Define key terms concisely (one sentence each, not full paragraphs).
  Include a brief mental model of the whole system, a short glossary/list of the most
  important unfamiliar terms, and one explicit note about what this story will and will
  not cover. The overview should orient the reader, not teach — the teaching happens in
  subsequent chapters.
- The summary chapter (last) has an empty snippets array, just explanation. Keep it
  to 150-250 words. Recap the key insights and design patterns covered in the story,
  highlight any important takeaways, and give the reader a sense of closure. Don't
  just list what was covered — synthesize it into a coherent "big picture" reflection.
- Focus on "why" and insight, not just describing what the code does
- Every non-summary chapter must be concrete enough to preempt likely follow-up
  questions. When the code supports it, explain at least TWO of the following:
  1. the boundary or handoff ("what comes in, what goes out, and who handles it next"),
  2. the mechanics ("which exact lines transform or route the data"),
  3. the runtime behavior ("what invariant, ordering rule, retry path, or failure case
     matters here"),
  4. the implication ("why this design exists, what tradeoff it makes, or what would
     break if it changed").
- Do not restate an entire snippet at a high level if the reader still would not know
  where a value is inserted, which component receives it next, or what condition changes
  the control flow. Explanations should close at least one of those gaps whenever the
  snippet supports it.
- On first use of a technical term, define it in plain language as if the reader is new
  to the ecosystem. Do not assume terms like RPC, reflection, renderer process, AST,
  registry, or coroutine are already known.
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
- If the chapter leaves out meaningful branches, fallback logic, or adjacent machinery,
  say so explicitly. Good stories name their scope boundaries instead of pretending the
  shown snippet is the whole story.
- Use lightweight structure when it helps clarity. Brief labels such as
  \`**Boundary:**\`, \`**Mechanics:**\`, \`**Why:**\`, or \`**Caveat:**\` are welcome when
  they make the explanation easier to scan. Do not add all of them mechanically to every
  chapter; use them to clarify dense or behavior-heavy sections.
- Tone: friendly, insightful colleague — not a textbook, not a standup routine
- Inject some liveliness where appropriate (noting a clever trick, a surprising choice,
  or a quote from a comment), but don't force it
- Stories should be comprehensive and self-contained — explain concepts so the reader
  doesn't need to look things up elsewhere

${formatCheckpointInstruction('Write your draft explanations', `${generationDir}/explanations_draft.md`, 'STAGE_4_COMPLETE')}`,
    }),
  };
}

// Stage 5: Quality check and assemble final JSON (runs in Codex)
export function buildAssemblePrompt(query, generationDir, commitHash, generationId, repoId) {
  return {
    checkpoints: [
      { file: 'story.json', checkpoint: null },
    ],
    prompt: buildStagePrompt({
      query,
      stageTitle: 'Stage 5 — Quality Check & Final Output',
      body: `Read back all your work from the generation directory:
- ${generationDir}/exploration_notes.md (architecture findings)
- ${generationDir}/narrative_outline.md (chapter outline)
- ${generationDir}/snippets_mapping.md (selected code snippets)
- ${generationDir}/explanations_draft.md (draft explanations)

Use these fixed values in the final JSON:
- id: "${generationId}"
- commitHash: "${commitHash}"
- repo: ${repoId ? `"${repoId}"` : 'null'}
- createdAt: current ISO 8601 timestamp

Assemble the complete story JSON from your work. Before outputting, verify each
constraint. If any check fails, revise before outputting.

1. **Snippet line cap**: No chapter exceeds 80 total snippet lines.
2. **Snippet cleanliness**: No snippet exceeds ~10% debug/logging lines.
3. **Snippet coherence**: All snippets provide sufficient context.
4. **Bookend chapters**: Overview (first) and summary (last) have empty snippets arrays.
5. **Transition variety**: No opener pattern appears in more than 2 non-overview chapters.
6. **Explanation length ratio**: Shortest-to-longest non-overview ratio is at least 1:2.
7. **Query coverage**: All technologies/concepts mentioned in the query are covered.
8. **Follow-up resistance**: The story defines key terms before using them, names the
   important handoff boundaries, covers at least one meaningful runtime behavior or
   invariant where relevant, and states major omissions or scope boundaries instead of
   leaving them implicit.
9. **Grounding check**: In snippet-bearing chapters, the reader can answer at least one
   concrete "where exactly?", "what happens next?", or "what happens if this fails?"
   question from the explanation without opening another file.

For each snippet, read the actual source file to verify the content matches exactly
and the line numbers are accurate. Fix any discrepancies.

## Output

The JSON schema is:
${JSON_SCHEMA}

Output the final JSON as a single fenced code block (\`\`\`json ... \`\`\`).
The JSON must be valid and match the schema exactly.

Write the JSON to: ${generationDir}/story.json`,
    }),
  };
}
