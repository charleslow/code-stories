# Code Stories

Understand code through narrative-driven stories. Ask a question about any codebase — "How does authentication work?", "Trace a request from API to database" — and get a guided, chapter-by-chapter walkthrough with real code snippets and prose explanations.

Sample stories:
- [How Code Stories Works: From Query to Interactive Tour](https://charleslow.github.io/code-stories/?url=https://raw.githubusercontent.com/charleslow/code-stories/main/sample_stories/code-stories-how-it-works.json)
- [Inside BentoML: From Decorators to Production Inference](https://charleslow.github.io/code-stories/?url=https://raw.githubusercontent.com/charleslow/code-stories/main/sample_stories/bentoml.json)
- [One API, Many Frameworks: How Einops Achieves Framework Independence](https://charleslow.github.io/code-stories/?url=https://raw.githubusercontent.com/charleslow/code-stories/main/sample_stories/einops.json)
- [nanoGPT: A Language Model from Scratch](https://charleslow.github.io/code-stories/?url=https://raw.githubusercontent.com/charleslow/code-stories/main/sample_stories/nanogpt.json)
- [Autoresearch End to End: Autonomous AI-Driven LLM Training](https://charleslow.github.io/code-stories/?repo=charleslow/code-stories-cache&story=autoresearch-end-to-end)
- [The Design of OpenClaw: A Personal AI Gateway](https://charleslow.github.io/code-stories/?url=https://raw.githubusercontent.com/charleslow/code-stories/main/sample_stories/openclaw.json)

PR review mode clones the repo, checks out the PR branch, fetches the diff and comments via `gh`, and generates a story that walks through the changes with inline diffs, concerns, and suggestions.

## Requirements

- Node.js 18+
- [Claude CLI](https://claude.ai/cli) installed and configured
- A git repository to analyze
- [GitHub CLI](https://cli.github.com/) (`gh`) — required for GitHub `--pr` mode
- [GitLab CLI](https://gitlab.com/gitlab-org/cli) (`glab`) — required for GitLab `--pr` mode

The CLI auto-detects whether a repo is on GitHub or GitLab (including self-hosted instances and GitLab Dedicated) and uses the appropriate tool.

## Quick Start

### Generate a Story (CLI)

```bash
# Navigate to any git repo and ask a question
cd my-project
npx code-stories "How does the authentication flow work?"

# Or analyze a public GitHub repo directly
npx code-stories --repo user/repo "How does the authentication flow work?"

# Review a pull request (requires gh CLI)
npx code-stories --repo user/repo --pr 42
```

Stories are saved as JSON to `./stories/{id}.json` in your current working directory.

### Common Scenarios

**Explore an unfamiliar codebase:**
```bash
npx code-stories --repo user/repo "How is the project structured and what are the key modules?"
```

**Understand a specific feature:**
```bash
cd my-project
npx code-stories "How does the authentication flow work end to end?"
```

**Review a GitHub PR:**
```bash
npx code-stories --repo user/repo --pr 123
```

**Review a GitLab MR:**
```bash
# GitLab SaaS
npx code-stories --repo gitlab.com/group/project --pr 42

# Self-hosted GitLab
npx code-stories --repo gitlab.example.com/team/project --pr 42

# Nested groups
npx code-stories --repo gitlab.com/org/subgroup/project --pr 15
```

**Trace a request through the stack:**
```bash
npx code-stories "Trace an API request from the HTTP handler to the database and back"
```

**Onboard onto a dependency:**
```bash
npx code-stories --repo bentoml/BentoML "How do I define and deploy a service?"
```

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

Test with a sample story:
```
http://localhost:5173/code-stories/?url=https://raw.githubusercontent.com/charleslow/code-stories/main/sample_stories/einops.json
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
