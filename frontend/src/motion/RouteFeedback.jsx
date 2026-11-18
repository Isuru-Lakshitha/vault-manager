/*
 * Route-level loading feedback shown while a lazy page chunk resolves:
 * a thin accent progress bar plus a layout-shaped skeleton, so the content
 * area never flashes empty between pages.
 */
export const RouteProgress = () => <div className="route-progress" role="progressbar" aria-label="Loading page" />;

export const PageLoading = () => (
  <>
    <RouteProgress />
    <div className="page-loading page-shell" aria-busy="true" aria-live="polite">
      <div className="page-loading-head">
        <span className="skeleton" style={{ width: 'min(260px, 55%)', height: 30 }} />
        <span className="skeleton" style={{ width: 110, height: 36, borderRadius: 10 }} />
      </div>
      <div className="page-loading-grid">
        {[0, 1, 2, 3].map(i => (
          <span key={i} className="skeleton" style={{ height: 112, animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
      <span className="skeleton" style={{ height: 260 }} />
    </div>
  </>
);

export const AppSplash = ({ label = 'Loading your vault…', icon }) => (
  <div className="app-splash" role="status" aria-live="polite">
    <div className="app-splash-mark">{icon}</div>
    <div className="app-splash-bar" />
    <p>{label}</p>
  </div>
);
