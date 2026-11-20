import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

const FuturisticDropdown = ({ options, value, onChange, placeholder = "Select option" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => typeof opt === 'object' ? opt.value === value : opt === value);
  const displayLabel = typeof selectedOption === 'object' ? selectedOption.label : (selectedOption || placeholder);

  return (
    <div className="futuristic-dropdown-container" ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          background: 'rgba(0, 0, 0, 0.3)',
          border: isOpen ? '1px solid var(--neon-cyan)' : '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
          fontSize: '0.95rem',
          cursor: 'pointer',
          boxShadow: isOpen ? '0 0 10px rgba(0, 255, 255, 0.2)' : 'none',
          transition: 'all 0.3s ease'
        }}
      >
        <span>{displayLabel}</span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
          <ChevronDown size={16} className={isOpen ? "text-cyan" : "text-muted"} />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -10, scaleY: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '0.5rem',
              background: 'rgba(10, 15, 30, 0.95)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--neon-cyan)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 10px 25px rgba(0, 255, 255, 0.15)',
              zIndex: 50,
              overflow: 'hidden',
              transformOrigin: 'top'
            }}
          >
            {options.map((opt, i) => {
              const optValue = typeof opt === 'object' ? opt.value : opt;
              const optLabel = typeof opt === 'object' ? opt.label : opt;
              const isSelected = optValue === value;
              
              return (
                <div
                  key={i}
                  onClick={() => {
                    onChange(optValue);
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isSelected ? 'rgba(0, 255, 255, 0.1)' : 'transparent',
                    color: isSelected ? 'var(--neon-cyan)' : 'var(--text-primary)',
                    transition: 'background 0.2s',
                    borderBottom: i < options.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span>{optLabel}</span>
                  {isSelected && <Check size={16} />}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FuturisticDropdown;
