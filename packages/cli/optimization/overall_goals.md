# Overall Goals

These are the high-level goals for the code-stories CLI tool.
Claude will use these as the north star when evaluating and improving prompt quality.

## Story Quality Goals

- Stories should read like a guided tour from a friendly colleague, not a dry reference manual
- The aim is not just to communicate information, but insights
- Each chapter should have one clear teaching point
- Explanations should answer "why" and not just "what"
- Code snippets should be well-scoped (complete logical units, not too long)
- Stories should aim to be comprehensive and self-contained, minimizing user's need to look up terms or concepts elsewhere
- Stories should not be overly verbose - be a thoughtful teacher instead of an exhaustive documentation
- Inject some liveliness where appropriate to bring life to the story and keep the reader engaged, but do not try too hard

## Narrative Flow Goals

- The story should have a natural beginning, middle, and end
- Transitions between chapters should feel smooth and logical
- A reader unfamiliar with the codebase should be able to follow along
- Technical jargon should be introduced before it's used
- The level of explanation should be pegged to the user's proficiency level (if declared)

## Output Quality Goals

- JSON output should be valid and match the schema exactly
- Explanations should reference specific lines in the code snippets when helpful
- Stories should have at least 5 chapters, and up to 30 chapters depending on story complexity
- Code snippets should be 40-80 lines max per chapter
- Each chapter explanation should be not more than 300 words - if more is required, break it up into multiple chapters
