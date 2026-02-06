# Code Stories CLI

Generate narrative-driven code stories using Claude. A code story is a guided walkthrough of your codebase that answers questions like "How does authentication work?" or "Trace a request from API to database".

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
```

The CLI will:
1. Analyze your codebase using Claude
2. Create a multi-chapter narrative explaining the code
3. Save the story as JSON in `./stories/{id}.json`

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
- [Claude CLI](https://claude.ai/cli) installed and configured
- Git repository (for commit hash tracking)

## How It Works

The CLI uses a 5-stage generation pipeline:

1. **Explore** - Understand the codebase structure
2. **Outline** - Create a narrative structure
3. **Review** - Refine the flow and pacing
4. **Identify Snippets** - Select exact code to display
5. **Craft Explanations** - Write context-aware prose

Each stage produces intermediate files that are cleaned up on success.
