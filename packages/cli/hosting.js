import { execFileSync, execSync } from 'child_process';

/**
 * Detect the hosting platform from a git remote URL or repo argument.
 *
 * @param {{ cwd?: string, repoArg?: string }} options
 * @returns {'github' | 'gitlab'} detected platform
 */
export function detectPlatform({ cwd, repoArg } = {}) {
  // If a repo argument is provided, parse it first
  if (repoArg) {
    if (/gitlab\.com/i.test(repoArg) || /gitlab\./i.test(repoArg)) return 'gitlab';
    if (/github\.com/i.test(repoArg)) return 'github';
    // Bare owner/repo format — fall through to remote detection or default
  }

  // Try to detect from git remote
  if (cwd) {
    try {
      const remoteUrl = execSync('git remote get-url origin', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (/gitlab\./i.test(remoteUrl)) return 'gitlab';
      if (/github\.com/i.test(remoteUrl)) return 'github';
    } catch {
      // Not a git repo or no remote — fall through
    }
  }

  return 'github'; // default
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
  const fallback = platform === 'gitlab' ? 'gh' : 'glab';

  if (isCliAvailable(preferred)) {
    return { cli: preferred, platform };
  }

  if (isCliAvailable(fallback)) {
    // Flip platform to match the available CLI
    const fallbackPlatform = fallback === 'gh' ? 'github' : 'gitlab';
    return { cli: fallback, platform: fallbackPlatform };
  }

  throw new Error(
    `No supported CLI found. Install the GitHub CLI (gh) from https://cli.github.com/ ` +
    `or the GitLab CLI (glab) from https://gitlab.com/gitlab-org/cli`
  );
}

/**
 * Parse a repo identifier from a URL or shorthand.
 * Returns the owner/repo (or group/project for GitLab).
 */
export function parseRepoId(repo) {
  // Full URL: extract path
  const urlMatch = repo.match(/(?:github|gitlab)\.[^/]*[/:]([^/]+\/[^/.]+(?:\/[^/.]+)*)/);
  if (urlMatch) {
    return urlMatch[1].replace(/\.git$/, '');
  }
  return repo;
}

/**
 * Get the clone URL for a repo.
 */
export function getCloneUrl(repoId, platform, { useSSH = false } = {}) {
  const host = platform === 'gitlab' ? 'gitlab.com' : 'github.com';
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
