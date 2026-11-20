import { useId } from 'react';
import { motion } from 'framer-motion';
import { spring } from '../../motion/presets';

/*
 * Segmented control (glass track, sliding pill), used for view switches.
 *   <Segmented label="Budget view" value={view} onChange={setView}
 *     options={[{ value: 'list', label: 'Categories', count: 3 }, …]} />
 */
export default function Segmented({ options, value, onChange, label, size = 'md', className = '' }) {
  const pillId = useId();
  return (
    <div className={`ui-seg ui-seg-${size} ${className}`.trim()} role="tablist" aria-label={label}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => { if (!active) onChange(o.value); }}
          >
            {active && <motion.span layoutId={`seg-${pillId}`} className="ui-seg-pill" transition={spring.liquid} />}
            {Icon && <Icon size={14} aria-hidden="true" />}
            <span>{o.label}</span>
            {o.count !== undefined && <span className="ui-seg-count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
