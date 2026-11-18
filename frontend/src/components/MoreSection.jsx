/*
 * Collapsed-by-default section for secondary widgets (advisors, detectors,
 * simulators). Keeps each page focused on its essential numbers while every
 * feature stays one click away. Uses the shared .quiet-section styling and
 * the smooth disclosure animation from styles/motion.css.
 */
export default function MoreSection({ title = 'More insights', hint, defaultOpen = false, children }) {
  return (
    <details className="quiet-section settings-disclosure more-section" open={defaultOpen}>
      <summary>{title}{hint && <span>{hint}</span>}</summary>
      <div className="quiet-section-content more-section-body">{children}</div>
    </details>
  );
}
