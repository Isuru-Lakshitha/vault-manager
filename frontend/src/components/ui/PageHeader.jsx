/*
 * Standard page header: title, optional subtitle, optional actions.
 *   <PageHeader title="Bills" subtitle="Upcoming due dates…">
 *     <button className="btn btn-primary">Add bill</button>
 *   </PageHeader>
 * Layout, type scale and the mobile stacking come from .page-header CSS.
 */
export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div className="page-heading">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
