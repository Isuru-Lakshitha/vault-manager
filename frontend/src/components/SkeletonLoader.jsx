/**
 * Theme-aware shimmer skeleton for cards and content blocks.
 * Usage: <SkeletonLoader rows={3} height={80} />
 * Styling and the shimmer keyframes live in styles/motion.css (.skeleton).
 */
const SkeletonLoader = ({ rows = 4, height = 72, gap = 12 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap }} aria-busy="true">
    {Array.from({ length: rows }).map((_, i) => (
      <span key={i} className="skeleton" style={{ height, animationDelay: `${i * 0.1}s` }} />
    ))}
  </div>
);

export default SkeletonLoader;
