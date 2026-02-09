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
#   - Node.js installed
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

# Check for Claude CLI
if ! command -v claude &> /dev/null; then
  echo "ERROR: Claude CLI not found."
  echo ""
  echo "Please install it first:"
  echo "  npm install -g @anthropic-ai/claude-code"
  echo ""
  echo "Then authenticate:"
  echo "  claude login"
  exit 1
fi

# Install CLI dependencies if needed
if [ ! -d "$CLI_DIR/node_modules" ]; then
  echo "Installing CLI dependencies..."
  (cd "$CLI_DIR" && npm install)
fi

echo "=== Code Stories Prompt Optimization ==="
echo ""
echo "Configuration:"
echo "  MAX_ITERATIONS:  ${MAX_ITERATIONS:-5}"
echo "  QUERIES_TO_TEST: ${QUERIES_TO_TEST:-2}"
echo "  Results dir:     $SCRIPT_DIR/results"
echo ""
echo "Starting optimization loop..."
echo ""

MAX_ITERATIONS="${MAX_ITERATIONS:-5}" \
QUERIES_TO_TEST="${QUERIES_TO_TEST:-2}" \
node "$SCRIPT_DIR/optimize.mjs"

echo ""
echo "=== Done ==="
echo ""
echo "Results are in: $SCRIPT_DIR/results/"
echo ""
echo "To use the optimized prompt:"
echo "  cp $SCRIPT_DIR/results/iteration-<N>/index.js.snapshot packages/cli/index.js"
echo ""
