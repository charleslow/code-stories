import { useState, useEffect, useCallback } from 'react';
import type { Story, AppState } from '../types';
import {
  getStoryUrlFromParams,
  fetchStory,
  addRecentStory,
  getRecentStories,
  type RecentStory
} from '../services/api';
import { LandingPage } from './LandingPage';
import { StoryViewer } from './StoryViewer';
import { LoadingView } from './LoadingView';

export function App() {
  const [appState, setAppState] = useState<AppState>('home');
  const [currentStory, setCurrentStory] = useState<Story | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentStories, setRecentStories] = useState<RecentStory[]>([]);

  // Load recent stories on mount
  useEffect(() => {
    setRecentStories(getRecentStories());
  }, []);

  // Check URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storyUrl = getStoryUrlFromParams(params);
    if (storyUrl) {
      loadStory(storyUrl);
    }
  }, []);

  const loadStory = useCallback(async (url: string) => {
    setAppState('loading');
    setError(null);
    setCurrentUrl(url);

    try {
      const story = await fetchStory(url);
      setCurrentStory(story);
      setAppState('reading');

      // Save to recent stories
      addRecentStory(url, story.title);
      setRecentStories(getRecentStories());

      // Update URL params without reload
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('url', url);
      window.history.pushState({}, '', newUrl.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load story');
      setAppState('error');
    }
  }, []);

  const handleBack = useCallback(() => {
    setCurrentStory(null);
    setCurrentUrl(null);
    setError(null);
    setAppState('home');

    // Clear URL params
    const newUrl = new URL(window.location.href);
    newUrl.search = '';
    window.history.pushState({}, '', newUrl.toString());
  }, []);

  const handleRetry = useCallback(() => {
    if (currentUrl) {
      loadStory(currentUrl);
    }
  }, [currentUrl, loadStory]);

  return (
    <div className="app">
      {appState === 'home' && (
        <LandingPage
          recentStories={recentStories}
          onLoadStory={loadStory}
        />
      )}
      {appState === 'loading' && (
        <LoadingView />
      )}
      {appState === 'error' && (
        <div className="error-view">
          <div className="error-content">
            <h1>Failed to Load Story</h1>
            <p className="error-message">{error}</p>
            <div className="error-actions">
              <button onClick={handleRetry} className="retry-button">
                Try Again
              </button>
              <button onClick={handleBack} className="back-button">
                Back to Home
              </button>
            </div>
          </div>
        </div>
      )}
      {appState === 'reading' && currentStory && (
        <StoryViewer story={currentStory} onBack={handleBack} />
      )}
    </div>
  );
}
