# Code Stories CLI

Generate narrative-driven code stories using a dual-model pipeline. A code story is a guided walkthrough of your codebase that answers questions like "How does authentication work?" or "Trace a request from API to database".

Stories are optimized to answer the first layer of newcomer follow-up questions, not
just summarize modules. The generator defines unfamiliar terms, makes key handoff
boundaries explicit, points to concrete lines that do the important work, and calls
out major scope limits or runtime caveats when the code supports them.

## Installation

```bash
npm install -g code-stories
```

## Requirements

- Node.js 18+
- [Codex CLI](https://github.com/openai/codex) (`npm install -g @openai/codex`) — configured with an OpenAI API key
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) (`npm install -g @anthropic-ai/claude-code`) — configured with an Anthropic API key
- A git repository to analyze

For PR/MR review mode only:
- [GitHub CLI](https://cli.github.com/) (`gh`) — for GitHub PRs
- [GitLab CLI](https://gitlab.com/gitlab-org/cli) (`glab`) — for GitLab MRs

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
1. Analyze your codebase using Codex (exploration, snippet selection, final assembly)
2. Plan the narrative and write prose explanations using Claude (outline, explanations)
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

## Configuring Models

The npm package includes a default `config.yaml`:

```yaml
models:
  # Codex stages
  explore: codex-mini-latest        # Stage 1: codebase exploration
  snippets: codex-mini-latest       # Stage 3: snippet selection
  assemble: codex-mini-latest       # Stage 5: final assembly

  # Claude stages
  outline: claude-sonnet-4-5        # Stage 2: chapter outline planning
  explanations: claude-opus-4-7     # Stage 4: prose explanations
  chat: gpt-5.4                     # Viewer chat model
```

Override models for a single run with `--models`:

```bash
code-stories "How does auth work?" --models explore=gpt-5.4,outline=claude-sonnet-4-6
```

Model settings are merged in this order: packaged defaults, then `--models`.
The CLI does not read `config.yaml` from the current working directory. Normal mode
and PR mode use the same per-stage model keys. If a model name is invalid or
unavailable, the stage will fail immediately with a clear error that includes the
model name and the CLI's own diagnostic output.

## How It Works

The CLI uses a 5-stage dual-model pipeline:

| Stage | Runner | Description |
|-------|--------|-------------|
| 1. Explore | Codex | Scans the file tree, reads key files, documents architecture |
| 2. Outline | Claude | Plans 5–30 chapters with a single teaching point each |
| 3. Snippets | Codex | Selects exact code line ranges for each chapter |
| 4. Explanations | Claude | Writes prose for each chapter (60–300 words each) |
| 5. Assemble | Codex | Quality-checks constraints and outputs the final JSON |

PR/MR review mode uses the same 5-stage pipeline and runner interleaving, with
PR-specific stage prompts and schema extensions.

Each stage produces checkpointed intermediate files in `stories/.tmp/<id>/`.
On success these are cleaned up. On failure they're preserved so you can resume
with `--resume`.

Codex is used for stages that need file-system tool access (reading sources,
verifying line numbers). Claude is used for stages that are pure reasoning and
prose — outline planning and explanation writing.
