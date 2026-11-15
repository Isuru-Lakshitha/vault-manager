import React, { useState, useEffect } from 'react';

/**
 * Safely evaluate a simple arithmetic expression containing numbers and +, -, *, /
 * Returns null if invalid or incomplete.
 */
function evaluateMathExpression(expr) {
  if (!expr || typeof expr !== 'string') return null;
  const cleaned = expr.replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').trim();
  if (!cleaned) return 0;

  // Only allow digits, decimal points, spaces, and +, -, *, /
  if (!/^[\d.\s+\-*/]+$/.test(cleaned)) return null;

  // Strip trailing operator while user is still typing (e.g. "1250 + ")
  const trimmed = cleaned.replace(/[+\-*/\s]+$/, '');
  if (!trimmed) return 0;

  try {
    // Tokenize into numbers and operators
    const tokens = trimmed.match(/(\d+(?:\.\d+)?|\.\d+|[+\-*/])/g);
    if (!tokens || tokens.length === 0) return null;

    // Pass 1: handle * and /
    const stack = [];
    let i = 0;
    while (i < tokens.length) {
      const tok = tokens[i];
      if (tok === '*' || tok === '/') {
        const prev = parseFloat(stack.pop() || '0');
        const next = parseFloat(tokens[i + 1] || '1');
        if (tok === '/' && next === 0) return null;
        stack.push(tok === '*' ? prev * next : prev / next);
        i += 2;
      } else {
        stack.push(tok);
        i++;
      }
    }

    // Pass 2: handle + and -
    let total = parseFloat(stack[0]) || 0;
    let j = 1;
    while (j < stack.length) {
      const op = stack[j];
      const val = parseFloat(stack[j + 1]) || 0;
      if (op === '+') total += val;
      else if (op === '-') total -= val;
      j += 2;
    }

    if (!Number.isFinite(total)) return null;
    return Math.max(0, Math.round(total * 100) / 100);
  } catch {
    return null;
  }
}

const formatWithCommas = (numStr) => {
  if (!numStr && numStr !== 0) return '';
  const parts = String(numStr).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
};

const CurrencyInput = ({ value, onChange, style, ...props }) => {
  const [displayValue, setDisplayValue] = useState(() =>
    value == null || value === 0 ? '' : formatWithCommas(value)
  );
  const [focused, setFocused] = useState(false);

  const hasOperator = /[+\-*/×÷]/.test(displayValue);
  const evaluated = hasOperator ? evaluateMathExpression(displayValue) : null;

  useEffect(() => {
    if (!focused) setDisplayValue(value == null || value === 0 ? '' : formatWithCommas(value));
  }, [value, focused]);

  const handleChange = (e) => {
    const input = e.target.value;
    const raw = input.replace(/,/g, '');

    if (raw.trim() === '') {
      setDisplayValue('');
      onChange(0);
      return;
    }

    // Allow digits, decimals, spaces, and math operators (+, -, *, /, ×, ÷)
    if (!/^[\d.\s+\-*/×÷]*$/.test(raw)) return;

    if (/[+\-*/×÷]/.test(raw)) {
      setDisplayValue(input);
      const result = evaluateMathExpression(raw);
      if (result !== null) {
        onChange(result);
      }
      return;
    }

    // Standard single-number formatting
    if (!/^\d*\.?\d*$/.test(raw)) return;
    setDisplayValue(formatWithCommas(raw));
    onChange(parseFloat(raw) || 0);
  };

  const commitExpression = () => {
    if (/[+\-*/×÷]/.test(displayValue)) {
      const result = evaluateMathExpression(displayValue);
      if (result !== null) {
        setDisplayValue(formatWithCommas(result));
        onChange(result);
      }
    }
  };

  const appendOperator = (op) => {
    const trimmed = displayValue.trim();
    if (!trimmed) return;
    const next = /[+\-*/×÷]$/.test(trimmed)
      ? trimmed.slice(0, -1) + op
      : `${trimmed} ${op} `;
    setDisplayValue(next);
  };

  return (
    <div style={{ position: 'relative', width: style?.width || '100%' }}>
      <input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        placeholder="0.00 (or 1200 + 450)"
        value={displayValue}
        onChange={handleChange}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          commitExpression();
          props.onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hasOperator) {
            e.preventDefault();
            commitExpression();
          }
          props.onKeyDown?.(e);
        }}
        style={{
          ...style,
          paddingRight: hasOperator && evaluated !== null ? '4.8rem' : style?.paddingRight,
        }}
      />

      {/* Live Inline Math Preview Pill */}
      {hasOperator && evaluated !== null && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            commitExpression();
          }}
          title="Tap to apply calculated result"
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(74, 222, 128, 0.18)',
            border: '1px solid rgba(74, 222, 128, 0.45)',
            color: '#4ade80',
            borderRadius: 6,
            padding: '2px 6px',
            fontSize: '0.68rem',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          = {formatWithCommas(evaluated)}
        </button>
      )}

      {/* Quick Math Operator Strip when typing an expression */}
      {focused && hasOperator && (
        <div
          style={{
            display: 'flex',
            gap: '0.25rem',
            marginTop: '0.3rem',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', marginRight: 2 }}>
            Calc:
          </span>
          {['+', '-', '×', '÷'].map((op) => (
            <button
              key={op}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                appendOperator(op);
              }}
              style={{
                padding: '1px 8px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#cbd5e1',
                fontSize: '0.72rem',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                cursor: 'pointer',
                minHeight: 22,
              }}
            >
              {op}
            </button>
          ))}
          {hasOperator && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commitExpression();
              }}
              style={{
                padding: '1px 8px',
                borderRadius: 6,
                background: 'rgba(74, 222, 128, 0.2)',
                border: '1px solid rgba(74, 222, 128, 0.4)',
                color: '#4ade80',
                fontSize: '0.72rem',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 800,
                cursor: 'pointer',
                minHeight: 22,
              }}
            >
              =
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CurrencyInput;
