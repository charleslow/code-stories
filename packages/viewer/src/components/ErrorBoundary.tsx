import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-view">
          <div className="error-content">
            <h1>Something went wrong</h1>
            <p className="error-message">{this.state.error?.message}</p>
            <div className="error-actions">
              <button onClick={() => window.location.reload()} className="retry-button">
                Reload
              </button>
              <button onClick={() => { window.location.search = ''; }} className="back-button">
                Back to Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
