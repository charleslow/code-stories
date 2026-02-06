// API client for fetching stories from URLs

import type { Story, StoryManifest } from '../types';

/**
 * Parse URL parameters to determine story source
 * Supports:
 * - ?url=<direct-url-to-json>
 * - ?repo=user/repo&story=story-id (GitHub shorthand)
 */
export function getStoryUrlFromParams(params: URLSearchParams): string | null {
  const directUrl = params.get('url');
  if (directUrl) return directUrl;

  const repo = params.get('repo');
  const story = params.get('story');
  if (repo && story) {
    return `https://raw.githubusercontent.com/${repo}/main/stories/${story}.json`;
  }

  return null;
}

/**
 * Parse URL parameters to determine manifest source
 * Supports:
 * - ?manifest=<direct-url-to-manifest>
 * - ?repo=user/repo (GitHub shorthand - loads manifest)
 */
export function getManifestUrlFromParams(params: URLSearchParams): string | null {
  const manifestUrl = params.get('manifest');
  if (manifestUrl) return manifestUrl;

  const repo = params.get('repo');
  if (repo && !params.get('story')) {
    return `https://raw.githubusercontent.com/${repo}/main/stories/manifest.json`;
  }

  return null;
}

/**
 * Fetch a story from a URL
 */
export async function fetchStory(url: string): Promise<Story> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch story: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch a manifest from a URL
 */
export async function fetchManifest(url: string): Promise<StoryManifest> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
  }
  return response.json();
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
