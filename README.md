# Code Stories

Understand code through narrative-driven stories. Code Stories transforms questions like "How does authentication work?" into guided, chapter-by-chapter walkthroughs of your codebase.

## Packages

This monorepo contains two packages:

### CLI (`packages/cli`)

Generate stories locally in any repository using Claude.

```bash
# Install globally
npm install -g code-stories

# Run in any git repo
cd my-project
code-stories "How does the authentication flow work?"

# Output: ./stories/{id}.json
```

### Viewer (`packages/viewer`)

Static web viewer for reading stories. Deployed at [charleslow.github.io/code-stories](https://charleslow.github.io/code-stories/).

Supports loading stories via URL parameters:
- `?url=<direct-url-to-json>`
- `?repo=user/repo&story=story-id`

## Workflow

1. **Generate**: Run `code-stories "your question"` in any repo
2. **Commit**: Stories are saved to `./stories/` - commit and push them
3. **View**: Open the viewer with `?repo=your/repo&story=story-id`

## Development

```bash
# Install dependencies
npm install

# Run viewer locally
npm run dev

# Build viewer for production
npm run build
```

## How It Works

Code Stories uses a 5-stage generation pipeline:

1. **Explore** - Analyze the codebase structure
2. **Outline** - Create narrative structure with chapter sequence
3. **Review** - Refine flow and pacing
4. **Identify Snippets** - Select exact code segments to display
5. **Craft Explanations** - Write context-aware prose for each chapter

The result is a JSON file containing chapters, each with code snippets and markdown explanations.

## Requirements

- Node.js 18+
- [Claude CLI](https://claude.ai/cli) installed and configured
- Git (for commit hash tracking)
