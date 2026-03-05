import { execFileSync } from 'child_process';

/**
 * Parse a unified diff string into structured file objects with hunks.
 */
export function parseDiff(rawDiff) {
  const files = [];
  const lines = rawDiff.split('\n');
  let currentFile = null;
  let currentHunk = null;

  for (const line of lines) {
    // New file header
    const diffMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (diffMatch) {
      currentFile = { path: diffMatch[2], hunks: [] };
      files.push(currentFile);
      currentHunk = null;
      continue;
    }

    // Hunk header
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch && currentFile) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        newStart: parseInt(hunkMatch[2], 10),
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.lines.push({ type: 'added', content: line.slice(1) });
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({ type: 'removed', content: line.slice(1) });
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({ type: 'context', content: line.slice(1) });
    }
    // Skip lines like "\ No newline at end of file"
  }

  return files;
}

/**
 * Get {owner}/{repo} identifier from the current working directory.
 */
function getRepoIdentifier(cwd) {
  const result = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.trim();
}

/**
 * Parse linked issue numbers from PR body text.
 * Matches patterns like "closes #N", "fixes #N", "resolves #N".
 */
function parseLinkedIssues(body) {
  if (!body) return [];
  const pattern = /(?:closes|fixes|resolves)\s+#(\d+)/gi;
  const issues = [];
  let match;
  while ((match = pattern.exec(body)) !== null) {
    issues.push(parseInt(match[1], 10));
  }
  return [...new Set(issues)];
}

/**
 * Fetch all data for a PR: metadata, diff, and comments.
 *
 * @param {number} prNumber
 * @param {string} cwd - working directory (must be inside the repo)
 * @returns {{ metadata: object, diff: object[], comments: object[] }}
 */
export async function fetchPRData(prNumber, cwd) {
  const nwo = getRepoIdentifier(cwd);

  // PR metadata
  const metaRaw = execFileSync('gh', [
    'pr', 'view', String(prNumber),
    '--json', 'number,title,body,baseRefName,headRefName,author,url,labels',
  ], { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  const meta = JSON.parse(metaRaw);

  // Unified diff
  const rawDiff = execFileSync('gh', ['pr', 'diff', String(prNumber)], {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const diff = parseDiff(rawDiff);

  // Review comments (inline on code)
  let reviewComments = [];
  try {
    const rcRaw = execFileSync('gh', [
      'api', `repos/${nwo}/pulls/${prNumber}/comments`, '--paginate',
    ], { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    reviewComments = JSON.parse(rcRaw);
  } catch {
    // May have no review comments
  }

  // Issue comments (top-level discussion)
  let issueComments = [];
  try {
    const icRaw = execFileSync('gh', [
      'api', `repos/${nwo}/issues/${prNumber}/comments`, '--paginate',
    ], { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    issueComments = JSON.parse(icRaw);
  } catch {
    // May have no issue comments
  }

  // Fetch linked issues
  const linkedIssueNumbers = parseLinkedIssues(meta.body);
  const linkedIssues = [];
  for (const issueNum of linkedIssueNumbers) {
    try {
      const issueRaw = execFileSync('gh', [
        'api', `repos/${nwo}/issues/${issueNum}`,
      ], { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      linkedIssues.push(JSON.parse(issueRaw));
    } catch {
      // Issue may not exist or be accessible
    }
  }

  // Normalize comments into a unified format
  const comments = [
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

  const metadata = {
    number: meta.number,
    title: meta.title,
    description: meta.body || '',
    baseBranch: meta.baseRefName,
    headBranch: meta.headRefName,
    author: meta.author?.login || 'unknown',
    url: meta.url,
    labels: (meta.labels || []).map(l => l.name),
    comments,
    linkedIssues,
  };

  return { metadata, diff, rawDiff };
}
