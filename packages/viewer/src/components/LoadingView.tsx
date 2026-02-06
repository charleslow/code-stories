export function LoadingView() {
  return (
    <div className="loading-view">
      <div className="loading-content">
        <div className="loading-spinner" />
        <h1>Loading story...</h1>
        <p className="loading-hint">Fetching story data</p>
      </div>
    </div>
  );
}
