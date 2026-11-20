import { useState, useRef } from 'react';
import { parseBankSMS, SAMPLE_BANK_SMS } from '../utils/smsParser';
import { predictCategory } from '../utils/autoCategorize';
import { formatCurrency, haptic } from '../utils/format';
import { Sparkles, Clipboard, Check, Mic, MicOff, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SMSParserBox({ accounts = [], onApply, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);

  const handleParse = (text, autoApply = false) => {
    const input = text !== undefined ? text : rawText;
    if (!input.trim()) {
      toast.error('Please paste a bank SMS or type a phrase');
      return;
    }

    const res = parseBankSMS(input, accounts);
    if (!res.success) {
      toast.error(res.error || 'Could not parse transaction details');
      setParsed(null);
      return;
    }

    // Auto-predict category from merchant/note or full text
    const catPrediction = predictCategory(res.merchant, res.type) || predictCategory(input, res.type);
    let category = '';
    if (catPrediction && catPrediction.category) {
      category = catPrediction.category.split(' ').slice(1).join(' ') || catPrediction.category;
    }

    const finalResult = {
      ...res,
      category: category || (res.type === 'Income' ? 'Salary' : 'Food')
    };

    setParsed(finalResult);
    haptic(15);

    if (autoApply && onApply) {
      onApply(finalResult);
      toast.success(
        `📲 Auto-filled: ${finalResult.merchant} · ${formatCurrency(finalResult.amount)}${finalResult.detectedBank ? ` (${finalResult.detectedBank})` : ''}`,
        { duration: 3500 }
      );
    } else {
      toast.success(`Found: ${finalResult.merchant} · ${formatCurrency(finalResult.amount)}`);
    }
  };

  const handleVoiceDictation = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsOpen(true);
      toast('Voice recognition is not supported on this browser. Type your phrase below!', { icon: '⌨️' });
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setListening(true);
        haptic(10);
        toast('🎙️ Listening... Say e.g. "Spent 3500 on dinner at Pizza Hut"', { id: 'voice-toast', duration: 4000 });
      };

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        setListening(false);
        if (transcript) {
          setRawText(transcript);
          setIsOpen(true);
          handleParse(transcript, true);
        }
      };

      recognition.onerror = () => {
        setListening(false);
        setIsOpen(true);
        toast.error('Could not hear clearly. Try typing below.');
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognition.start();
    } catch {
      setListening(false);
      setIsOpen(true);
    }
  };

  const handleClipboardRead = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        setIsOpen(true);
        setTimeout(() => textareaRef.current?.focus(), 60);
        toast('Paste your bank SMS in the box below — it will auto-fill immediately!', { icon: '📋' });
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text || text.trim().length < 4) {
        setIsOpen(true);
        setTimeout(() => textareaRef.current?.focus(), 60);
        toast('Paste your bank SMS or type a quick phrase below.', { icon: '📋' });
        return;
      }
      setRawText(text);
      // 1-Tap Instant Auto-Apply when clipboard has a valid SMS/phrase
      const probe = parseBankSMS(text, accounts);
      if (probe.success) {
        handleParse(text, true);
      } else {
        setIsOpen(true);
        setTimeout(() => textareaRef.current?.focus(), 60);
        toast('Paste a bank SMS alert below to auto-fill.', { icon: '📋' });
      }
    } catch {
  setIsOpen(true);
  setTimeout(() => textareaRef.current?.focus(), 60);
  toast('Tap & Paste your bank SMS below — it auto-fills on paste!', {
    icon: '📋'
  });
}
  };

  const handlePasteEvent = (e) => {
    const pasted = e.clipboardData?.getData('text');
    if (pasted && pasted.trim().length >= 4) {
      e.preventDefault();
      setRawText(pasted);
      handleParse(pasted, true);
    }
  };

  const handleApply = () => {
    if (!parsed) return;
    onApply(parsed);
    haptic();
    setIsOpen(false);
    setRawText('');
    setParsed(null);
  };

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {!isOpen ? (
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleClipboardRead}
            style={{
              flex: 1,
              minWidth: 165,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              padding: '0.58rem 0.75rem',
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(74,222,128,0.14) 0%, rgba(6,182,212,0.12) 100%)',
              border: '1px dashed rgba(74,222,128,0.45)',
              color: 'var(--mm-success)',
              fontSize: '0.76rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <Sparkles size={14} color="#4ade80" />
            <span>📲 1-Tap Paste Bank SMS</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              setTimeout(() => textareaRef.current?.focus(), 60);
            }}
            title="Open SMS / NLP Parser Box"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              padding: '0.58rem 0.75rem',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#c8c8d8',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <MessageSquare size={14} />
            <span>Type / Sample</span>
          </button>

          <button
            type="button"
            onClick={handleVoiceDictation}
            title="Speak transaction (e.g. 'Spent 3500 on dinner')"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              padding: '0.58rem 0.75rem',
              borderRadius: 10,
              background: listening ? 'rgba(248,113,113,0.2)' : 'rgba(129,140,248,0.12)',
              border: `1px solid ${listening ? '#f87171' : 'rgba(129,140,248,0.35)'}`,
              color: listening ? '#f87171' : '#818cf8',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              animation: listening ? 'pulse 1.2s infinite' : 'none'
            }}
          >
            {listening ? <MicOff size={14} /> : <Mic size={14} />}
            <span>{listening ? 'Listening…' : '🎙️ Voice'}</span>
          </button>
        </div>
      ) : (
        <div style={{
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(74,222,128,0.28)',
          borderRadius: 12,
          padding: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', fontWeight: 700, color: 'var(--mm-success)' }}>
              <Clipboard size={14} /> Instant Bank SMS & Phrase Parser
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem' }}
            >
              Close ✕
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            onPaste={handlePasteEvent}
            placeholder='Paste any bank SMS (ComBank, Sampath, HNB, BOC, NTB...) or type "Spent 3500 at Keells" — auto-fills on paste!'
            rows={2}
            style={{
              width: '100%',
              fontSize: '0.8rem',
              padding: '0.55rem',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-primary)',
              resize: 'none' }}
          />

          {/* Quick Sample SMS presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflowX: 'auto', paddingBottom: 2 }}>
            <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', flexShrink: 0 }}>
              Try sample:
            </span>
            {[
              { label: '🛒 ComBank Debit', sms: SAMPLE_BANK_SMS[0] },
              { label: '💰 Sampath Salary', sms: SAMPLE_BANK_SMS[1] },
              { label: '🍔 HNB UberEats', sms: SAMPLE_BANK_SMS[2] },
            ].map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setRawText(s.sms);
                  handleParse(s.sms, true);
                }}
                style={{
                  padding: '0.2rem 0.55rem',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.68rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleParse(rawText, true)}
              style={{
                flex: 1,
                padding: '0.48rem',
                borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(74,222,128,0.2), rgba(34,197,94,0.2))',
                border: '1px solid rgba(74,222,128,0.4)',
                color: 'var(--mm-success)',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ⚡ Parse & Auto-Fill Form
            </button>
            <button
              type="button"
              onClick={handleVoiceDictation}
              style={{
                padding: '0.45rem 0.7rem',
                borderRadius: 8,
                background: listening ? 'rgba(248,113,113,0.2)' : 'rgba(129,140,248,0.14)',
                border: `1px solid ${listening ? '#f87171' : 'rgba(129,140,248,0.3)'}`,
                color: listening ? '#f87171' : '#818cf8',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <Mic size={13} /> {listening ? 'Stop' : 'Speak'}
            </button>
            <button
              type="button"
              onClick={handleClipboardRead}
              style={{
                padding: '0.45rem 0.7rem',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Clipboard
            </button>
          </div>

          {parsed && (
            <div style={{
              background: 'rgba(74,222,128,0.08)',
              border: '1px solid rgba(74,222,128,0.25)',
              borderRadius: 8,
              padding: '0.65rem 0.8rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--mm-success)' }}>
                  {parsed.type === 'Expense' ? '💸' : '💰'} {formatCurrency(parsed.amount)}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#818cf8', fontWeight: 600 }}>
                  {parsed.category}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#c8c8d8' }}>
                <strong>Merchant / Note:</strong> {parsed.merchant}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span>Date: {parsed.date}</span>
                {parsed.detectedBank && <span>Bank: {parsed.detectedBank}</span>}
                {parsed.accountHint && <span>A/C: *{parsed.accountHint}</span>}
              </div>

              <button
                type="button"
                onClick={handleApply}
                style={{
                  marginTop: '0.25rem',
                  padding: '0.48rem',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                  border: 'none',
                  color: 'var(--bg-void)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem'
                }}
              >
                <Check size={14} strokeWidth={3} /> Done & Close Parser
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
