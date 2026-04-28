// Core data types for Code Stories

export interface PRMetadata {
  number: number;
  title: string;
  description: string;
  baseBranch: string;
  headBranch: string;
  author: string;
  url: string;
  labels: string[];
  comments: PRComment[];
}

export interface PRComment {
  author: string;
  body: string;
  path?: string;
  line?: number;
  createdAt: string;
}

export interface DiffLine {
  oldLineNumber: number | null;
  newLineNumber: number | null;
  type: 'added' | 'removed' | 'context';
  content: string;
}

export interface Story {
  id: string;
  title: string;
  query: string;
  repo?: string | null;
  commitHash: string;
  createdAt: string;
  chapters: Chapter[];
  pr?: PRMetadata;
}

export interface Chapter {
  id: string;
  label: string;
  slug?: string;
  snippets: CodeSnippet[];
  explanation: string;
}

export interface CodeSnippet {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  type?: 'code' | 'diff';
  lines?: DiffLine[];
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

// Chat types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface StoryChat {
  storyId: string;
  chapters: Record<string, ChatMessage[]>;
}
