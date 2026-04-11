import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from './prompt.js';

test('buildPrompt includes follow-up coverage guidance', () => {
  const { prompt } = buildPrompt(
    'How does the request flow work?',
    '/tmp/code-stories-test',
    'deadbeef',
    'story-123',
    'owner/repo',
  );

  assert.match(prompt, /follow-up\s+questions about terminology, exact insertion\s+points, runtime behavior, and design implications/i);
  assert.match(prompt, /Boundary coverage/i);
  assert.match(prompt, /Behavior coverage/i);
  assert.match(prompt, /Scope coverage/i);
  assert.match(prompt, /what comes in, what goes out, and who handles it next/i);
  assert.match(prompt, /states major omissions or scope boundaries/i);
});
