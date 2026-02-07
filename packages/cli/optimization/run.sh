#!/bin/bash
set -euo pipefail

# ============================================================
# Code Stories Prompt Optimization Runner
# ============================================================
#
# Usage:
#   ./run.sh
#
# Prerequisites:
#   - Docker installed
#   - Authenticated via `claude login` (uses your Max subscription)
#
# Configuration (via environment variables):
#   MAX_ITERATIONS   - Number of optimization cycles (default: 5)
#   QUERIES_TO_TEST  - Queries to test per iteration (default: 2)
#
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env if it exists (for MAX_ITERATIONS, QUERIES_TO_TEST overrides)
if [ -f "$SCRIPT_DIR/.env" ]; then
  echo "Loading .env from $SCRIPT_DIR/.env"
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# Check for Claude CLI credentials
CLAUDE_CONFIG_DIR="${HOME}/.claude"
if [ ! -d "$CLAUDE_CONFIG_DIR" ]; then
  echo "ERROR: No Claude CLI credentials found at $CLAUDE_CONFIG_DIR"
  echo ""
  echo "Please authenticate first by running:"
  echo "  claude login"
  echo ""
  echo "This will open your browser to sign in with your Claude Max subscription."
  exit 1
fi

IMAGE_NAME="code-stories-optimizer"
CONTAINER_NAME="code-stories-opt-$(date +%s)"
RESULTS_HOST_DIR="$SCRIPT_DIR/results"

echo "=== Code Stories Prompt Optimization ==="
echo ""
echo "Auth: Using Claude CLI credentials from $CLAUDE_CONFIG_DIR"
echo ""
echo "Building Docker image..."
docker build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile" "$CLI_DIR"

echo ""
echo "Configuration:"
echo "  MAX_ITERATIONS:  ${MAX_ITERATIONS:-5}"
echo "  QUERIES_TO_TEST: ${QUERIES_TO_TEST:-2}"
echo "  Results dir:     $RESULTS_HOST_DIR"
echo ""

# Create results dir on host for volume mount
mkdir -p "$RESULTS_HOST_DIR"

echo "Starting optimization loop..."
echo ""

docker run \
  --name "$CONTAINER_NAME" \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp/home \
  -e MAX_ITERATIONS="${MAX_ITERATIONS:-5}" \
  -e QUERIES_TO_TEST="${QUERIES_TO_TEST:-2}" \
  -v "$CLAUDE_CONFIG_DIR:/tmp/home/.claude:ro" \
  -v "$RESULTS_HOST_DIR:/app/optimization/results" \
  "$IMAGE_NAME"

echo ""
echo "=== Done ==="
echo ""
echo "Results are in: $RESULTS_HOST_DIR/"
echo ""
echo "To use the optimized prompt:"
echo "  cp $RESULTS_HOST_DIR/iteration-<N>/index.js.snapshot packages/cli/index.js"
echo ""

# Cleanup container
docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
