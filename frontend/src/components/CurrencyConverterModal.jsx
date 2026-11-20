import { currencyRate } from '../utils/exchangeRates.js';
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, RefreshCw, X } from 'lucide-react';
import { fetchExchangeRates } from '../utils/api';
import { haptic } from '../utils/format';

const CURRENCY_METADATA = {
  LKR: { name: 'Sri Lankan Rupee', flag: '🇱🇰', symbol: 'Rs' },
  USD: { name: 'United States Dollar', flag: '🇺🇸', symbol: '$' },
  EUR: { name: 'Euro', flag: '🇪🇺', symbol: '€' },
  GBP: { name: 'British Pound', flag: '🇬🇧', symbol: '£' },
  AED: { name: 'UAE Dirham', flag: '🇦🇪', symbol: 'د.إ' },
  SGD: { name: 'Singapore Dollar', flag: '🇸🇬', symbol: 'S$' },
  INR: { name: 'Indian Rupee', flag: '🇮🇳', symbol: '₹' },
  AUD: { name: 'Australian Dollar', flag: '🇦🇺', symbol: 'A$' },
  CAD: { name: 'Canadian Dollar', flag: '🇨🇦', symbol: 'C$' },
  JPY: { name: 'Japanese Yen', flag: '🇯🇵', symbol: '¥' },
  CHF: { name: 'Swiss Franc', flag: '🇨🇭', symbol: 'CHF' },
  CNY: { name: 'Chinese Yuan', flag: '🇨🇳', symbol: '¥' },
  MYR: { name: 'Malaysian Ringgit', flag: '🇲🇾', symbol: 'RM' },
  NZD: { name: 'New Zealand Dollar', flag: '🇳🇿', symbol: 'NZ$' },
  THB: { name: 'Thai Baht', flag: '🇹🇭', symbol: '฿' },
  BRL: { name: 'Brazilian Real', flag: '🇧🇷', symbol: 'R$' },
  ZAR: { name: 'South African Rand', flag: '🇿🇦', symbol: 'R' },
  KRW: { name: 'South Korean Won', flag: '🇰🇷', symbol: '₩' },
  SEK: { name: 'Swedish Krona', flag: '🇸🇪', symbol: 'kr' },
  NOK: { name: 'Norwegian Krone', flag: '🇳🇴', symbol: 'kr' },
  DKK: { name: 'Danish Krone', flag: '🇩🇰', symbol: 'kr' },
  PLN: { name: 'Polish Zloty', flag: '🇵🇱', symbol: 'zł' },
  TRY: { name: 'Turkish Lira', flag: '🇹🇷', symbol: '₺' },
  HKD: { name: 'Hong Kong Dollar', flag: '🇭🇰', symbol: 'HK$' },
  IDR: { name: 'Indonesian Rupiah', flag: '🇮🇩', symbol: 'Rp' },
  MXN: { name: 'Mexican Peso', flag: '🇲🇽', symbol: 'Mex$' },
  PHP: { name: 'Philippine Peso', flag: '🇵🇭', symbol: '₱' },
  CZK: { name: 'Czech Koruna', flag: '🇨🇿', symbol: 'Kč' },
  HUF: { name: 'Hungarian Forint', flag: '🇭🇺', symbol: 'Ft' },
  ILS: { name: 'Israeli Shekel', flag: '🇮🇱', symbol: '₪' }
};

const POPULAR_PAIRS = [
  ['USD', 'LKR'],
  ['EUR', 'LKR'],
  ['GBP', 'LKR'],
  ['AED', 'LKR'],
  ['SGD', 'LKR'],
  ['USD', 'EUR'],
  ['AUD', 'LKR']
];

