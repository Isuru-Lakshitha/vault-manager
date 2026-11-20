// Small status label. tone: neutral | accent | pos | neg | warn
export default function Badge({ tone = 'neutral', children, className = '', ...rest }) {
  return <span className={`ui-badge ${className}`.trim()} data-tone={tone} {...rest}>{children}</span>;
}
