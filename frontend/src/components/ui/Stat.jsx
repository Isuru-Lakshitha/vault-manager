/*
 * Key-number cards.
 *   <StatGrid>
 *     <StatCard label="Total owed" value={fmt(x)} tone="neg" />
 *   </StatGrid>
 * tone: 'neutral' | 'accent' | 'pos' | 'neg' | 'warn' — mapped to theme
 * colours in CSS, so values read correctly in both dark and light mode.
 */
export function StatGrid({ children, className = '' }) {
  return <div className={`monthly-strip stat-grid ${className}`.trim()}>{children}</div>;
}

export function StatCard({ label, value, tone = 'neutral', sub, onClick, title }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`monthly-strip-item stat-card${onClick ? ' is-clickable' : ''}`}
      data-tone={tone}
      onClick={onClick}
      title={title}
      {...(onClick ? { type: 'button' } : {})}
    >
      <div className="monthly-strip-label">{label}</div>
      <div className="monthly-strip-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </Tag>
  );
}
