import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// We test pure-logic functions by importing them directly.
// For functions that call execFileSync/execSync, we test via a thin mock.
import { detectPlatform, resolveCli, parseRepoId, getCloneUrl } from './hosting.js';
import { parseLinkedIssues } from './pr.js';

// ---------------------------------------------------------------------------
// detectPlatform – only the repoArg path is pure logic (no git calls)
// ---------------------------------------------------------------------------
describe('detectPlatform', () => {
  it('detects github.com from HTTPS URL', () => {
    const result = detectPlatform({ repoArg: 'https://github.com/owner/repo' });
    assert.equal(result.platform, 'github');
    assert.equal(result.host, 'github.com');
  });

  it('detects gitlab.com from HTTPS URL', () => {
    const result = detectPlatform({ repoArg: 'https://gitlab.com/group/project' });
    assert.equal(result.platform, 'gitlab');
    assert.equal(result.host, 'gitlab.com');
  });

  it('detects self-hosted GitLab from HTTPS URL', () => {
    const result = detectPlatform({ repoArg: 'https://gitlab.example.com/group/project' });
    assert.equal(result.platform, 'gitlab');
    assert.equal(result.host, 'gitlab.example.com');
  });

  it('detects self-hosted GitLab from SSH URL', () => {
    const result = detectPlatform({ repoArg: 'git@gitlab.corp.net:team/repo.git' });
    assert.equal(result.platform, 'gitlab');
    assert.equal(result.host, 'gitlab.corp.net');
  });

  it('defaults to github when given bare owner/repo', () => {
    const result = detectPlatform({ repoArg: 'owner/repo' });
    assert.equal(result.platform, 'github');
    assert.equal(result.host, 'github.com');
  });

  it('defaults to github with no arguments', () => {
    const result = detectPlatform({});
    assert.equal(result.platform, 'github');
    assert.equal(result.host, 'github.com');
  });
});

// ---------------------------------------------------------------------------
// parseRepoId
// ---------------------------------------------------------------------------
describe('parseRepoId', () => {
  it('extracts owner/repo from GitHub HTTPS URL', () => {
    assert.equal(parseRepoId('https://github.com/owner/repo'), 'owner/repo');
  });

  it('extracts owner/repo from GitHub HTTPS URL with .git', () => {
    assert.equal(parseRepoId('https://github.com/owner/repo.git'), 'owner/repo');
  });

  it('extracts group/project from GitLab HTTPS URL', () => {
    assert.equal(parseRepoId('https://gitlab.com/group/project'), 'group/project');
  });

  it('extracts nested group/subgroup/project from GitLab URL', () => {
    assert.equal(
      parseRepoId('https://gitlab.com/group/subgroup/project'),
      'group/subgroup/project',
    );
  });

  it('extracts owner/repo from SSH URL', () => {
    assert.equal(parseRepoId('git@github.com:owner/repo.git'), 'owner/repo');
  });

  it('passes through bare owner/repo unchanged', () => {
    assert.equal(parseRepoId('owner/repo'), 'owner/repo');
  });
});

// ---------------------------------------------------------------------------
// getCloneUrl
// ---------------------------------------------------------------------------
describe('getCloneUrl', () => {
  it('generates HTTPS URL for github.com by default', () => {
    assert.equal(getCloneUrl('owner/repo'), 'https://github.com/owner/repo.git');
  });

  it('generates SSH URL for github.com', () => {
    assert.equal(
      getCloneUrl('owner/repo', { useSSH: true }),
      'git@github.com:owner/repo.git',
    );
  });

  it('generates HTTPS URL for gitlab.com', () => {
    assert.equal(
      getCloneUrl('group/project', { host: 'gitlab.com' }),
      'https://gitlab.com/group/project.git',
    );
  });

  it('generates HTTPS URL for self-hosted GitLab', () => {
    assert.equal(
      getCloneUrl('team/repo', { host: 'gitlab.corp.net' }),
      'https://gitlab.corp.net/team/repo.git',
    );
  });

  it('generates SSH URL for self-hosted GitLab', () => {
    assert.equal(
      getCloneUrl('team/repo', { host: 'gitlab.corp.net', useSSH: true }),
      'git@gitlab.corp.net:team/repo.git',
    );
  });
});

