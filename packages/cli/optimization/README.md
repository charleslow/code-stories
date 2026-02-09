# Prompt Optimization Loop

Iteratively improves the `buildPrompt` function in `index.js` using Claude.

## Build

```bash
docker build -t code-stories-optimize -f packages/cli/optimization/Dockerfile packages/cli
```

## Run (interactive)

```bash
mkdir -p results && chmod 777 results
docker run -it --entrypoint /bin/bash -v $(pwd)/results:/app/optimization/results code-stories-optimize
```

Inside the container:

```bash
claude
node optimization/optimize.mjs
```

## Environment Variables

- `MAX_ITERATIONS` - Number of optimization iterations (default: 5)
- `QUERIES_TO_TEST` - Queries to test per iteration (default: 2)

```bash
MAX_ITERATIONS=2 QUERIES_TO_TEST=1 node optimization/optimize.mjs
```
