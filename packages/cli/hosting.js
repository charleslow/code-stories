import { execFileSync } from 'child_process';

/**
 * Extract the hostname from a git remote URL (HTTPS or SSH).
 * Returns null if the URL format is not recognized.
 */
export function extractHost(url) {
  // HTTPS: https://host/path
  const httpsMatch = url.match(/^https?:\/\/([^/:]+)/);
  if (httpsMatch) return httpsMatch[1];
  // SSH: git@host:path
  const sshMatch = url.match(/^[^@]+@([^/:]+)/);
  if (sshMatch) return sshMatch[1];
  return null;
}

/**
 * Detect the hosting platform from a git remote URL or repo argument.
 *
 * Detection checks the hostname from repoArg and git remote origin against
 * known GitHub/GitLab domain patterns. Defaults to github if unrecognized.
 *
 * @param {{ cwd?: string, repoArg?: string }} options
 * @returns {{ platform: 'github' | 'gitlab', host: string }}
 */
export function detectPlatform({ cwd, repoArg } = {}) {
  const remoteUrl = getRemoteUrl(cwd);

  // Check both repoArg and remote URL for known hosts
  const urlsToCheck = [repoArg, remoteUrl].filter(Boolean);
  for (const url of urlsToCheck) {
    const h = extractHost(url);
    if (!h) continue;
    if (isGitLabHost(h)) return { platform: 'gitlab', host: h };
    if (isGitHubHost(h)) return { platform: 'github', host: h };
  }

  // Derive host from whatever URL we have, or default
  const host = (repoArg && extractHost(repoArg))
    || (remoteUrl && extractHost(remoteUrl))
    || 'github.com';
  return { platform: 'github', host };
}

/**
 * Known GitLab domain patterns. A hostname is considered GitLab if it matches
 * any of these (case-insensitive):
 *   - gitlab.com                     (SaaS)
 *   - gitlab.<anything>              (self-hosted, e.g. gitlab.example.com)
 *   - <anything>.gitlab.com          (subdomains)
 *   - <anything>.gitlab-dedicated.com (GitLab Dedicated)
 *   - <anything>.gitlab.io           (GitLab Pages / instances)
 */
const GITLAB_PATTERNS = [
  /^gitlab\.com$/i,
  /^gitlab\..+/i,
  /\.gitlab\.com$/i,
  /\.gitlab-dedicated\.com$/i,
  /\.gitlab\.io$/i,
];

function isGitLabHost(hostname) {
  return GITLAB_PATTERNS.some(p => p.test(hostname));
}

function isGitHubHost(hostname) {
  return /^github\.com$/i.test(hostname);
}

/**
 * Get the git remote origin URL for a working directory.
 * Returns null if not a git repo or no remote is configured.
 */
