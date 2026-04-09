# Prompt Optimization Loop

Iteratively improves the `buildPrompt` function in `index.js` using Codex.

## Prerequisites

- Node.js installed
- Codex CLI installed and authenticated

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
