const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Paths
const CODE_JOURNEY_DIR = path.resolve(__dirname, '..');
const CODEBASE_DIR = path.resolve(CODE_JOURNEY_DIR, '..');
const STORIES_DIR = path.join(CODE_JOURNEY_DIR, 'stories');
const TMP_DIR = path.join(STORIES_DIR, '.tmp');

// Ensure directories exist
if (!fs.existsSync(STORIES_DIR)) {
  fs.mkdirSync(STORIES_DIR, { recursive: true });
}
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// Get current commit hash
app.get('/api/git/commit-hash', (req, res) => {
  try {
    const commitHash = execSync('git rev-parse HEAD', {
      cwd: CODEBASE_DIR,
      encoding: 'utf-8',
    }).trim();
    res.json({ commitHash });
  } catch (error) {
    res.json({ commitHash: 'unknown' });
  }
});

// List all stories
app.get('/api/stories', (req, res) => {
  const manifestPath = path.join(STORIES_DIR, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    res.json(manifest);
  } else {
    res.json({ stories: [] });
  }
});

// Get a specific story
app.get('/api/stories/:id', (req, res) => {
  const storyPath = path.join(STORIES_DIR, `${req.params.id}.json`);
  if (fs.existsSync(storyPath)) {
    const story = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));
    res.json(story);
  } else {
    res.status(404).json({ error: 'Story not found' });
  }
});

// Check generation progress
app.get('/api/generate/:generationId/progress', (req, res) => {
  const generationDir = path.join(TMP_DIR, req.params.generationId);

  if (!fs.existsSync(generationDir)) {
    res.json({ stage: 0, files: {} });
    return;
  }

  const files = {};
  const checkFile = (filename, checkpoint) => {
    const filePath = path.join(generationDir, filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      files[filename] = {
        exists: true,
        hasCheckpoint: checkpoint ? content.includes(checkpoint) : true,
      };
    } else {
      files[filename] = { exists: false, hasCheckpoint: false };
    }
  };

  checkFile('exploration_notes.md', 'STAGE_1_COMPLETE');
  checkFile('narrative_outline.md', 'STAGE_3_COMPLETE'); // Check for stage 3 (after review)
  checkFile('snippets_mapping.md', 'STAGE_4_COMPLETE');
  checkFile('story.json', null);

  // Determine current stage
  let stage = 0;
  if (files['exploration_notes.md']?.hasCheckpoint) stage = 1;
  if (files['narrative_outline.md']?.exists && !files['narrative_outline.md']?.hasCheckpoint) stage = 2;
  if (files['narrative_outline.md']?.hasCheckpoint) stage = 3;
  if (files['snippets_mapping.md']?.hasCheckpoint) stage = 4;
  if (files['story.json']?.exists) stage = 5;

  res.json({ stage, files });
});

