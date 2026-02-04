// API client for communicating with the backend server

import type { Story, StoryManifest } from '../types';

const API_BASE = 'http://localhost:3001/api';

export async function getCommitHash(): Promise<string> {
  const response = await fetch(`${API_BASE}/git/commit-hash`);
  const data = await response.json();
  return data.commitHash;
}

export async function getStories(): Promise<StoryManifest> {
  const response = await fetch(`${API_BASE}/stories`);
  return response.json();
}

export async function getStory(id: string): Promise<Story> {
  const response = await fetch(`${API_BASE}/stories/${id}`);
  if (!response.ok) {
    throw new Error('Story not found');
  }
  return response.json();
}

export async function startGeneration(query: string): Promise<{ generationId: string }> {
  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return response.json();
}

export interface ProgressResponse {
  stage: number;
  files: Record<string, { exists: boolean; hasCheckpoint: boolean }>;
}

export async function getGenerationProgress(generationId: string): Promise<ProgressResponse> {
  const response = await fetch(`${API_BASE}/generate/${generationId}/progress`);
  return response.json();
}
