import type { Chapter } from '../types';
import { CodePanel } from './CodePanel';
import { ExplanationPanel } from './ExplanationPanel';

interface ChapterDisplayProps {
  chapter: Chapter;
  currentIndex: number;
  totalChapters: number;
  onPrev: () => void;
  onNext: () => void;
}

export function ChapterDisplay({ chapter, currentIndex, totalChapters, onPrev, onNext }: ChapterDisplayProps) {
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalChapters - 1;

  return (
    <div className="chapter-display">
      <div className="chapter-content">
        <CodePanel snippets={chapter.snippets} />
        <ExplanationPanel explanation={chapter.explanation} />
      </div>
      <div className="chapter-navigation">
        <button
          className="nav-button prev"
          onClick={onPrev}
          disabled={isFirst}
        >
          ← Prev
        </button>
        <span className="chapter-counter">
          Chapter {currentIndex + 1} of {totalChapters}
        </span>
        <button
          className="nav-button next"
          onClick={onNext}
          disabled={isLast}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
