import { useState, useEffect, useCallback } from 'react';
import type { Story, StoryMetadata, AppView } from '../types';
import { getStories, getStory, startGeneration, getGenerationProgress } from '../services/api';
import { QueryInput } from './QueryInput';
import { GeneratingView } from './GeneratingView';
import { StoryViewer } from './StoryViewer';

export function App() {
  const [view, setView] = useState<AppView>('home');
  const [stories, setStories] = useState<StoryMetadata[]>([]);
  const [currentStory, setCurrentStory] = useState<Story | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [generationStage, setGenerationStage] = useState(0);
  const [currentQuery, setCurrentQuery] = useState('');

  // Load stories on mount
  useEffect(() => {
    getStories().then((manifest) => {
      setStories(manifest.stories);
    });
  }, []);

  // Poll for generation progress
  useEffect(() => {
    if (!generationId || view !== 'generating') return;

    const pollInterval = setInterval(async () => {
      try {
        const progress = await getGenerationProgress(generationId);
        setGenerationStage(progress.stage);

        // Check if complete
        if (progress.stage >= 5) {
          clearInterval(pollInterval);
          // Wait a moment for the server to process the final story
          setTimeout(async () => {
            try {
              const story = await getStory(generationId);
              setCurrentStory(story);
              setView('viewing');
              // Refresh stories list
              const manifest = await getStories();
              setStories(manifest.stories);
            } catch (error) {
              console.error('Error loading generated story:', error);
              setView('home');
            }
          }, 1000);
        }
      } catch (error) {
        console.error('Error polling progress:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [generationId, view]);

  const handleGenerate = useCallback(async (query: string) => {
    setCurrentQuery(query);
    setGenerationStage(0);
    setView('generating');

    try {
      const result = await startGeneration(query);
      setGenerationId(result.generationId);
    } catch (error) {
      console.error('Error starting generation:', error);
      setView('home');
    }
  }, []);

  const handleSelectStory = useCallback(async (id: string) => {
    try {
      const story = await getStory(id);
      setCurrentStory(story);
      setView('viewing');
    } catch (error) {
      console.error('Error loading story:', error);
    }
  }, []);

  const handleBack = useCallback(() => {
    setCurrentStory(null);
    setGenerationId(null);
    setView('home');
  }, []);

  return (
    <div className="app">
      {view === 'home' && (
        <QueryInput
          stories={stories}
          onGenerate={handleGenerate}
          onSelectStory={handleSelectStory}
        />
      )}
      {view === 'generating' && (
        <GeneratingView currentStage={generationStage} query={currentQuery} />
      )}
      {view === 'viewing' && currentStory && (
        <StoryViewer story={currentStory} onBack={handleBack} />
      )}
    </div>
  );
}
