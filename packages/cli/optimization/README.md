# Prompt Optimization Loop

Iteratively improves the `buildPrompt` function in `index.js` using Claude.

## Prerequisites

- Node.js installed
- Claude CLI installed and authenticated (`npm install -g @anthropic-ai/claude-code && claude login`)

## Run

```bash
./packages/cli/optimization/run.sh
```

Or directly:

```bash
node packages/cli/optimization/optimize.mjs
```

## Environment Variables

- `MAX_ITERATIONS` - Number of optimization iterations (default: 5)
- `QUERIES_TO_TEST` - Queries to test per iteration (default: 2)

```bash
MAX_ITERATIONS=2 QUERIES_TO_TEST=1 node packages/cli/optimization/optimize.mjs
```