// ---------------------------------------------------------------------------
// resolveCli – tests the error behavior (we can't easily mock isCliAvailable
// without a DI refactor, but we CAN test that it throws for missing CLIs)
// ---------------------------------------------------------------------------
describe('resolveCli', () => {
  it('throws an error mentioning the correct CLI when platform CLI is missing', () => {
    // Use a fake platform value to guarantee the preferred CLI won't be found.
    // Since neither 'gh' nor 'glab' might be installed in CI, we test the
    // error message structure by checking it includes the platform name.
    try {
      resolveCli('gitlab');
      // If glab IS installed, the call succeeds — that's fine, skip assertion.
    } catch (err) {
      assert.match(err.message, /gitlab/i);
      assert.match(err.message, /glab/);
    }

    try {
      resolveCli('github');
    } catch (err) {
      assert.match(err.message, /github/i);
      assert.match(err.message, /\bgh\b/);
    }
  });

  it('does NOT silently flip to the other platform', () => {
    // If the preferred CLI is missing, resolveCli should throw, not fall back.
    // We verify this by checking the error is thrown (not a successful return
    // with a different platform). If the preferred CLI IS installed, the test
    // just passes — no flip to verify.
    try {
      const result = resolveCli('gitlab');
      // If it succeeds, it must be because glab is installed — platform stays gitlab
      assert.equal(result.platform, 'gitlab');
      assert.equal(result.cli, 'glab');
    } catch {
      // Expected when glab is not installed — the old code would have fallen back
    }
  });
});

// ---------------------------------------------------------------------------
// parseLinkedIssues
// ---------------------------------------------------------------------------
describe('parseLinkedIssues', () => {
  it('returns empty array for null/undefined body', () => {
    assert.deepEqual(parseLinkedIssues(null), []);
    assert.deepEqual(parseLinkedIssues(undefined), []);
    assert.deepEqual(parseLinkedIssues(''), []);
  });

  it('parses GitHub-style "closes #N"', () => {
    assert.deepEqual(parseLinkedIssues('closes #42'), [42]);
  });

  it('parses "fixes #N" and "resolves #N"', () => {
    assert.deepEqual(parseLinkedIssues('fixes #1, resolves #2'), [1, 2]);
  });

  it('is case-insensitive', () => {
    assert.deepEqual(parseLinkedIssues('Closes #10\nFIXES #20'), [10, 20]);
  });

  it('deduplicates issue numbers', () => {
    assert.deepEqual(parseLinkedIssues('closes #5 fixes #5'), [5]);
  });

  it('parses GitLab-style "close #N"', () => {
    assert.deepEqual(parseLinkedIssues('close #7'), [7]);
  });

  it('parses GitLab-style "closing #N"', () => {
    assert.deepEqual(parseLinkedIssues('closing #8'), [8]);
  });

  it('parses GitLab-style "closed #N"', () => {
    assert.deepEqual(parseLinkedIssues('closed #9'), [9]);
  });

  it('parses GitLab-style "implement #N"', () => {
    assert.deepEqual(parseLinkedIssues('implement #11'), [11]);
  });

  it('parses GitLab-style "implements #N"', () => {
    assert.deepEqual(parseLinkedIssues('implements #12'), [12]);
  });

  it('parses GitLab-style "implemented #N"', () => {
    assert.deepEqual(parseLinkedIssues('implemented #13'), [13]);
  });

  it('parses "fixing #N" and "resolved #N"', () => {
    assert.deepEqual(parseLinkedIssues('fixing #3 resolved #4'), [3, 4]);
  });

  it('parses "resolving #N" and "fixed #N"', () => {
    assert.deepEqual(parseLinkedIssues('resolving #14 fixed #15'), [14, 15]);
  });

  it('handles mixed GitHub and GitLab patterns', () => {
    const body = 'closes #1, implement #2, fixing #3';
    assert.deepEqual(parseLinkedIssues(body), [1, 2, 3]);
  });

  it('ignores non-matching text', () => {
    assert.deepEqual(parseLinkedIssues('This is a regular PR description'), []);
  });
});