// Start story generation
app.post('/api/generate', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    res.status(400).json({ error: 'Query is required' });
    return;
  }

  const generationId = uuidv4();
  const generationDir = path.join(TMP_DIR, generationId);
  fs.mkdirSync(generationDir, { recursive: true });

  // Get commit hash
  let commitHash = 'unknown';
  try {
    commitHash = execSync('git rev-parse HEAD', {
      cwd: CODEBASE_DIR,
      encoding: 'utf-8',
    }).trim();
  } catch (error) {
    console.error('Could not get commit hash:', error);
  }

  // Build the complete prompt
  const jsonSchema = `{
  "id": "string (UUID)",
  "title": "string",
  "query": "string",
  "commitHash": "string",
  "createdAt": "string (ISO 8601)",
  "views": [
    {
      "id": "string (e.g., view-0)",
      "label": "string (2-4 words for sidebar)",
      "snippets": [
        {
          "filePath": "string (relative path)",
          "startLine": "number (1-indexed)",
          "endLine": "number (1-indexed)",
          "content": "string (actual code)"
        }
      ],
      "explanation": "string (markdown)"
    }
  ]
}`;

  const prompt = `You are creating a "code story" - a narrative-driven walkthrough that answers:
"${query}"

A code story is a sequence of "views". Each view shows a code snippet alongside
a markdown explanation. The story should flow like a guided tour through the
codebase, not a dry reference manual.

CRITICAL INSTRUCTIONS:
1. You MUST complete each stage fully before proceeding to the next
2. You MUST write the checkpoint marker at the end of each stage's file
3. You MUST verify the previous checkpoint exists before starting a new stage
4. Do NOT skip stages or work on multiple stages simultaneously

Working directory for this generation: ${generationDir}/

==========================================================================
STAGE 1: EXPLORE
==========================================================================
Analyze the codebase to understand the relevant code for this query.

Write your findings to: ${generationDir}/exploration_notes.md

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
Read ${generationDir}/exploration_notes.md and verify it contains STAGE_1_COMPLETE.

Create a narrative outline for the code story.

Write to: ${generationDir}/narrative_outline.md

Structure as:

## Story Title
(A clear, descriptive title for this code journey)

## Overview
(2-3 sentences summarizing what this story will cover and why it matters)

## View Sequence

### View 1: [Short Label]
- **Purpose**: Why this view exists in the narrative
- **What to show**: Which file(s) and roughly which code
- **Key points**: What the reader should learn from this view
- **Transition**: How this connects to the next view

### View 2: [Short Label]
...continue for all views...

Guidelines:
- Start with context/overview (first view may have no code, just explanation)
- Each view should have ONE main teaching point
- Views should build on each other logically
- End with resolution/summary if appropriate
- Aim for 5-15 views depending on complexity
- Labels should be 2-4 words (e.g., "Entry Point", "Parse Request", "Database Query")

End the file with exactly this line:
<!-- CHECKPOINT: STAGE_2_COMPLETE -->

==========================================================================
STAGE 3: REVIEW
==========================================================================
Read ${generationDir}/narrative_outline.md and verify it contains STAGE_2_COMPLETE.

Critically review the outline for quality and flow.

Evaluate:
1. **Logical Flow**: Does each view naturally lead to the next?
2. **Completeness**: Are there gaps where the reader would be confused?
3. **Redundancy**: Are any views repetitive or unnecessary?
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
Read ${generationDir}/narrative_outline.md and verify it contains STAGE_3_COMPLETE.

For each view in the outline, identify the exact code snippets to display.

Write to: ${generationDir}/snippets_mapping.md

For each view:

### View N: [Label]

**Snippet 1:**
- File: path/to/file.py (relative to codebase root)
- Lines: start-end (1-indexed, inclusive)
- Reason: Why this specific code segment was chosen

**Snippet 2 (if needed):**
- File: path/to/other.py
- Lines: start-end
- Reason: Why showing this alongside snippet 1

Constraints:
- Each view's total code should be ~40-80 lines max (fits 1-2 screens)
- Prefer showing complete logical units (whole functions when possible)
- If a function is too long, show the most relevant portion
- Snippets should be self-contained enough to understand
- Include imports/context only if essential for understanding
- The overview view (View 1) typically has no snippets

End the file with exactly this line:
<!-- CHECKPOINT: STAGE_4_COMPLETE -->

==========================================================================
STAGE 5: CRAFT EXPLANATIONS & OUTPUT JSON
==========================================================================
Read ${generationDir}/snippets_mapping.md and verify it contains STAGE_4_COMPLETE.

Now create the final story JSON with context-aware explanations.

Read the code for each snippet identified in Stage 4. For each view, write an
explanation that:

1. **Connects to previous**: Reference what we just saw (except for first view)
   Example: "Building on the router we just saw..."

2. **Explains the code**: What this code does and WHY it matters
   Example: "This function validates the input before passing it to..."

3. **Highlights key details**: Point out important lines, patterns, or decisions
   Example: "Notice how line 23 handles the edge case where..."

4. **Bridges to next**: Subtle setup for what's coming (except for last view)
   Example: "The result is then passed to the service layer, which we'll see next."

The explanation should feel like a knowledgeable colleague walking you through
the code, not a dry API reference.

Write to: ${generationDir}/story.json

Use these values:
- id: "${generationId}"
- query: "${query.replace(/"/g, '\\"')}"
- commitHash: "${commitHash}"
- createdAt: "${new Date().toISOString()}"

The JSON must match this schema exactly:
${jsonSchema}

Additional guidelines for explanations:
- Use markdown formatting (headers, **bold**, \`code references\`)
- Reference specific function/variable names from the snippets
- Keep explanations concise but insightful (3-8 sentences typical)
- The overview view (first) has empty snippets array, just explanation
- Use phrases like "Notice how...", "This is where...", "Building on..."
- Don't just describe what the code does - explain WHY it's designed this way

When story.json is complete, generation is finished.`;

  // Return immediately with generation ID
  res.json({ generationId, status: 'started' });

  // Run Claude CLI in background
  const claude = spawn('claude', ['-p', '--dangerously-skip-permissions', prompt], {
    cwd: CODEBASE_DIR,
    env: { ...process.env },
  });

  let output = '';
  claude.stdout.on('data', (data) => {
    output += data.toString();
  });

  claude.stderr.on('data', (data) => {
    console.error('Claude stderr:', data.toString());
  });

  claude.on('close', (code) => {
    console.log(`Claude process exited with code ${code}`);

    // Check if story.json was created
    const storyPath = path.join(generationDir, 'story.json');
    if (fs.existsSync(storyPath)) {
      try {
        const story = JSON.parse(fs.readFileSync(storyPath, 'utf-8'));

        // Copy to stories directory
        const finalPath = path.join(STORIES_DIR, `${story.id}.json`);
        fs.writeFileSync(finalPath, JSON.stringify(story, null, 2));

        // Update manifest
        const manifestPath = path.join(STORIES_DIR, 'manifest.json');
        let manifest = { stories: [] };
        if (fs.existsSync(manifestPath)) {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        }
        manifest.stories.unshift({
          id: story.id,
          title: story.title,
          commitHash: story.commitHash,
          createdAt: story.createdAt,
        });
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        // Clean up tmp directory
        fs.rmSync(generationDir, { recursive: true, force: true });

        console.log(`Story ${story.id} saved successfully`);
      } catch (error) {
        console.error('Error processing story:', error);
      }
    } else {
      console.error('story.json not found after generation');
    }
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Code Journey server running on port ${PORT}`);
  console.log(`Codebase directory: ${CODEBASE_DIR}`);
  console.log(`Stories directory: ${STORIES_DIR}`);
});
