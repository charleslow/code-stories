# Overall Goals

These are the high-level goals for the code-stories CLI tool.
Claude will use these as the north star when evaluating and improving prompt quality.

## Story Quality Goals

- Stories should read like a guided tour, not a dry reference manual
- Each chapter should have one clear teaching point
- Explanations should answer "why" not just "what"
- Code snippets should be well-scoped (complete logical units, not too long)

## Narrative Flow Goals

- The story should have a natural beginning, middle, and end
- Transitions between chapters should feel smooth and logical
- A reader unfamiliar with the codebase should be able to follow along
- Technical jargon should be introduced before it's used

## Output Quality Goals

- JSON output should be valid and match the schema exactly
- Stories should have 5-15 chapters depending on query complexity
- Code snippets should be 40-80 lines max per chapter
- Explanations should be 3-8 sentences, concise but insightful
