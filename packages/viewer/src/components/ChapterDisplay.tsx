import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { Chapter } from '../types';
import { CodePanel } from './CodePanel';
import { ExplanationPanel } from './ExplanationPanel';

interface ChapterDisplayProps {
  chapter: Chapter;
  currentIndex: number;
  totalChapters: number;
  onPrev: () => void;
  onNext: () => void;
  storyQuery?: string;
  storyRepo?: string | null;
}

const MIN_PANEL_PERCENT = 30;
const MAX_PANEL_PERCENT = 70;

const mobileQuery = '(max-width: 768px)';

function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(mobileQuery);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(mobileQuery).matches,
  );
}

export function ChapterDisplay({ chapter, currentIndex, totalChapters, onPrev, onNext, storyQuery, storyRepo }: ChapterDisplayProps) {
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalChapters - 1;
  const isMobile = useIsMobile();

  const [activeTab, setActiveTab] = useState<'explanation' | 'code'>('explanation');
  const [codePanelPercent, setCodePanelPercent] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = (x / rect.width) * 100;

      const clamped = Math.min(MAX_PANEL_PERCENT, Math.max(MIN_PANEL_PERCENT, percent));
      setCodePanelPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="chapter-display">
      {isMobile && (
        <div className="mobile-tabs">
          <button
            className={`mobile-tab ${activeTab === 'explanation' ? 'active' : ''}`}
            onClick={() => setActiveTab('explanation')}
          >
            Explanation
          </button>
          <button
            className={`mobile-tab ${activeTab === 'code' ? 'active' : ''}`}
            onClick={() => setActiveTab('code')}
          >
            Code
          </button>
        </div>
      )}
      <div className="chapter-content" ref={containerRef}>
        {(!isMobile || activeTab === 'code') && (
          <CodePanel
            snippets={chapter.snippets}
            style={isMobile ? { flex: '1 1 100%' } : { flex: `0 0 ${codePanelPercent}%` }}
            storyQuery={storyQuery}
            storyRepo={storyRepo}
          />
        )}
        {!isMobile && (
          <div
            className={`splitter ${isDragging ? 'dragging' : ''}`}
            onMouseDown={handleMouseDown}
          >
            <div className="splitter-handle" />
          </div>
        )}
        {(!isMobile || activeTab === 'explanation') && (
          <ExplanationPanel
            explanation={chapter.explanation}
            style={isMobile ? { flex: '1 1 100%' } : { flex: `0 0 ${100 - codePanelPercent}%` }}
          />
        )}
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
