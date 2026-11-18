/*
 * Raised surface with an optional header row.
 *   <Card title="Upcoming bills" action={<button…/>}>…</Card>
 * Gets depth, tilt and the light from styles/depth.css via .ui-card.
 */
export default function Card({ title, action, children, className = '', as: Tag = 'section', ...rest }) {
  return (
    <Tag className={`ui-card ${className}`.trim()} {...rest}>
      {(title || action) && (
        <header className="ui-card-head">
          {title && <h3>{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </Tag>
  );
}
