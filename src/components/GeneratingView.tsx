import { STAGES } from '../types';

interface GeneratingViewProps {
  currentStage: number;
  query: string;
}

export function GeneratingView({ currentStage, query }: GeneratingViewProps) {
  return (
    <div className="generating-view">
      <div className="generating-content">
        <h1>Generating your code story...</h1>
        <p className="query-preview">"{query}"</p>

        <div className="stages">
          {STAGES.map((stage, index) => {
            const stageNum = index + 1;
            const isComplete = currentStage > stageNum;
            const isCurrent = currentStage === stageNum;
            const isPending = currentStage < stageNum;

            return (
              <div
                key={stage.stage}
                className={`stage ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}`}
              >
                <span className="stage-indicator">
                  {isComplete ? '✓' : isCurrent ? '●' : '○'}
                </span>
                <span className="stage-label">
                  Stage {stageNum}: {stage.label}
                  {isCurrent && <span className="loading-dots">...</span>}
                </span>
              </div>
            );
          })}
        </div>

        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${(currentStage / 5) * 100}%` }}
          />
        </div>
        <p className="progress-text">{Math.round((currentStage / 5) * 100)}%</p>
      </div>
    </div>
  );
}
