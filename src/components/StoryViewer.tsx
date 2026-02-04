import { useState, useEffect, useCallback } from 'react';
import type { Story } from '../types';
import { Sidebar } from './Sidebar';
import { ViewDisplay } from './ViewDisplay';

interface StoryViewerProps {
  story: Story;
  onBack: () => void;
}

export function StoryViewer({ story, onBack }: StoryViewerProps) {
  const [currentViewIndex, setCurrentViewIndex] = useState(0);

  const goToPrev = useCallback(() => {
    setCurrentViewIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentViewIndex((prev) => Math.min(story.views.length - 1, prev + 1));
  }, [story.views.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'h' || e.key === 'H') {
        goToPrev();
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        goToNext();
      } else if (e.key === 'Home') {
        setCurrentViewIndex(0);
      } else if (e.key === 'End') {
        setCurrentViewIndex(story.views.length - 1);
      } else if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index < story.views.length) {
          setCurrentViewIndex(index);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, story.views.length]);

  const currentView = story.views[currentViewIndex];

  return (
    <div className="story-viewer">
      <header className="story-header">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <h1>{story.title}</h1>
        <span className="commit-hash" title={story.commitHash}>
          {story.commitHash.slice(0, 7)}
        </span>
      </header>
      <div className="story-body">
        <Sidebar
          views={story.views}
          currentViewIndex={currentViewIndex}
          onViewSelect={setCurrentViewIndex}
        />
        <main className="story-main">
          <ViewDisplay
            view={currentView}
            currentIndex={currentViewIndex}
            totalViews={story.views.length}
            onPrev={goToPrev}
            onNext={goToNext}
          />
        </main>
      </div>
    </div>
  );
}
