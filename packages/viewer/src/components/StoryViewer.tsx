import { useState, useEffect, useCallback } from 'react';
import type { Story } from '../types';
import type { DisplayMode } from './App';
import { Sidebar } from './Sidebar';
import { ChapterDisplay } from './ChapterDisplay';

interface StoryViewerProps {
  story: Story;
  onBack: () => void;
  chatAvailable?: boolean;
  chatModel?: string | null;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
}

export function StoryViewer({ story, onBack, chatAvailable, chatModel, displayMode, onDisplayModeChange }: StoryViewerProps) {
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const nextDisplayMode = displayMode === 'eink' ? 'normal' : 'eink';

  const goToPrev = useCallback(() => {
    setCurrentChapterIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentChapterIndex((prev) => Math.min(story.chapters.length - 1, prev + 1));
  }, [story.chapters.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'h' || e.key === 'H') {
        goToPrev();
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        goToNext();
      } else if (e.key === 'Home') {
        setCurrentChapterIndex(0);
      } else if (e.key === 'End') {
        setCurrentChapterIndex(story.chapters.length - 1);
      } else if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index < story.chapters.length) {
          setCurrentChapterIndex(index);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, story.chapters.length]);

  const currentChapter = story.chapters[currentChapterIndex];

  return (
    <div className="story-viewer">
      <header className="story-header">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <button
          className="display-mode-toggle"
          onClick={() => onDisplayModeChange(nextDisplayMode)}
          aria-pressed={displayMode === 'eink'}
          title={displayMode === 'eink' ? 'Switch to normal mode' : 'Switch to e-ink mode'}
        >
          {displayMode === 'eink' ? 'Normal' : 'E-ink'}
        </button>
        <h1>{story.title}</h1>
        {story.pr && (
          <a className="pr-badge-link" href={story.pr.url} target="_blank" rel="noopener noreferrer">
            PR #{story.pr.number}
          </a>
        )}
        <span className="commit-hash" title={story.repo ? `${story.repo} @ ${story.commitHash}` : story.commitHash}>
          {story.repo ? `${story.repo} @ ` : ''}{story.commitHash.slice(0, 7)}
        </span>
      </header>
      <div className="story-body">
        <Sidebar
          chapters={story.chapters}
          currentChapterIndex={currentChapterIndex}
          onChapterSelect={setCurrentChapterIndex}
        />
        <main className="story-main">
          <ChapterDisplay
            chapter={currentChapter}
            currentIndex={currentChapterIndex}
            totalChapters={story.chapters.length}
            onPrev={goToPrev}
            onNext={goToNext}
            storyQuery={story.query}
            storyRepo={story.repo}
            storyPR={story.pr}
            chatAvailable={chatAvailable}
            chatModel={chatModel}
            storyId={story.id}
            displayMode={displayMode}
          />
        </main>
      </div>
    </div>
  );
}
