import { useRef } from 'react';

// Presentation-only disclosure: existing action handlers remain with their buttons.
export default function ToolMenu({ children, label = 'More tools' }) {
  const ref = useRef(null);
  return <details ref={ref} className="quiet-tools" onKeyDown={event => {
    if (event.key === 'Escape') { ref.current.open = false; ref.current.querySelector('summary')?.focus(); }
  }}>
    <summary>{label}</summary>
    <div className="quiet-tools-panel" onClick={event => {
      if (event.target.closest('button')) ref.current.open = false;
    }}>{children}</div>
  </details>;
}
