import type { View } from '../types';

interface SidebarProps {
  views: View[];
  currentViewIndex: number;
  onViewSelect: (index: number) => void;
}

export function Sidebar({ views, currentViewIndex, onViewSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <h2>Outline</h2>
      <nav>
        <ul>
          {views.map((view, index) => (
            <li key={view.id}>
              <button
                className={`sidebar-item ${index === currentViewIndex ? 'active' : ''}`}
                onClick={() => onViewSelect(index)}
              >
                <span className="indicator">
                  {index < currentViewIndex ? '✓' : index === currentViewIndex ? '●' : '○'}
                </span>
                <span className="label">{view.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
