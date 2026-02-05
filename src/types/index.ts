// Core data types for Code Stories

export interface Story {
  id: string;
  title: string;
  query: string;
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

// Generation progress tracking
export type GenerationStage =
  | 'idle'
  | 'exploring'
  | 'outlining'
  | 'reviewing'
  | 'identifying'
  | 'crafting'
  | 'complete'
  | 'error';

export interface GenerationProgress {
  stage: GenerationStage;
  stageNumber: number; // 0-5
  generationId: string;
  error?: string;
}

// Stage configuration for progress tracking
export interface StageConfig {
  file: string;
  checkpoint: string | null;
  label: string;
  stage: GenerationStage;
}

export const STAGES: StageConfig[] = [
  { file: 'exploration_notes.md', checkpoint: 'STAGE_1_COMPLETE', label: 'Exploring codebase', stage: 'exploring' },
  { file: 'narrative_outline.md', checkpoint: 'STAGE_2_COMPLETE', label: 'Creating narrative outline', stage: 'outlining' },
  { file: 'narrative_outline.md', checkpoint: 'STAGE_3_COMPLETE', label: 'Reviewing flow', stage: 'reviewing' },
  { file: 'snippets_mapping.md', checkpoint: 'STAGE_4_COMPLETE', label: 'Identifying code snippets', stage: 'identifying' },
  { file: 'story.json', checkpoint: null, label: 'Crafting explanations', stage: 'crafting' },
];

// App state
export type AppState = 'home' | 'generating' | 'reading';
