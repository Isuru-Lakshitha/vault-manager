import { motion } from 'framer-motion';

const HealthScoreGauge = ({ score = 0, breakdown = {} }) => {
  const clamp = Math.max(0, Math.min(100, Math.round(score)));
  const color = clamp >= 70 ? '#4ade80' : clamp >= 40 ? '#fbbf24' : '#f87171';
  const label = clamp >= 70 ? 'HEALTHY' : clamp >= 40 ? 'MODERATE' : 'AT RISK';

  // SVG arc params
  const r = 54;
  const circ = Math.PI * r; // half circle
  const offset = circ - (clamp / 100) * circ;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
      <div style={{ position: 'relative', width: 140, height: 80 }}>
        <svg width="140" height="80" viewBox="0 0 140 80">
          {/* Track */}
          <path d="M 10 75 A 60 60 0 0 1 130 75" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" strokeLinecap="round" />
          {/* Fill */}
          <motion.path
            d="M 10 75 A 60 60 0 0 1 130 75"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />
          {/* Score text */}
          <text x="70" y="70" textAnchor="middle" fill={color} fontSize="24" fontFamily="Outfit, sans-serif" fontWeight="700">{clamp}</text>
        </svg>
      </div>
      <div style={{ fontSize: '0.72rem', letterSpacing: '2px', color, fontWeight: 700 }}>{label}</div>
      {Object.keys(breakdown).length > 0 && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
          {Object.entries(breakdown).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
              <span style={{ color: 'var(--mm-text-3)' }}>{key}</span>
              <span style={{ color: val >= 7 ? 'var(--mm-success)' : val >= 4 ? 'var(--mm-warning)' : 'var(--mm-danger)', fontWeight: 600 }}>{val}/10</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HealthScoreGauge;