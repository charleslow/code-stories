# Code Stories

Understand code through narrative-driven stories. Ask a question about any codebase — "How does authentication work?", "Trace a request from API to database" — and get a guided, chapter-by-chapter walkthrough with real code snippets and prose explanations.

[See an example story](https://charleslow.github.io/code-stories/?url=https://raw.githubusercontent.com/charleslow/code-stories/main/sample_stories/story-generation-pipeline.json)

## Requirements

- Node.js 18+
- [Claude CLI](https://claude.ai/cli) installed and configured
- A git repository to analyze

## Quick Start

### Generate a Story (CLI)

```bash
# Navigate to any git repo and ask a question
cd my-project
npx code-stories "How does the authentication flow work?"

# Or analyze a public GitHub repo directly
npx code-stories --repo user/repo "How does the authentication flow work?"
```

Stories are saved as JSON to `./stories/{id}.json` in your current working directory.

### Read a Story (Viewer)

The viewer is deployed at [charleslow.github.io/code-stories](https://charleslow.github.io/code-stories/).

Once you've generated a story, commit and push the `stories/` folder to GitHub, then open:

```
https://charleslow.github.io/code-stories/?repo=user/repo&story=story-id
```

You can also load any story JSON URL directly:

```
https://charleslow.github.io/code-stories/?url=<direct-url-to-story-json>
```

You can also run your own viewer locally or deploy your own by reading further.

---

## Development

This is a monorepo with two packages:
- `packages/cli/` — CLI for generating stories (uses Claude CLI)
- `packages/viewer/` — Static React viewer for reading stories

```bash
# Install all dependencies from root
npm install
```

### Testing the Viewer

```bash
# Development server with hot reload
npm run dev
# Opens at http://localhost:5173/code-stories/

# Production build + preview
npm run build && npm run preview
# Opens at http://localhost:4173/code-stories/
```

Test with the sample story:
```
http://localhost:5173/code-stories/?url=https://raw.githubusercontent.com/charleslow/code-stories/main/sample_stories/story-generation-pipeline.json
```

View locally generated stories (dev mode only):
```
http://localhost:5173/code-stories/?url=/local-stories/{story-id}.json
```

### Testing the CLI

```bash
# Run directly from the repo
node packages/cli/index.js "How does the viewer load stories?"

# Or link globally for testing
cd packages/cli && npm link
cd /path/to/any/repo
code-stories "Your question here"
```

Requires [Claude CLI](https://claude.ai/cli) to be installed and configured.

### Publishing to npm

```bash
cd packages/cli
npm publish
```

### Deploying the Viewer to GitHub Pages

```bash
# Build the viewer
npm run build

# The built output is in packages/viewer/dist/
# Push to the gh-pages branch (or configure GitHub Actions)
```

The viewer is configured with base path `/code-stories/` in `packages/viewer/vite.config.ts` for deployment at `<username>.github.io/code-stories/`.
