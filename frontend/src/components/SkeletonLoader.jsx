/**
 * Shimmer skeleton loader for cards and content blocks.
 * Usage: <SkeletonLoader rows={3} height={80} />
 */
const SkeletonLoader = ({ rows = 4, height = 72, gap = 12 }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height,
            borderRadius: 12,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%)',
            backgroundSize: '200% 100%',
            animation: `shimmer 1.6s ease-in-out infinite`,
            animationDelay: `${i * 0.1}s`,
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        />
      ))}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  );
};

export default SkeletonLoader;
