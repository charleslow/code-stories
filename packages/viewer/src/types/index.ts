// Core data types for Code Stories

export interface Story {
  id: string;
  title: string;
  query: string;
  repo?: string | null;
  commitHash: string;
  createdAt: string;
  chapters: Chapter[];
}

export interface Chapter {
  id: string;
  label: string;
  snippets: CodeSnippet[];
  explanation: string;
}

export interface CodeSnippet {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
}

// Manifest for tracking all stories
export interface StoryManifest {
  stories: StoryMetadata[];
}

export interface StoryMetadata {
  id: string;
  title: string;
  commitHash: string;
  createdAt: string;
}

// App state for viewer
export type AppState = 'home' | 'loading' | 'reading' | 'error';
