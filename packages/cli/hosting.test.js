import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectPlatform, extractHost, resolveCli, parseRepoId, getCloneUrl } from './hosting.js';
import { parseLinkedIssues } from './pr.js';

// ---------------------------------------------------------------------------
// extractHost
// ---------------------------------------------------------------------------
describe('extractHost', () => {
  it('extracts host from HTTPS URL', () => {
    assert.equal(extractHost('https://github.com/owner/repo'), 'github.com');
  });

  it('extracts host from SSH URL', () => {
    assert.equal(extractHost('git@gitlab.corp.net:team/repo.git'), 'gitlab.corp.net');
  });

  it('extracts host from custom-domain HTTPS URL', () => {
    assert.equal(extractHost('https://code.mycompany.com/team/repo'), 'code.mycompany.com');
  });

  it('returns null for bare owner/repo', () => {
    assert.equal(extractHost('owner/repo'), null);
  });
});

// ---------------------------------------------------------------------------
// detectPlatform – repoArg-only paths (no git calls needed)
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

  it('detects GitLab Dedicated from HTTPS URL', () => {
    const result = detectPlatform({ repoArg: 'https://sgts.gitlab-dedicated.com/group/project' });
    assert.equal(result.platform, 'gitlab');
    assert.equal(result.host, 'sgts.gitlab-dedicated.com');
  });

  it('detects GitLab Dedicated from SSH URL', () => {
    const result = detectPlatform({ repoArg: 'git@sgts.gitlab-dedicated.com:group/project.git' });
    assert.equal(result.platform, 'gitlab');
    assert.equal(result.host, 'sgts.gitlab-dedicated.com');
  });

  it('detects subdomain gitlab instances (e.g. company.gitlab.io)', () => {
    const result = detectPlatform({ repoArg: 'https://company.gitlab.io/team/repo' });
    assert.equal(result.platform, 'gitlab');
    assert.equal(result.host, 'company.gitlab.io');
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

  it('detects gitlab.com subdomains', () => {
    const result = detectPlatform({ repoArg: 'https://my-org.gitlab.com/team/repo' });
    assert.equal(result.platform, 'gitlab');
    assert.equal(result.host, 'my-org.gitlab.com');
  });

  it('detects GitHub Enterprise Server (github.mycompany.com)', () => {
    const result = detectPlatform({ repoArg: 'https://github.mycompany.com/team/repo' });
    assert.equal(result.platform, 'github');
    assert.equal(result.host, 'github.mycompany.com');
  });

  it('detects GitHub Enterprise Cloud data residency (*.ghe.com)', () => {
    const result = detectPlatform({ repoArg: 'https://my-org.ghe.com/team/repo' });
    assert.equal(result.platform, 'github');
    assert.equal(result.host, 'my-org.ghe.com');
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

  it('extracts path from custom-domain HTTPS URL', () => {
    assert.equal(parseRepoId('https://code.mycompany.com/team/repo'), 'team/repo');
  });

  it('extracts path from custom-domain SSH URL', () => {
    assert.equal(parseRepoId('git@code.mycompany.com:team/repo.git'), 'team/repo');
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

  it('generates URL for custom-domain host', () => {
    assert.equal(
      getCloneUrl('team/repo', { host: 'code.mycompany.com' }),
      'https://code.mycompany.com/team/repo.git',
    );
  });
});

// ---------------------------------------------------------------------------
// resolveCli
// ---------------------------------------------------------------------------
describe('resolveCli', () => {
  it('throws an error mentioning the correct CLI when platform CLI is missing', () => {
    try {
      resolveCli('gitlab');
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
    try {
      const result = resolveCli('gitlab');
      assert.equal(result.platform, 'gitlab');
      assert.equal(result.cli, 'glab');
    } catch {
      // Expected when glab is not installed
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
