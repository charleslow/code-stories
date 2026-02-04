import type { View } from '../types';
import { CodePanel } from './CodePanel';
import { ExplanationPanel } from './ExplanationPanel';

interface ViewDisplayProps {
  view: View;
  currentIndex: number;
  totalViews: number;
  onPrev: () => void;
  onNext: () => void;
}

export function ViewDisplay({ view, currentIndex, totalViews, onPrev, onNext }: ViewDisplayProps) {
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalViews - 1;

  return (
    <div className="view-display">
      <div className="view-content">
        <CodePanel snippets={view.snippets} />
        <ExplanationPanel explanation={view.explanation} />
      </div>
      <div className="view-navigation">
        <button
          className="nav-button prev"
          onClick={onPrev}
          disabled={isFirst}
        >
          ← Prev
        </button>
        <span className="view-counter">
          View {currentIndex + 1} of {totalViews}
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
