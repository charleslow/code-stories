> **Note**: This document describes the original monolithic architecture (Express server + React frontend). The project has been restructured into two packages: a CLI (`packages/cli`) for generation and a static viewer (`packages/viewer`). Core concepts (stories, chapters, JSON schema) remain valid; deployment model and technical architecture sections are outdated.

# Code Stories - Product Specifications

## 1. Overview

**Code Stories** is a narrative-driven code exploration tool that transforms the question "How does this code work?" into a guided, sequential story. Users provide a natural language query about a codebase, and an AI generates a curated sequence of code chapters with explanations, enabling comprehensive understanding without context-switching overload.

### Value Proposition

- **Narrative Structure**: Code understanding presented as a coherent story, not scattered file browsing
- **Focused Chapters**: Each chapter shows only what's needed (≤1-2 screens), reducing cognitive load
- **Side-by-Side Explanations**: Markdown explanations accompany each code snippet
- **Commit-Anchored**: Stories are tied to specific commits, ensuring reproducibility

---

## 2. Core Concepts

### Story
A complete narrative explaining a code flow or concept. Contains:
- A **title** (derived from or summarizing the user's query)
- A **summary chapter** providing high-level overview
- An ordered sequence of **chapters**
- Metadata: commit hash, creation timestamp, source folder path

### Chapter
An atomic unit of the story. Contains:
- One or more **code snippets** (from potentially different files)
- A **markdown explanation** displayed alongside the code
- A **label/title** for the outline sidebar
- Total content should fit within 1-2 screen heights

### Code Snippet
A portion of source code within a chapter. Contains:
- File path (relative to codebase root)
- Start and end line numbers
- The actual code content (captured at generation time)

---

## 3. Deployment Model

Code Stories is designed to be **cloned into the target repository** it will analyze:

```
target-repo/
├── code-stories/           # Clone code-stories here
│   ├── src/
│   ├── stories/            # Generated stories stored here
│   ├── package.json
│   └── ...
├── src/                    # Target repo's actual code
├── lib/
└── ...
```

This approach:
- Keeps stories co-located with the code they describe
- Allows stories to be committed alongside the codebase (optional)
- Simplifies path resolution (codebase is always `../`)
- Makes the tool self-contained per project

---

## 4. User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. User clones code-stories into their target repo             │
│  2. User launches the app from within code-stories/             │
│  3. User enters query: "How does X work?" or "Trace Y flow"     │
│  4. App invokes Claude CLI to generate story (batch, not stream)│
│  5. User waits while story generates (loading state)            │
│  6. Story appears: summary chapter first                        │
│  7. User navigates via Next/Prev buttons or sidebar             │
│  8. Story is auto-saved to code-stories/stories/                │
└─────────────────────────────────────────────────────────────────┘
```

### Detailed Steps

1. **Setup** (one-time):
   ```bash
   cd /path/to/target-repo
   git clone <code-stories-repo-url> code-stories
   cd code-stories
   npm install
   ```
2. **Launch**: User runs `npm start` to start local React app
3. **Query**: User types natural language question in text input
4. **Generate**:
   - App automatically uses parent directory (`../`) as the codebase
   - App captures current commit hash of the codebase
   - App invokes Claude CLI with the query and codebase context
   - Loading indicator shown during generation
   - Generation completes fully before displaying (no streaming preview)
5. **Read**:
   - Summary chapter displayed first
   - User navigates with Next/Prev buttons
   - Sidebar shows outline with all chapter labels; current chapter highlighted
   - User can click any sidebar item to jump directly
6. **Persist**: Story auto-saved to `code-stories/stories/{story-id}.json`

---

## 5. Technical Architecture

### Stack

| Layer | Technology |
|-------|------------|
| Frontend | React (with TypeScript) |
| Styling | Custom CSS with design tokens |
| Syntax Highlighting | prism-react-renderer with One Dark theme |
| Font | JetBrains Mono (Google Fonts) |
| Markdown Rendering | react-markdown |
| AI Integration | Claude CLI (subprocess invocation) |
| Storage | Local filesystem (JSON files) |

### Directory Structure

```
target-repo/
├── code-stories/                # This tool (cloned into target repo)
│   ├── src/
│   │   ├── components/
│   │   │   ├── App.tsx
│   │   │   ├── QueryInput.tsx
│   │   │   ├── StoryViewer.tsx
│   │   │   ├── ChapterDisplay.tsx
│   │   │   ├── CodePanel.tsx
│   │   │   ├── ExplanationPanel.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── services/
│   │   │   ├── claude.ts        # Claude CLI invocation
│   │   │   ├── storage.ts       # JSON read/write
│   │   │   └── git.ts           # Commit hash extraction
│   │   ├── types/
│   │   │   └── index.ts         # TypeScript interfaces
│   │   └── index.tsx
│   ├── public/
│   ├── stories/                 # Generated stories stored here
│   │   └── {story-id}.json
│   ├── specs.md
│   ├── package.json
│   └── README.md
├── src/                         # Target repo's code (analyzed by the tool)
├── lib/
└── ...
```

### Claude CLI Integration

The app invokes Claude CLI as a subprocess with:
- The user's query as the prompt
- Instructions to output a structured JSON story
- Access to the parent directory (the target codebase)

```bash
# Run from within code-stories/ directory
cd .. && claude --print "Generate a code story: {user_query}"
```

The prompt to Claude CLI will include:
1. The story JSON schema (see Section 6)
2. Instructions on chapter sizing (1-2 screens max)
3. Instructions to start with a summary chapter
4. The user's query

Claude CLI will have full access to explore and read files in the codebase.

---

## 6. Data Model

### Story JSON Schema

```typescript
interface Story {
  id: string;                  // UUID
  title: string;               // Generated title for the story
  query: string;               // Original user query
  codebasePath: string;        // Absolute path to codebase
  commitHash: string;          // Git commit SHA at generation time
  createdAt: string;           // ISO 8601 timestamp
  chapters: Chapter[];         // Ordered array of chapters
}

interface Chapter {
  id: string;                  // UUID or sequential ID
  label: string;               // Short title for sidebar (e.g., "Entry Point")
  snippets: CodeSnippet[];     // One or more code snippets
  explanation: string;         // Markdown explanation
}

interface CodeSnippet {
  filePath: string;            // Relative path from codebase root
  startLine: number;           // 1-indexed
  endLine: number;             // 1-indexed, inclusive
  content: string;             // Actual code content (snapshot)
}
```

### Example Story JSON

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "Request Handling Flow",
  "query": "How does a user request get processed from API to database?",
  "codebasePath": "/home/user/projects/myapp",
  "commitHash": "abc123def456",
  "createdAt": "2025-01-15T10:30:00Z",
  "chapters": [
    {
      "id": "chapter-0",
      "label": "Overview",
      "snippets": [],
      "explanation": "# Request Handling Flow\n\nThis story traces how a user HTTP request travels through the application...\n\n## Key Components\n- **API Layer**: FastAPI routes in `api/`\n- **Service Layer**: Business logic in `services/`\n- **Data Layer**: SQLAlchemy models in `models/`"
    },
    {
      "id": "chapter-1",
      "label": "API Entry Point",
      "snippets": [
        {
          "filePath": "api/routes/users.py",
          "startLine": 15,
          "endLine": 28,
          "content": "@router.post('/users')\nasync def create_user(user: UserCreate, db: Session = Depends(get_db)):\n    ..."
        }
      ],
      "explanation": "The request first hits the FastAPI route handler...\n\nNote how dependency injection provides the database session via `Depends(get_db)`."
    }
  ]
}
```

### Storage Location

Stories are saved within the code-stories folder: `code-stories/stories/{story-id}.json`

A manifest file `code-stories/stories/manifest.json` tracks all stories for quick listing:

```json
{
  "stories": [
    {
      "id": "a1b2c3d4-...",
      "title": "Request Handling Flow",
      "commitHash": "abc123def456",
      "createdAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

Note: The `codebasePath` in the Story JSON is always `../` (parent directory) and is included for completeness.

---

## 7. UI/UX Specifications

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Header: "Code Stories" logo/title                                   │
├────────────┬─────────────────────────────────────────────────────────┤
│            │                                                         │
│  Sidebar   │   Main Content Area                                     │
│            │   ┌─────────────────────┬─────────────────────────┐     │
│  ● Overview│   │  Code Panel (LEFT)  │  Explanation Panel      │     │
│  ○ Entry   │   │                     │  (RIGHT)                │     │
│  ○ Service │   │  ┌───────────────┐  │                         │     │
│  ○ Database│   │  │ Snippet 1     │  │  Markdown rendered      │     │
│  ○ Response│   │  │ file: foo.py  │  │  explanation for        │     │
│            │   │  │ lines 10-25   │  │  this chapter           │     │
│            │   │  └───────────────┘  │                         │     │
│            │   │  ┌───────────────┐  │                         │     │
│            │   │  │ Snippet 2     │  │                         │     │
│            │   │  │ file: bar.py  │  │                         │     │
│            │   │  │ lines 5-18    │  │                         │     │
│            │   │  └───────────────┘  │                         │     │
│            │   └─────────────────────┴─────────────────────────┘     │
│            │                                                         │
│            │   ┌──────────┐                        ┌──────────┐      │
│            │   │  ← Prev  │                        │  Next →  │      │
│            │   └──────────┘                        └──────────┘      │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Key Layout Points:**
- Code panel on the **left**, explanation panel on the **right**
- Multiple snippets within a chapter are **stacked vertically** in the code panel
- Each snippet shows its file path and line range as a header

### Component Specifications

#### Sidebar
- Width: ~200px, fixed
- Lists all chapter labels vertically
- Current chapter highlighted (filled circle or background color)
- Clicking a label jumps to that chapter
- Scrollable if many chapters

#### Code Panel
- Width: ~50-60% of main content area
- Syntax highlighting for Python
- Shows file path and line numbers above each snippet
- If multiple snippets in one chapter, stack vertically with clear separators
- Vertical scroll if content exceeds viewport

#### Explanation Panel
- Width: ~40-50% of main content area
- Renders markdown (headers, lists, inline code, bold, etc.)
- Vertical scroll if content exceeds viewport

#### Navigation Buttons
- "← Prev" and "Next →" buttons at bottom of main content
- Prev disabled on first chapter, Next disabled on last chapter
- Keyboard shortcuts: Left/Right arrows or J/K

#### Query Input Screen
- Shown when no story is loaded or user wants to create a new story
- Text area for query (codebase is automatically the parent directory `../`)
- "Generate Story" button
- List of previously generated stories (from manifest) with ability to load

#### Loading State

The loading UI shows progress through the 5-stage generation pipeline:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              Generating your code story...                  │
│                                                             │
│   ✓ Stage 1: Exploring codebase                             │
│   ✓ Stage 2: Creating narrative outline                     │
│   ● Stage 3: Reviewing flow...                              │
│   ○ Stage 4: Identifying code snippets                      │
│   ○ Stage 5: Crafting explanations                          │
│                                                             │
│   ━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░  60%                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Legend:
- ✓ = completed
- ● = in progress (with spinner animation)
- ○ = pending

Progress is tracked via file-based checkpoints (see Section 8).

### Visual Design Principles
- Clean, minimal interface
- High contrast for code readability
- Monospace font for code, sans-serif for explanations
- Light theme initially (dark theme as future enhancement)

---

## 8. AI Integration Details

The AI generation process is the core value proposition. Rather than a single-shot generation, we use a **multi-stage pipeline** that produces higher quality, more cohesive narratives.

### Generation Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Stage 1: EXPLORE                                                       │
│  - Understand codebase structure                                        │
│  - Identify relevant files/functions for the query                      │
│  - Output: exploration_notes.md                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Stage 2: OUTLINE                                                       │
│  - Create narrative structure (sequence of chapters)                    │
│  - Define the "story arc" - beginning, middle, end                      │
│  - Output: narrative_outline.md                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Stage 3: REVIEW                                                        │
│  - Analyze outline for logical flow                                     │
│  - Check for gaps, redundancies, or ordering issues                     │
│  - Refine the outline                                                   │
│  - Output: narrative_outline.md (revised)                               │
├─────────────────────────────────────────────────────────────────────────┤
│  Stage 4: IDENTIFY SNIPPETS                                             │
│  - For each chapter, identify exact code snippets                       │
│  - Determine file paths, line ranges                                    │
│  - Ensure snippets fit within size constraints                          │
│  - Output: snippets_mapping.md                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  Stage 5: CRAFT EXPLANATIONS                                            │
│  - Write explanation for each chapter                                   │
│  - Context-aware: knows preceding and following chapters                │
│  - References the actual code snippets                                  │
│  - Output: final story JSON                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Working Directory

During generation, intermediate files are stored in: `code-stories/stories/.tmp/{generation-id}/`

```
.tmp/
└── {generation-id}/
    ├── exploration_notes.md    # Stage 1 output
    ├── narrative_outline.md    # Stage 2 & 3 output
    ├── snippets_mapping.md     # Stage 4 output
    └── story.json              # Stage 5 output (final)
```

**Cleanup Policy:**
- On **success**: Once `story.json` is validated and copied to `stories/{story-id}.json`, the entire `.tmp/{generation-id}/` directory is deleted
- On **failure**: The tmp directory is preserved for debugging; user can manually inspect or retry

---

### Enforcing Sequential Execution

To ensure Claude CLI systematically works through each stage, we use two mechanisms:

#### 1. File-Based Checkpoints

Each stage MUST write a checkpoint marker at the end of its output file:

```markdown
<!-- CHECKPOINT: STAGE_1_COMPLETE -->
```

The prompt explicitly instructs Claude:
- Write the checkpoint marker only after completing the stage
- Do NOT proceed to the next stage until the checkpoint is written
- Read back the previous stage's file before starting the next stage

#### 2. Progress Tracking via File Watcher

The React app monitors the tmp directory for file changes:

```typescript
// services/progressTracker.ts

interface StageConfig {
  file: string;
  checkpoint: string;
  label: string;
}

const STAGES: StageConfig[] = [
  { file: 'exploration_notes.md',   checkpoint: 'STAGE_1_COMPLETE', label: 'Exploring codebase' },
  { file: 'narrative_outline.md',   checkpoint: 'STAGE_2_COMPLETE', label: 'Creating narrative outline' },
  { file: 'narrative_outline.md',   checkpoint: 'STAGE_3_COMPLETE', label: 'Reviewing flow' },
  { file: 'snippets_mapping.md',    checkpoint: 'STAGE_4_COMPLETE', label: 'Identifying code snippets' },
  { file: 'story.json',             checkpoint: null,               label: 'Crafting explanations' },
];

// Poll the tmp directory every 1-2 seconds
// Check if each file exists and contains its checkpoint marker
// Update UI to reflect current stage
```

#### 3. Prompt Structure for Enforcement

The master prompt uses explicit stage boundaries:

```
IMPORTANT: You must complete each stage fully before proceeding to the next.
After completing each stage, write the checkpoint marker to the file.
Do not skip stages or work on multiple stages simultaneously.

==========
STAGE 1: EXPLORE
==========
[Instructions...]

When complete, end the file with:
<!-- CHECKPOINT: STAGE_1_COMPLETE -->

Then proceed to Stage 2.

==========
STAGE 2: OUTLINE
==========
[Instructions...]

First, verify that exploration_notes.md exists and contains STAGE_1_COMPLETE.
[Continue with stage 2 instructions...]

When complete, end the file with:
<!-- CHECKPOINT: STAGE_2_COMPLETE -->

...and so on
```

#### 4. Stage Verification in Prompt

Each stage (except the first) includes a verification step:

```
Before starting this stage, confirm:
1. The file from the previous stage exists
2. It contains the expected checkpoint marker
3. Read its contents to inform this stage's work

If verification fails, stop and report the error.
```

This creates a chain of dependencies that naturally enforces sequential execution.

---

### Stage Reference (Documentation)

The following describes what each stage accomplishes. The actual prompt sent to Claude CLI combines all stages into one (see "Complete Prompt" below).

| Stage | Goal | Output File | Checkpoint |
|-------|------|-------------|------------|
| 1. Explore | Understand codebase structure relevant to query | `exploration_notes.md` | `STAGE_1_COMPLETE` |
| 2. Outline | Create narrative structure (sequence of chapters) | `narrative_outline.md` | `STAGE_2_COMPLETE` |
| 3. Review | Analyze flow, fix gaps/redundancy, refine | `narrative_outline.md` (updated) | `STAGE_3_COMPLETE` |
| 4. Snippets | Map each chapter to exact file:line ranges | `snippets_mapping.md` | `STAGE_4_COMPLETE` |
| 5. Explain | Write context-aware explanations, output JSON | `story.json` | (file existence) |

---

### JSON Schema (for Stage 5)

```typescript
interface Story {
  id: string;                  // UUID
  title: string;               // From narrative outline
  query: string;               // Original user query
  commitHash: string;          // Git commit SHA
  createdAt: string;           // ISO 8601 timestamp
  chapters: Chapter[];
}

interface Chapter {
  id: string;                  // "chapter-0", "chapter-1", etc.
  label: string;               // Short title for sidebar
  snippets: CodeSnippet[];     // Empty array for overview chapter
  explanation: string;         // Markdown explanation
}

interface CodeSnippet {
  filePath: string;            // Relative to codebase root
  startLine: number;           // 1-indexed
  endLine: number;             // 1-indexed, inclusive
  content: string;             // Actual code content
}
```

---

### Implementation Approach

The pipeline runs as a **single Claude CLI session**:
- One invocation with a comprehensive prompt
- Claude works through all stages sequentially
- Writes intermediate files as checkpoints (enabling progress tracking)
- Outputs final JSON at the end
- Maintains full context throughout generation

---

### Complete Prompt

This is the single prompt sent to Claude CLI. It contains all stage instructions inline.

```
You are creating a "code story" - a narrative-driven walkthrough that answers:
"{user_query}"

A code story is a sequence of "chapters". Each chapter shows a code snippet alongside
a markdown explanation. The story should flow like a guided tour through the
codebase, not a dry reference manual.

CRITICAL INSTRUCTIONS:
1. You MUST complete each stage fully before proceeding to the next
2. You MUST write the checkpoint marker at the end of each stage's file
3. You MUST verify the previous checkpoint exists before starting a new stage
4. Do NOT skip stages or work on multiple stages simultaneously

Working directory for this generation: {tmp_dir}/

==========================================================================
STAGE 1: EXPLORE
==========================================================================
Analyze the codebase to understand the relevant code for this query.

Write your findings to: {tmp_dir}/exploration_notes.md

Structure your notes as:

## Relevant Files
- List each file with a brief description of its role

## Key Components
- Important classes, functions, constants
- Their responsibilities and relationships

## Flow Analysis
- How data/control flows through the system for this query
- The sequence of operations

## Entry Points
- Where does the flow start?
- What triggers the process?

## Dependencies
- What calls what?
- External libraries or services involved

Be thorough but focused on what's relevant to the query.

End the file with exactly this line:
<!-- CHECKPOINT: STAGE_1_COMPLETE -->

==========================================================================
STAGE 2: OUTLINE
==========================================================================
Read {tmp_dir}/exploration_notes.md and verify it contains STAGE_1_COMPLETE.

Create a narrative outline for the code story.

Write to: {tmp_dir}/narrative_outline.md

Structure as:

## Story Title
(A clear, descriptive title for this code story)

## Overview
(2-3 sentences summarizing what this story will cover and why it matters)

## Chapter Sequence

### Chapter 1: [Short Label]
- **Purpose**: Why this chapter exists in the narrative
- **What to show**: Which file(s) and roughly which code
- **Key points**: What the reader should learn from this chapter
- **Transition**: How this connects to the next chapter

### Chapter 2: [Short Label]
...continue for all chapters...

Guidelines:
- Start with context/overview (first chapter may have no code, just explanation)
- Each chapter should have ONE main teaching point
- Chapters should build on each other logically
- End with resolution/summary if appropriate
- Aim for 5-15 chapters depending on complexity
- Labels should be 2-4 words (e.g., "Entry Point", "Parse Request", "Database Query")

End the file with exactly this line:
<!-- CHECKPOINT: STAGE_2_COMPLETE -->

==========================================================================
STAGE 3: REVIEW
==========================================================================
Read {tmp_dir}/narrative_outline.md and verify it contains STAGE_2_COMPLETE.

Critically review the outline for quality and flow.

Evaluate:
1. **Logical Flow**: Does each chapter naturally lead to the next?
2. **Completeness**: Are there gaps where the reader would be confused?
3. **Redundancy**: Are any chapters repetitive or unnecessary?
4. **Pacing**: Is the story well-paced? Not too fast or too slow?
5. **Clarity**: Will a reader unfamiliar with the codebase follow along?
6. **Cohesion**: Does the story feel unified, not fragmented?

If you find issues, revise the outline directly in the file.

Add a section at the end:

## Review Notes
- What changes were made and why
- Any concerns or trade-offs in the narrative

Replace the Stage 2 checkpoint with:
<!-- CHECKPOINT: STAGE_3_COMPLETE -->

==========================================================================
STAGE 4: IDENTIFY SNIPPETS
==========================================================================
Read {tmp_dir}/narrative_outline.md and verify it contains STAGE_3_COMPLETE.

For each chapter in the outline, identify the exact code snippets to display.

Write to: {tmp_dir}/snippets_mapping.md

For each chapter:

### Chapter N: [Label]

**Snippet 1:**
- File: path/to/file.py (relative to codebase root)
- Lines: start-end (1-indexed, inclusive)
- Reason: Why this specific code segment was chosen

**Snippet 2 (if needed):**
- File: path/to/other.py
- Lines: start-end
- Reason: Why showing this alongside snippet 1

Constraints:
- Each chapter's total code should be ~40-80 lines max (fits 1-2 screens)
- Prefer showing complete logical units (whole functions when possible)
- If a function is too long, show the most relevant portion
- Snippets should be self-contained enough to understand
- Include imports/context only if essential for understanding
- The overview chapter (Chapter 1) typically has no snippets

End the file with exactly this line:
<!-- CHECKPOINT: STAGE_4_COMPLETE -->

==========================================================================
STAGE 5: CRAFT EXPLANATIONS & OUTPUT JSON
==========================================================================
Read {tmp_dir}/snippets_mapping.md and verify it contains STAGE_4_COMPLETE.

Now create the final story JSON with context-aware explanations.

Read the code for each snippet identified in Stage 4. For each chapter, write an
explanation that:

1. **Connects to previous**: Reference what we just saw (except for first chapter)
   Example: "Building on the router we just saw..."

2. **Explains the code**: What this code does and WHY it matters
   Example: "This function validates the input before passing it to..."

3. **Highlights key details**: Point out important lines, patterns, or decisions
   Example: "Notice how line 23 handles the edge case where..."

4. **Bridges to next**: Subtle setup for what's coming (except for last chapter)
   Example: "The result is then passed to the service layer, which we'll see next."

The explanation should feel like a knowledgeable colleague walking you through
the code, not a dry API reference.

Write to: {tmp_dir}/story.json

The JSON must match this schema exactly:

{json_schema}

Additional guidelines for explanations:
- Use markdown formatting (headers, **bold**, `code references`)
- Reference specific function/variable names from the snippets
- Keep explanations concise but insightful (3-8 sentences typical)
- The overview chapter (first) has empty snippets array, just explanation
- Use phrases like "Notice how...", "This is where...", "Building on..."
- Don't just describe what the code does - explain WHY it's designed this way

When story.json is complete, generation is finished.
```

---

### Post-Generation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  story.json created in .tmp/{generation-id}/                    │
│                              ↓                                  │
│  Validate JSON structure and required fields                    │
│                              ↓                                  │
│  Copy to stories/{story-id}.json                                │
│                              ↓                                  │
│  Update stories/manifest.json                                   │
│                              ↓                                  │
│  Delete .tmp/{generation-id}/ directory                         │
│                              ↓                                  │
│  Display story to user                                          │
└─────────────────────────────────────────────────────────────────┘
```

### Error Handling

| Scenario | Behavior | Tmp Directory |
|----------|----------|---------------|
| Claude CLI fails | Display error, offer retry | Preserved |
| JSON parsing fails | Display error, offer retry | Preserved |
| Incomplete generation | Show last completed stage, offer retry | Preserved |
| Timeout | Display timeout message, offer retry | Preserved |
| Success | Story displayed | Deleted |

When tmp directory is preserved, user can:
- Inspect intermediate files to understand what went wrong
- Retry generation (creates new generation-id)
- Manually delete `.tmp/` to clean up failed attempts

---

## 9. Scope & Limitations (v1)

### In Scope
- Single local codebase folder as source
- Python code with syntax highlighting
- UI text input for queries
- Claude CLI for generation
- JSON storage locally
- Next/Prev navigation with sidebar
- Commit-anchored stories

### Out of Scope (v1)
- Multiple language support
- Code annotations/highlights
- Export (PDF, HTML)
- User editing of explanations
- Drill-down / sub-stories
- Single-chapter regeneration
- Real-time code sync
- Search within stories
- Deployment (cloud hosting)
- Authentication

---

## 10. Future Considerations

These are not planned for v1 but noted for potential future versions:

- **Multi-language support**: Extend beyond Python
- **Dark theme**: User preference toggle
- **Story diffing**: When code changes, show what's different
- **Collaborative features**: Share stories via links
- **Export**: PDF or static HTML for offline viewing
- **Interactive elements**: Click on function names to drill down
- **Story templates**: Pre-built patterns like "API flow", "Error handling"
- **VS Code extension**: Read stories within the editor
- **Story versioning**: Track how stories evolve with code

---

## 11. Glossary

| Term | Definition |
|------|------------|
| Story | A complete narrative explaining a code flow, containing multiple chapters |
| Chapter | An atomic unit: code snippet(s) + markdown explanation |
| Snippet | A portion of a source file (file path + line range + content) |
| Commit-anchored | Story is tied to a specific git commit hash |
| Claude CLI | Command-line interface for Claude AI, used for generation |

---

## Appendix A: Keyboard Shortcuts

| Key | Action |
|-----|--------|
| → or L | Next chapter |
| ← or H | Previous chapter |
| Home | First chapter |
| End | Last chapter |
| 1-9 | Jump to chapter 1-9 (if exists) |
