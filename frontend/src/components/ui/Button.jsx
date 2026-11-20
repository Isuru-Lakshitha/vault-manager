/*
 * Standard button.
 *   <Button variant="primary" icon={Plus} onClick={…}>New budget</Button>
 * variant: primary | secondary | ghost | danger    size: md | sm
 * Colours come from theme tokens (contrast-checked in both themes).
 */
export default function Button({ variant = 'secondary', size = 'md', icon: Icon, loading = false, children, className = '', type = 'button', ...rest }) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ui-btn ui-btn-${size}${loading ? ' is-loading' : ''} ${className}`.trim()}
      disabled={loading || rest.disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 13 : 15} aria-hidden="true" />}
      {children !== undefined && <span>{children}</span>}
    </button>
  );
}
