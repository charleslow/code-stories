# Code Stories CLI

Generate narrative-driven code stories using Codex. A code story is a guided walkthrough of your codebase that answers questions like "How does authentication work?" or "Trace a request from API to database".

Stories are optimized to answer the first layer of newcomer follow-up questions, not
just summarize modules. The generator now aims to define unfamiliar terms, make key
handoff boundaries explicit, point to concrete lines that do the important work, and
call out major scope limits or runtime caveats when the code supports them.

## Installation

```bash
npm install -g code-stories
```

## Usage

```bash
# Navigate to any git repository
cd my-project

# Generate a story
code-stories "How does the authentication flow work?"

# Resume an interrupted story
code-stories --resume              # list incomplete stories
code-stories --resume <id>         # resume by generation ID (prefix match supported)
```

The CLI will:
1. Analyze your codebase using Codex
2. Create a multi-chapter narrative explaining the code
3. Save the story as JSON in `./stories/{id}.json`

If a generation times out or is interrupted, the intermediate progress is preserved
and you can pick up where it left off with `--resume`.

## Output

Stories are saved to `./stories/` in your current directory as JSON files:

```
my-project/
├── stories/
│   ├── manifest.json     # Index of all stories
│   └── abc123.json       # Individual story file
└── ...
```

## Viewing Stories

Use the [Code Stories Viewer](https://charleslow.github.io/code-stories/) to read your generated stories:

1. Push your `stories/` folder to GitHub
2. Open the viewer with your repo: `https://charleslow.github.io/code-stories/?repo=user/repo&story=abc123`

Or load any story JSON URL directly: `https://charleslow.github.io/code-stories/?url=<story-json-url>`

## Requirements

- Node.js 18+
- Codex CLI installed and configured
- Git repository (for commit hash tracking)

## How It Works

The CLI uses a 6-stage generation pipeline:

1. **Explore** - Understand the codebase structure
2. **Outline** - Create a narrative structure
3. **Review** - Refine the flow and pacing
4. **Identify Snippets** - Select exact code to display
5. **Craft Explanations** - Write context-aware prose
6. **Quality Check & Finalize** - Validate constraints and output JSON

Each stage produces checkpointed intermediate files in `stories/.tmp/<id>/`.
On success these are cleaned up. On failure they're preserved so you can resume
with `--resume`.
