/*
 * Page shell container. Each route mounts a fresh shell, which triggers the
 * CSS entrance in styles/motion.css (fade + staggered rise of the top-level
 * blocks). Pure CSS, no exit-blocking, so route switches stay instant.
 */
const PageWrapper = ({ children }) => (
  <div className="page-shell page-enter" style={{ minHeight: '100%' }}>
    {children}
  </div>
);

export default PageWrapper;
