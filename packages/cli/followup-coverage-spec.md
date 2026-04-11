# Follow-Up Coverage Spec

## Problem

Generated stories usually succeed at high-level orientation, but repeated user follow-up
questions expose a consistent gap between "I know the chapter theme" and "I now understand
how the code actually works." The missing information is usually one layer below the current
story surface.

Recurring missing categories:
- Terminology and mental models for unfamiliar ecosystem jargon
- Exact handoff boundaries between functions, files, processes, or subsystems
- Concrete mechanics at line level: where data is inserted, transformed, or routed
- Runtime behavior: invariants, retries, ordering guarantees, and failure paths
- Practical implications: why the design exists, what tradeoffs it makes, and what
  would change if a component were removed or rewritten
- Scope boundaries: what the chapter is intentionally skipping or what is only implied

Typical follow-ups that should become less necessary:
- "What does this term mean?"
- "Where exactly does this value get inserted?"
- "Which process or component receives this next?"
- "What happens on failure / retry / out-of-order input?"
- "Why is this split into these two layers instead of one?"
- "Is this the whole mechanism, or are we skipping something important?"

## Goal

Make stories more follow-up resistant without turning them into full documentation or
code review transcripts. The target is not zero follow-ups. The target is that the first
round of obvious newcomer questions is usually answered by the story itself whenever the
code supports it.

## Design Principles

- Keep one teaching point per chapter.
- Prefer grounded explanation over broader summary.
- Only claim behavior that is visible in code or clearly marked as inference.
- Preserve narrative flow; do not force a rigid template on every chapter.
- Name omissions explicitly instead of implying false completeness.

## Required Coverage

### 1. Overview chapter

The overview must include:
- A compact mental model of the system or flow
- A short glossary for the most important unfamiliar terms
- An explicit scope note describing what the story will cover and what it will not

The overview should answer:
- What kind of system or mechanism is this?
- Which terms will confuse a newcomer if left undefined?
- What code paths or runtime concerns are outside this story's evidence surface?

### 2. Code-bearing chapters

Each chapter stays centered on one teaching point, but when the code supports it the
explanation should answer at least two of these four lenses:
- Boundary: what enters this code, what leaves it, and who handles the next step
- Mechanics: which lines perform the important transformation or routing
- Runtime behavior: what invariant, edge case, retry path, or failure mode matters
- Implication: why the design exists, what tradeoff it makes, or what would break if it changed

Recommended heuristics:
- Boundary-heavy chapters should make producer/consumer or caller/callee relationships explicit.
- Mechanics-heavy chapters should point to concrete lines rather than paraphrasing the whole block.
- Behavior-heavy chapters should mention a real invariant, ordering rule, retry path, or failure mode.
- Implication-heavy chapters should explain why the code is shaped this way, not just what it does.

### 3. Story-level coverage

Across the full story, the narrative should make sure that:
- Unfamiliar terms are defined before heavy use
- Important handoff boundaries are explicitly named
- Behavior-heavy flows mention at least one real invariant or failure path
- Major omissions are acknowledged instead of left implicit

## Acceptance Criteria

A generated story should meet all of the following:

1. The overview defines the main unfamiliar terms used later in the story.
2. At least one chapter in an end-to-end flow explicitly names a boundary crossing.
3. Chapters with snippets reference concrete lines, not only module-level summaries.
4. When the code clearly expresses retries, ordering, invariants, failure paths, or
   fallback behavior, at least one relevant chapter explains that runtime behavior.
5. If the story omits meaningful adjacent machinery, hidden branches, or external
   systems, it says so explicitly rather than implying the shown snippet is exhaustive.
6. The explanation remains readable as prose; the grounding should not degrade the
   story into a checklist dump.

## Non-Goals

- Force every chapter to cover all four lenses
- Replace narrative flow with exhaustive documentation
- Require line-by-line commentary for every snippet
- Cover behavior that cannot be grounded in the code being shown
- Eliminate all possible follow-up questions

## Implementation Approach

Prompt changes should:
- Capture terminology, boundaries, runtime behavior, and scope during exploration
- Check for these dimensions during outline review
- Require more grounded explanations during chapter drafting
- Add a final quality gate for follow-up resistance
- Apply the same grounding standard to both repository stories and PR review stories

Tests should:
- Assert that the generation prompt mentions terminology, boundary, behavior, and scope guidance
- Assert that PR review stories also ask for newcomer framing, runtime behavior, and scope notes

Docs should:
- Describe the new grounding target in user-facing terms
- Explain that stories aim to answer first-order newcomer questions, not just summarize modules

## Output Style

Lightweight labels such as `**Boundary:**`, `**Mechanics:**`, `**Why:**`, and
`**Caveat:**` are allowed where they improve readability, but they are optional.
The requirement is grounded explanation, not a mandatory per-chapter template.
