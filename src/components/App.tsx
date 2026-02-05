import { useState, useEffect, useCallback } from 'react';
import type { Story, StoryMetadata, AppState } from '../types';
import { getStories, getStory, startGeneration, getGenerationProgress } from '../services/api';
import { QueryInput } from './QueryInput';
import { GeneratingView } from './GeneratingView';
import { StoryViewer } from './StoryViewer';

export function App() {
  const [appState, setAppState] = useState<AppState>('home');
  const [stories, setStories] = useState<StoryMetadata[]>([]);
  const [currentStory, setCurrentStory] = useState<Story | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [generationStage, setGenerationStage] = useState(0);
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [generationStatus, setGenerationStatus] = useState<'running' | 'completed' | 'failed' | 'unknown'>('unknown');
  const [currentQuery, setCurrentQuery] = useState('');

  // Load stories on mount
  useEffect(() => {
    getStories().then((manifest) => {
      setStories(manifest.stories);
    });
  }, []);

  // Poll for generation progress
  useEffect(() => {
    if (!generationId || appState !== 'generating') return;

    const pollInterval = setInterval(async () => {
      try {
        const progress = await getGenerationProgress(generationId);
        setGenerationStage(progress.stage);
        setGenerationLogs(progress.logs || []);
        setGenerationStatus(progress.status || 'unknown');

        // Check if complete
        if (progress.stage >= 5 || progress.status === 'completed') {
          clearInterval(pollInterval);
          // Wait a moment for the server to process the final story
          setTimeout(async () => {
            try {
              const story = await getStory(generationId);
              setCurrentStory(story);
              setAppState('reading');
              // Refresh stories list
              const manifest = await getStories();
              setStories(manifest.stories);
            } catch (error) {
              console.error('Error loading generated story:', error);
              setAppState('home');
            }
          }, 1000);
        }
      } catch (error) {
        console.error('Error polling progress:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [generationId, appState]);

  const handleGenerate = useCallback(async (query: string) => {
    setCurrentQuery(query);
    setGenerationStage(0);
    setGenerationLogs([]);
    setGenerationStatus('running');
    setAppState('generating');

    try {
      const result = await startGeneration(query);
      setGenerationId(result.generationId);
    } catch (error) {
      console.error('Error starting generation:', error);
      setAppState('home');
    }
  }, []);

  const handleSelectStory = useCallback(async (id: string) => {
    try {
      const story = await getStory(id);
      setCurrentStory(story);
      setAppState('reading');
    } catch (error) {
      console.error('Error loading story:', error);
    }
  }, []);

  const handleBack = useCallback(() => {
    setCurrentStory(null);
    setGenerationId(null);
    setAppState('home');
  }, []);

  return (
    <div className="app">
      {appState === 'home' && (
        <QueryInput
          stories={stories}
          onGenerate={handleGenerate}
          onSelectStory={handleSelectStory}
        />
      )}
      {appState === 'generating' && (
        <GeneratingView
          currentStage={generationStage}
          query={currentQuery}
          logs={generationLogs}
          status={generationStatus}
        />
      )}
      {appState === 'reading' && currentStory && (
        <StoryViewer story={currentStory} onBack={handleBack} />
      )}
    </div>
  );
}
