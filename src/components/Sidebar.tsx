import type { Chapter } from '../types';

interface SidebarProps {
  chapters: Chapter[];
  currentChapterIndex: number;
  onChapterSelect: (index: number) => void;
}

export function Sidebar({ chapters, currentChapterIndex, onChapterSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <h2>Chapters</h2>
      <nav>
        <ul>
          {chapters.map((chapter, index) => (
            <li key={chapter.id}>
              <button
                className={`sidebar-item ${index === currentChapterIndex ? 'active' : ''}`}
                onClick={() => onChapterSelect(index)}
              >
                <span className="indicator">
                  {index < currentChapterIndex ? '✓' : index === currentChapterIndex ? '●' : '○'}
                </span>
                <span className="label">{chapter.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