export default function CurrencyConverterModal({ isOpen, onClose }) {
  const [rates, setRates] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fromCur, setFromCur] = useState('USD');
  const [toCur, setToCur] = useState(() => localStorage.getItem('vm_currency') || 'LKR');
  const [fromAmt, setFromAmt] = useState('100');
  const [activeInput, setActiveInput] = useState('from'); // 'from' or 'to'
  const [toAmt, setToAmt] = useState('');

  const loadRates = async () => {
    try {
      setLoading(true);
      const r = await fetchExchangeRates();
      setRates(r);
    } catch {
      setRates(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRates();
    }
  }, [isOpen]);

  // Conversion rate computation
  const exchangeRate = useMemo(() => {
    return currencyRate(fromCur, toCur, rates);
  }, [rates, fromCur, toCur]);

  const inverseRate = useMemo(() => {
    return exchangeRate > 0 ? 1 / exchangeRate : 0;
  }, [exchangeRate]);

  // Sync conversions
  useEffect(() => {
    if (activeInput === 'from') {
      const val = parseFloat(fromAmt);
      if (isNaN(val) || val <= 0 || !Number.isFinite(exchangeRate)) {
        setToAmt('');
      } else {
        const calculated = val * exchangeRate;
        setToAmt(calculated >= 100 ? calculated.toFixed(2) : calculated.toFixed(4));
      }
    }
  }, [fromAmt, exchangeRate, activeInput]);

  const handleFromChange = (val) => {
    setActiveInput('from');
    setFromAmt(val);
  };

  const handleToChange = (val) => {
    setActiveInput('to');
    setToAmt(val);
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0 || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      setFromAmt('');
    } else {
      const calculated = num / exchangeRate;
      setFromAmt(calculated >= 100 ? calculated.toFixed(2) : calculated.toFixed(4));
    }
  };

  const swapCurrencies = () => {
    haptic();
    const prevFrom = fromCur;
    const prevTo = toCur;
    setFromCur(prevTo);
    setToCur(prevFrom);
    setActiveInput('from');
  };

  const applyPair = (f, t) => {
    haptic();
    setFromCur(f);
    setToCur(t);
    setActiveInput('from');
  };

  const applyQuickPill = (amount) => {
    haptic();
    setActiveInput('from');
    setFromAmt(String(amount));
  };

  if (!isOpen) return null;

  const availableCurrencies = Object.keys(CURRENCY_METADATA);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 22,
          padding: '1.75rem',
          width: '100%',
          maxWidth: 480,
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 40px rgba(56,189,248,0.1)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(74, 222, 128, 0.2))',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem'
              }}
            >
              💱
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                Currency Hub
              </h2>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{rates ? `Frankfurter reference rates · ${rates._date}` : 'Rates unavailable · reconnect and refresh'}</span>
                {loading && <RefreshCw size={10} className="animate-spin text-cyan" />}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Quick Pair Chips */}
        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.75rem', marginBottom: '1rem', scrollbarWidth: 'none' }}>
          {POPULAR_PAIRS.map(([f, t]) => {
            const isSelected = fromCur === f && toCur === t;
            return (
              <button
                key={`${f}-${t}`}
                type="button"
                onClick={() => applyPair(f, t)}
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: 20,
                  border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.06)',
                  background: isSelected ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.03)',
                  color: isSelected ? '#38bdf8' : 'var(--text-secondary)',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {CURRENCY_METADATA[f]?.flag} {f} / {CURRENCY_METADATA[t]?.flag} {t}
              </button>
            );
          })}
        </div>

        {/* Interactive Converter Box */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative' }}>
          {/* FROM CARD */}
          <div
            style={{
              background: 'rgba(0,0,0,0.25)',
              borderRadius: 14,
              border: activeInput === 'from' ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
              padding: '1rem',
              transition: 'border-color 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span>You send</span>
              <span>{CURRENCY_METADATA[fromCur]?.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <select
                value={fromCur}
                onChange={(e) => setFromCur(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  color: 'var(--text-primary)',
                  padding: '0.5rem 0.6rem',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                {availableCurrencies.map((c) => (
                  <option key={c} value={c} style={{ background: 'var(--bg-void)', color: 'var(--text-primary)' }}>
                    {CURRENCY_METADATA[c]?.flag} {c}
                  </option>
                ))}
              </select>

              <input
                type="number"
                value={fromAmt}
                onChange={(e) => handleFromChange(e.target.value)}
                placeholder="0.00"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  textAlign: 'right',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* SWAP BUTTON (Floats between cards) */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '-0.75rem 0', zIndex: 10 }}>
            <motion.button
              type="button"
              whileHover={{ scale: 1.1, rotate: 180 }}
              whileTap={{ scale: 0.95 }}
              onClick={swapCurrencies}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
                border: '3px solid #1a1a2e',
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(56,189,248,0.35)'
              }}
            >
              <ArrowUpDown size={16} strokeWidth={2.5} />
            </motion.button>
          </div>

          {/* TO CARD */}
          <div
            style={{
              background: 'rgba(0,0,0,0.25)',
              borderRadius: 14,
              border: activeInput === 'to' ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.08)',
              padding: '1rem',
              transition: 'border-color 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span>You receive</span>
              <span>{CURRENCY_METADATA[toCur]?.name}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <select
                value={toCur}
                onChange={(e) => setToCur(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  color: 'var(--text-primary)',
                  padding: '0.5rem 0.6rem',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                {availableCurrencies.map((c) => (
                  <option key={c} value={c} style={{ background: 'var(--bg-void)', color: 'var(--text-primary)' }}>
                    {CURRENCY_METADATA[c]?.flag} {c}
                  </option>
                ))}
              </select>

              <input
                type="number"
                value={toAmt}
                onChange={(e) => handleToChange(e.target.value)}
                placeholder="0.00"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: 'var(--mm-success)',
                  textAlign: 'right',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>

        {/* Quick Amount Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          {[10, 50, 100, 500, 1000].map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => applyQuickPill(amt)}
              style={{
                flex: 1,
                padding: '0.4rem 0',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-secondary)',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {CURRENCY_METADATA[fromCur]?.symbol || ''}{amt}
            </button>
          ))}
        </div>

        {/* Live Mid-Market Exchange Rate Badge */}
        <div
          style={{
            marginTop: '1.25rem',
            padding: '0.75rem 1rem',
            borderRadius: 10,
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>
              1 {fromCur} = {!Number.isFinite(exchangeRate) ? 'Unavailable' : exchangeRate >= 100 ? exchangeRate.toFixed(2) : exchangeRate.toFixed(4)} {toCur}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>
              1 {toCur} = {inverseRate >= 100 ? inverseRate.toFixed(2) : inverseRate.toFixed(4)} {fromCur}
            </span>
          </div>
          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
            Mid-market rate with 0% markup. No hidden conversion fees.
          </div>
        </div>
      </motion.div>
    </div>
  );
}
