/*
 * Lightweight page shell container.
 * Renders immediately with zero exit-blocking or full-page GPU transform overhead
 * so route switches feel instantaneous across desktop and mobile.
 */
const PageWrapper = ({ children }) => (
  <div className="page-shell" style={{ minHeight: '100%' }}>
    {children}
  </div>
);

export default PageWrapper;
