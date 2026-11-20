// Friendly empty view: icon, one line of why, and the next action.
export default function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="ui-empty">
      {Icon && <span className="ui-empty-icon" aria-hidden="true"><Icon size={22} /></span>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
