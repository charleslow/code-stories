// API client for fetching stories from URLs

import type { Story, StoryManifest } from '../types';

function fetchWithTimeout(url: string, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).then(
    (res) => { clearTimeout(timer); return res; },
    (err) => {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out after 30 seconds');
      }
      throw err;
    }
  );
}

function validateStory(data: unknown): Story {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid story: expected a JSON object');
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.id !== 'string') throw new Error("Invalid story: missing 'id' field");
  if (typeof obj.title !== 'string') throw new Error("Invalid story: missing 'title' field");
  if (!Array.isArray(obj.chapters)) throw new Error("Invalid story: missing 'chapters' array");

  for (let i = 0; i < obj.chapters.length; i++) {
    const ch = obj.chapters[i] as Record<string, unknown>;
    if (typeof ch.id !== 'string') throw new Error(`Invalid story: chapter ${i} missing 'id'`);
    if (typeof ch.label !== 'string') throw new Error(`Invalid story: chapter ${i} missing 'label'`);
    if (typeof ch.explanation !== 'string') throw new Error(`Invalid story: chapter ${i} missing 'explanation'`);
    if (!Array.isArray(ch.snippets)) throw new Error(`Invalid story: chapter ${i} missing 'snippets' array`);

    for (let j = 0; j < (ch.snippets as unknown[]).length; j++) {
      const sn = (ch.snippets as Record<string, unknown>[])[j];
      if (typeof sn.filePath !== 'string') throw new Error(`Invalid story: chapter ${i} snippet ${j} missing 'filePath'`);
      if (typeof sn.startLine !== 'number') throw new Error(`Invalid story: chapter ${i} snippet ${j} missing 'startLine'`);
      if (typeof sn.endLine !== 'number') throw new Error(`Invalid story: chapter ${i} snippet ${j} missing 'endLine'`);
      if (typeof sn.content !== 'string') throw new Error(`Invalid story: chapter ${i} snippet ${j} missing 'content'`);
    }
  }

  return data as Story;
}

function validateManifest(data: unknown): StoryManifest {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid manifest: expected a JSON object');
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.stories)) throw new Error("Invalid manifest: missing 'stories' array");
  return data as StoryManifest;
}

/**
 * Convert a GitHub blob URL to a raw.githubusercontent.com URL.
 * e.g. https://github.com/user/repo/blob/main/path/file.json
 *   -> https://raw.githubusercontent.com/user/repo/main/path/file.json
 * Returns the original URL if it's not a GitHub blob URL.
 */
function normalizeGithubUrl(url: string): string {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)$/);
  if (match) {
    return `https://raw.githubusercontent.com/${match[1]}/${match[2]}`;
  }
  return url;
}

/**
 * Parse a repo param into { user, repo, branch }.
 * Supports "user/repo" (branch defaults to param or "main")
 * and "user/repo/branch" shorthand.
 */
function parseRepoBranch(repoParam: string, branchParam: string | null): { owner: string; repo: string; branch: string } {
  const parts = repoParam.split('/');
  if (parts.length >= 3) {
    return { owner: parts[0], repo: parts[1], branch: parts.slice(2).join('/') };
  }
  return { owner: parts[0], repo: parts[1], branch: branchParam || 'main' };
}

/**
 * Parse URL parameters to determine story source
 * Supports:
 * - ?url=<direct-url-to-json> (also accepts GitHub blob URLs)
 * - ?repo=user/repo&story=story-id (GitHub shorthand)
 * - ?repo=user/repo/branch&story=story-id (branch in repo path)
 * - ?repo=user/repo&branch=master&story=story-id (explicit branch param)
 * - ?folder=custom_folder (default: "stories")
 */
export function getStoryUrlFromParams(params: URLSearchParams): string | null {
  const directUrl = params.get('url');
  if (directUrl) return normalizeGithubUrl(directUrl);

  const repo = params.get('repo');
  const story = params.get('story');
  if (repo && story) {
    const { owner, repo: repoName, branch } = parseRepoBranch(repo, params.get('branch'));
    const folder = params.get('folder') || 'stories';
    return `https://raw.githubusercontent.com/${owner}/${repoName}/${branch}/${folder}/${story}.json`;
  }

  return null;
}

/**
 * Parse URL parameters to determine manifest source
 * Supports:
 * - ?manifest=<direct-url-to-manifest> (also accepts GitHub blob URLs)
 * - ?repo=user/repo (GitHub shorthand - loads manifest)
 * - ?repo=user/repo/branch (branch in repo path)
 * - ?repo=user/repo&branch=master (explicit branch param)
 * - ?folder=custom_folder (default: "stories")
 */
export function getManifestUrlFromParams(params: URLSearchParams): string | null {
  const manifestUrl = params.get('manifest');
  if (manifestUrl) return normalizeGithubUrl(manifestUrl);

  const repo = params.get('repo');
  if (repo && !params.get('story')) {
    const { owner, repo: repoName, branch } = parseRepoBranch(repo, params.get('branch'));
    const folder = params.get('folder') || 'stories';
    return `https://raw.githubusercontent.com/${owner}/${repoName}/${branch}/${folder}/manifest.json`;
  }

  return null;
}

/**
 * Fetch a story from a URL
 */
export async function fetchStory(url: string): Promise<Story> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    const isDefaultBranch = url.includes('/main/stories/');
    const hint = isDefaultBranch
      ? ' If this repository uses a different default branch, try adding ?branch=master'
      : '';
    throw new Error(`Failed to fetch story: ${response.status} ${response.statusText}.${hint}`);
  }
  const data = await response.json();
  return validateStory(data);
}

/**
 * Fetch a manifest from a URL
 */
export async function fetchManifest(url: string): Promise<StoryManifest> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    const isDefaultBranch = url.includes('/main/stories/');
    const hint = isDefaultBranch
      ? ' If this repository uses a different default branch, try adding ?branch=master'
      : '';
    throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}.${hint}`);
  }
  const data = await response.json();
  return validateManifest(data);
}

// Local story discovery (dev mode only)
export interface LocalStory {
  id: string;
  title: string;
  createdAt: string | null;
  url: string;
}

export async function fetchLocalStories(): Promise<LocalStory[]> {
  try {
    const res = await fetch('/local-stories/_discover');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// Local storage helpers for recent stories
const RECENT_STORIES_KEY = 'code-stories-recent';
const MAX_RECENT_STORIES = 10;

export interface RecentStory {
  url: string;
  title: string;
  accessedAt: string;
}

export function getRecentStories(): RecentStory[] {
  try {
    const stored = localStorage.getItem(RECENT_STORIES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addRecentStory(url: string, title: string): void {
  try {
    const recent = getRecentStories().filter(s => s.url !== url);
    recent.unshift({
      url,
      title,
      accessedAt: new Date().toISOString()
    });
    localStorage.setItem(
      RECENT_STORIES_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT_STORIES))
    );
  } catch {
    // Ignore localStorage errors
  }
}

export function clearRecentStories(): void {
  try {
    localStorage.removeItem(RECENT_STORIES_KEY);
  } catch {
    // Ignore localStorage errors
  }
}
