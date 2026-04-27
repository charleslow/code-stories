import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutlinePrompt, buildExplanationsPrompt, buildAssemblePrompt } from './prompt.js';
import { buildPRPrompt } from './prompt-pr.js';

test('buildOutlinePrompt includes follow-up coverage guidance', () => {
  const { prompt } = buildOutlinePrompt(
    'How does the request flow work?',
    '/tmp/code-stories-test',
    '# Exploration notes\nSome architectural notes here.',
  );

  assert.match(prompt, /follow-up\s+questions about terminology, exact insertion\s+points, runtime behavior, and design implications/i);
  assert.match(prompt, /Boundary coverage/i);
  assert.match(prompt, /Behavior coverage/i);
  assert.match(prompt, /Scope coverage/i);
  assert.match(prompt, /what gets handed\s+off, where the boundary lives, and why that boundary exists/i);
});

test('buildExplanationsPrompt includes grounding guidance for newcomer questions', () => {
  const { prompt } = buildExplanationsPrompt(
    'How does the request flow work?',
    '/tmp/code-stories-test',
    '# Exploration notes',
    '# Narrative outline',
    '# Snippets mapping',
  );

  assert.match(prompt, /what comes in, what goes out, and who handles it next/i);
});

test('buildAssemblePrompt includes follow-up resistance and grounding checks', () => {
  const { prompt } = buildAssemblePrompt(
    'How does the request flow work?',
    '/tmp/code-stories-test',
    'deadbeef',
    'story-123',
    'owner/repo',
  );

  assert.match(prompt, /states major omissions or scope boundaries/i);
  assert.match(prompt, /where exactly\?.*"what happens next\?".*"what happens if this fails\?"/i);
});

test('buildPRPrompt includes grounding guidance for newcomer questions', () => {
  const { prompt } = buildPRPrompt(
    'Review this PR',
    '/tmp/code-stories-test',
    'deadbeef',
    'story-456',
    'owner/repo',
    {
      metadata: {
        number: 42,
        title: 'Improve retries',
        description: 'Adds retry handling',
        baseBranch: 'main',
        headBranch: 'feature/retries',
        author: 'alice',
        url: 'https://github.com/owner/repo/pull/42',
        labels: ['enhancement'],
        comments: [],
        linkedIssues: [],
      },
      diff: [],
      rawDiff: '',
    },
  );

  assert.match(prompt, /Unfamiliar terms, APIs, or framework concepts a newcomer will need defined/i);
  assert.match(prompt, /Important boundaries: which caller, subsystem, process, or layer hands off/i);
  assert.match(prompt, /Runtime behavior that matters for review:\s+ordering, retries, fallback paths, failure\s+handling, or invariants/i);
  assert.match(prompt, /what this\s+review story can and cannot conclude/i);
  assert.match(prompt, /Where will important terms be defined before the reader hits the diff\?/i);
  assert.match(prompt, /For each snippet-bearing chapter, explain at least TWO of the following/i);
  assert.match(prompt, /where exactly\?.*"what happens next\?".*"what happens if this fails\?"/i);
});
