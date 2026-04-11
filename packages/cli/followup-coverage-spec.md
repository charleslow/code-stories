# Follow-Up Coverage Spec

## Problem

Generated stories are usually good at narrative orientation, but recurring reader
follow-ups show a consistent gap between "chapter summary" and "code understanding."
The missing information is usually one level lower than the story currently delivers.

Common missing categories:
- Terminology and mental models for unfamiliar ecosystem jargon
- Exact handoff boundaries between functions, files, processes, or subsystems
- Concrete mechanics at line level: where data is inserted, transformed, or routed
- Runtime behavior: invariants, retries, ordering guarantees, and failure paths
- Practical implications: why the design exists, what tradeoffs it makes, and what
  would change if a component were removed or rewritten
- Scope boundaries: what the chapter is intentionally skipping or what is only implied

## Goal

Make stories more "follow-up resistant" without turning every chapter into a full code
review. The story should still read smoothly, but it should answer the first layer of
obvious newcomer questions on its own.

## Required Coverage

### 1. Overview chapter

The overview should include:
- A compact mental model of the system or flow
- A short glossary for the most important unfamiliar terms
- An explicit scope note describing what the story will cover and what it will not

### 2. Code-bearing chapters

Each chapter should remain centered on one teaching point, but when the code supports
it the explanation should answer at least two of these four lenses:
- Boundary: what enters this code, what leaves it, and who handles the next step
- Mechanics: which lines perform the important transformation or routing
- Runtime behavior: what invariant, edge case, retry path, or failure mode matters
- Implication: why the design exists, what tradeoff it makes, or what would break if it changed

### 3. Story-level coverage

Across the full story, the narrative should make sure that:
- Unfamiliar terms are defined before heavy use
- Important handoff boundaries are explicitly named
- Behavior-heavy flows mention at least one real invariant or failure path
- Major omissions are acknowledged instead of left implicit

## Non-Goals

- Force a rigid template into every chapter
- Replace narrative flow with exhaustive documentation
- Require every chapter to cover all four lenses
- Cover behavior that cannot be grounded in the code being shown

## Implementation Approach

Prompt changes should:
- Capture terminology, boundaries, runtime behavior, and scope during exploration
- Check for these dimensions during outline review
- Require more grounded explanations during chapter drafting
- Add a final quality gate for follow-up resistance

Lightweight labels such as `**Boundary:**`, `**Mechanics:**`, `**Why:**`, and
`**Caveat:**` are allowed where they improve readability, but they are optional.
