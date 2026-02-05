import { useState, useEffect, useRef } from 'react';
import { STAGES } from '../types';

interface GeneratingViewProps {
  currentStage: number;
  query: string;
  logs: string[];
  status: 'running' | 'completed' | 'failed' | 'unknown';
}

export function GeneratingView({ currentStage, query, logs, status }: GeneratingViewProps) {
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom when new logs arrive
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

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

        {status === 'failed' && (
          <p className="status-error">Generation failed. Check logs for details.</p>
        )}

        <button
          className="toggle-logs-button"
          onClick={() => setShowLogs(!showLogs)}
        >
          {showLogs ? 'Hide Logs' : 'Show Logs'} ({logs.length})
        </button>

        {showLogs && (
          <div className="logs-container">
            {logs.length === 0 ? (
              <p className="logs-empty">No logs yet...</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="log-entry">{log}</div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
