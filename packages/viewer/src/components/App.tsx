import { useState, useEffect, useCallback } from 'react';
import type { Story, AppState } from '../types';
import {
  getStoryUrlFromParams,
  fetchStory,
  addRecentStory,
  getRecentStories,
  checkChatAvailable,
  type RecentStory
} from '../services/api';
import { LandingPage } from './LandingPage';
import { StoryViewer } from './StoryViewer';
import { LoadingView } from './LoadingView';
import { ErrorBoundary } from './ErrorBoundary';

const DISPLAY_MODE_STORAGE_KEY = 'code-stories-display-mode';

type DisplayMode = 'normal' | 'eink';

function getInitialDisplayMode(): DisplayMode {
  try {
    return window.localStorage.getItem(DISPLAY_MODE_STORAGE_KEY) === 'eink' ? 'eink' : 'normal';
  } catch {
    return 'normal';
  }
}

function saveDisplayMode(displayMode: DisplayMode): void {
  try {
    window.localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, displayMode);
  } catch {
    // Ignore localStorage errors
  }
}

export function App() {
  const [appState, setAppState] = useState<AppState>('home');
  const [currentStory, setCurrentStory] = useState<Story | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentStories, setRecentStories] = useState<RecentStory[]>(getRecentStories);
  const [chatAvailable, setChatAvailable] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(getInitialDisplayMode);

  useEffect(() => {
    document.documentElement.dataset.displayMode = displayMode;
    saveDisplayMode(displayMode);
  }, [displayMode]);

  // Check chat availability on mount
  useEffect(() => {
    checkChatAvailable().then(setChatAvailable);
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

  // Check URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storyUrl = getStoryUrlFromParams(params);
    if (storyUrl) {
      queueMicrotask(() => {
        void loadStory(storyUrl);
      });
    }
  }, [loadStory]);

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
        <ErrorBoundary>
          <StoryViewer
            story={currentStory}
            onBack={handleBack}
            chatAvailable={chatAvailable}
            displayMode={displayMode}
            onDisplayModeChange={setDisplayMode}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}

export type { DisplayMode };