function getRemoteUrl(cwd) {
  if (!cwd) return null;
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if a CLI tool is available.
 */
export function isCliAvailable(cli) {
  try {
    execFileSync(cli, ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve which CLI to use: prefers the platform-native CLI, falls back to the other.
 *
 * @param {'github' | 'gitlab'} platform
 * @returns {{ cli: 'gh' | 'glab', platform: 'github' | 'gitlab' }}
 */
export function resolveCli(platform) {
  const preferred = platform === 'gitlab' ? 'glab' : 'gh';

  if (isCliAvailable(preferred)) {
    return { cli: preferred, platform };
  }

  const installUrl = platform === 'gitlab'
    ? 'https://gitlab.com/gitlab-org/cli'
    : 'https://cli.github.com/';

  throw new Error(
    `The ${platform} CLI (${preferred}) is required but not installed. ` +
    `Install it from ${installUrl}`
  );
}

/**
 * Parse a repo identifier from a URL or shorthand.
 * Returns the owner/repo (or group/project for GitLab).
 * Handles HTTPS URLs, SSH URLs, and bare owner/repo shorthand.
 */
export function parseRepoId(repo) {
  // HTTPS URL: https://host/owner/repo[/sub/groups]
  const httpsMatch = repo.match(/^https?:\/\/[^/]+\/(.+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];
  // SSH URL: git@host:owner/repo
  const sshMatch = repo.match(/^[^@]+@[^:]+:(.+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];
  return repo;
}

/**
 * Get the clone URL for a repo.
 *
 * @param {string} repoId - owner/repo or group/project identifier
 * @param {{ host?: string, useSSH?: boolean }} options
 */
export function getCloneUrl(repoId, { host = 'github.com', useSSH = false } = {}) {
  if (useSSH) {
    return `git@${host}:${repoId}.git`;
  }
  return `https://${host}/${repoId}.git`;
}

/**
 * Get the repo identifier (owner/repo or group/project) from a working directory.
 */
export function getRepoIdentifier(cwd, cli) {
  if (cli === 'glab') {
    // glab repo view outputs JSON with full_path when using -F json
    const result = execFileSync('glab', ['repo', 'view', '-F', 'json'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const data = JSON.parse(result);
    return data.full_path || data.path_with_namespace;
  }

  // gh
  const result = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.trim();
}

/**
 * Fetch MR/PR metadata as a normalized object.
 */
export function fetchMRMetadata(prNumber, cwd, cli) {
  if (cli === 'glab') {
    const raw = execFileSync('glab', [
      'mr', 'view', String(prNumber), '-F', 'json',
    ], { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const mr = JSON.parse(raw);
    return {
      number: mr.iid,
      title: mr.title,
      body: mr.description || '',
      baseBranch: mr.target_branch,
      headBranch: mr.source_branch,
      authorLogin: mr.author?.username || 'unknown',
      url: mr.web_url,
      labels: mr.labels || [],
    };
  }

  // gh
  const raw = execFileSync('gh', [
    'pr', 'view', String(prNumber),
    '--json', 'number,title,body,baseRefName,headRefName,author,url,labels',
  ], { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  const pr = JSON.parse(raw);
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body || '',
    baseBranch: pr.baseRefName,
    headBranch: pr.headRefName,
    authorLogin: pr.author?.login || 'unknown',
    url: pr.url,
    labels: (pr.labels || []).map(l => l.name),
  };
}

/**
 * Fetch the unified diff for a MR/PR.
 */
export function fetchMRDiff(prNumber, cwd, cli) {
  const cmd = cli === 'glab' ? 'glab' : 'gh';
  const sub = cli === 'glab' ? 'mr' : 'pr';
  return execFileSync(cmd, [sub, 'diff', String(prNumber)], {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * Checkout a MR/PR branch.
 */
export function checkoutMR(prNumber, cwd, cli, { timeout = 60_000 } = {}) {
  const cmd = cli === 'glab' ? 'glab' : 'gh';
  const sub = cli === 'glab' ? 'mr' : 'pr';
  execFileSync(cmd, [sub, 'checkout', String(prNumber)], {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout,
  });
}

/**
 * Fetch review/inline comments for a MR/PR.
 * Returns a normalized array of comment objects.
 */
export function fetchReviewComments(prNumber, nwo, cwd, cli) {
  try {
    if (cli === 'glab') {
      // GitLab: MR notes (includes both discussion and inline comments)
      const raw = execFileSync('glab', [
        'api', `projects/${encodeURIComponent(nwo)}/merge_requests/${prNumber}/notes`,
        '--paginate',
      ], { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      const notes = JSON.parse(raw);
      return notes
        .filter(n => !n.system) // Exclude system notes
        .map(n => ({
          author: n.author?.username || 'unknown',
          body: n.body || '',
          path: n.position?.new_path || undefined,
          line: n.position?.new_line || undefined,
          createdAt: n.created_at,
        }));
    }

    // gh: separate review comments and issue comments
    const reviewComments = [];
    const issueComments = [];

    try {
      const rcRaw = execFileSync('gh', [
        'api', `repos/${nwo}/pulls/${prNumber}/comments`, '--paginate',
      ], { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      reviewComments.push(...JSON.parse(rcRaw));
    } catch { /* no review comments */ }

    try {
      const icRaw = execFileSync('gh', [
        'api', `repos/${nwo}/issues/${prNumber}/comments`, '--paginate',
      ], { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      issueComments.push(...JSON.parse(icRaw));
    } catch { /* no issue comments */ }

    return [
      ...issueComments.map(c => ({
        author: c.user?.login || 'unknown',
        body: c.body || '',
        createdAt: c.created_at,
      })),
      ...reviewComments.map(c => ({
        author: c.user?.login || 'unknown',
        body: c.body || '',
        path: c.path || undefined,
        line: c.line || c.original_line || undefined,
        createdAt: c.created_at,
      })),
    ];
  } catch {
    return [];
  }
}

/**
 * Fetch a linked issue by number.
 */
export function fetchIssue(issueNum, nwo, cwd, cli) {
  if (cli === 'glab') {
    const raw = execFileSync('glab', [
      'api', `projects/${encodeURIComponent(nwo)}/issues/${issueNum}`,
    ], { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(raw);
  }

  const raw = execFileSync('gh', [
    'api', `repos/${nwo}/issues/${issueNum}`,
  ], { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  return JSON.parse(raw);
}
