import toast from 'react-hot-toast';
import { Check } from 'lucide-react';
import Modal from './Modal';
import { SUPPORTED_CURRENCIES, getCurrency } from '../utils/format';
import { getUserId, saveUserPrefs } from '../utils/api';
import { useT } from '../i18n';

export const CURRENCY_CHOSEN_KEY = 'vm_currency_chosen';

/** Base-currency picker (Get started step; also usable elsewhere). */
export default function CurrencyPickerModal({ isOpen, onClose, onChosen }) {
  const t = useT();
  const current = getCurrency();
  const choose = async (code) => {
    try {
      localStorage.setItem('vm_currency', code);
      localStorage.setItem(CURRENCY_CHOSEN_KEY, '1');
    } catch { /* private mode */ }
    const uid = await getUserId().catch(() => null);
    if (uid) saveUserPrefs(uid, { currency: code });
    window.dispatchEvent(new Event('vm:data-changed'));
    toast.success(code);
    onChosen?.(code);
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('cur.title')}>
      <p className="mclose-lead">{t('cur.desc')}</p>
      <div className="cur-grid">
        {SUPPORTED_CURRENCIES.map((c) => {
          const [code, name] = [c.code, c.label.split('—')[1]?.trim() || c.label];
          const active = code === current;
          return (
            <button key={code} type="button" className={`cur-option${active ? ' is-active' : ''}`} aria-pressed={active} onClick={() => choose(code)}>
              <strong>{code}</strong>
              <small>{name}</small>
              {active && <Check size={14} className="cur-check" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
