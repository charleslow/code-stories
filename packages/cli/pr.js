import {
  getRepoIdentifier,
  fetchMRMetadata,
  fetchMRDiff,
  fetchReviewComments,
  fetchIssue,
} from './hosting.js';

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
 * Parse linked issue numbers from PR/MR body text.
 * Matches GitHub patterns (closes/fixes/resolves #N) and
 * GitLab patterns (close/closing/implement/etc. #N).
 */
export function parseLinkedIssues(body) {
  if (!body) return [];
  const keywords = [
    'close', 'closes', 'closed', 'closing',
    'fix', 'fixes', 'fixed', 'fixing',
    'resolve', 'resolves', 'resolved', 'resolving',
    'implement', 'implements', 'implemented',
  ];
  const pattern = new RegExp(`(?:${keywords.join('|')})\\s+#(\\d+)`, 'gi');
  const issues = [];
  let match;
  while ((match = pattern.exec(body)) !== null) {
    issues.push(parseInt(match[1], 10));
  }
  return [...new Set(issues)];
}

/**
 * Fetch all data for a PR/MR: metadata, diff, and comments.
 *
 * @param {number} prNumber
 * @param {string} cwd - working directory (must be inside the repo)
 * @param {'gh' | 'glab'} cli - which CLI to use
 * @returns {{ metadata: object, diff: object[], rawDiff: string }}
 */
export async function fetchPRData(prNumber, cwd, cli = 'gh') {
  const nwo = getRepoIdentifier(cwd, cli);

  // MR/PR metadata (normalized)
  const meta = fetchMRMetadata(prNumber, cwd, cli);

  // Unified diff
  const rawDiff = fetchMRDiff(prNumber, cwd, cli);
  const diff = parseDiff(rawDiff);

  // Comments (normalized)
  const comments = fetchReviewComments(prNumber, nwo, cwd, cli);

  // Fetch linked issues
  const linkedIssueNumbers = parseLinkedIssues(meta.body);
  const linkedIssues = [];
  for (const issueNum of linkedIssueNumbers) {
    try {
      linkedIssues.push(fetchIssue(issueNum, nwo, cwd, cli));
    } catch {
      // Issue may not exist or be accessible
    }
  }

  const metadata = {
    number: meta.number,
    title: meta.title,
    description: meta.body,
    baseBranch: meta.baseBranch,
    headBranch: meta.headBranch,
    author: meta.authorLogin,
    url: meta.url,
    labels: meta.labels,
    comments,
    linkedIssues,
  };

  return { metadata, diff, rawDiff };
}
