import { toYMD, todayYMD } from './dates.js';
/**
 * Smart Bank SMS & Push Notification Parser
 * Intelligently extracts Amount, Type (Debit/Credit), Merchant, Date,
 * Bank Name, and Account/Card hints from Sri Lankan & global bank SMS alerts.
 */

// Currency before or after amount (e.g., "LKR 4,500.00", "Rs.1,250/-", "4,500.00 LKR", "$24.99")
const CURRENCY_PREFIX_REGEX = /(?:LKR|Rs\.?|SLR|USD|\$|EUR|€|GBP|£|AED|SGD|INR|₹|AUD|CAD)\s*([\d,]+(?:\.\d{1,2})?)(?:\/-)?/i;
const CURRENCY_SUFFIX_REGEX = /([\d,]+(?:\.\d{1,2})?)\s*(?:LKR|Rs\.?|SLR|USD|EUR|GBP|AED|SGD|INR|AUD|CAD)\b/i;
const AMOUNT_FALLBACK_REGEX = /\b([\d,]+\.\d{2})\b/;

// Known Sri Lankan & International Bank aliases for smart account matching
const BANK_ALIASES = [
  { keywords: ['combank', 'commercial bank', 'com bank', 'flash'], label: 'Commercial Bank', matchTokens: ['commercial', 'combank', 'flash'] },
  { keywords: ['sampath', 'vishwa', 'wePay'], label: 'Sampath Bank', matchTokens: ['sampath', 'vishwa'] },
  { keywords: ['hnb', 'hatton national', 'solo'], label: 'HNB', matchTokens: ['hnb', 'hatton'] },
  { keywords: ['boc', 'bank of ceylon', 'b app'], label: 'BOC', matchTokens: ['boc', 'ceylon'] },
  { keywords: ['peoples bank', "people's bank", 'people wave'], label: "People's Bank", matchTokens: ['people', 'peoples'] },
  { keywords: ['ntb', 'nations trust', 'frimi', 'amex'], label: 'Nations Trust / FriMi', matchTokens: ['ntb', 'nations', 'frimi', 'amex'] },
  { keywords: ['seylan'], label: 'Seylan Bank', matchTokens: ['seylan'] },
  { keywords: ['dfcc'], label: 'DFCC Bank', matchTokens: ['dfcc'] },
  { keywords: ['ndb', 'neao'], label: 'NDB Bank', matchTokens: ['ndb'] },
  { keywords: ['pan asia', 'pabc'], label: 'Pan Asia Bank', matchTokens: ['pan asia', 'pabc'] },
  { keywords: ['hsbc'], label: 'HSBC', matchTokens: ['hsbc'] },
  { keywords: ['standard chartered', 'scb'], label: 'Standard Chartered', matchTokens: ['standard chartered', 'scb'] },
  { keywords: ['cargills bank'], label: 'Cargills Bank', matchTokens: ['cargills'] },
  { keywords: ['genie', 'dialog finance'], label: 'Dialog Genie', matchTokens: ['genie', 'dialog'] },
  { keywords: ['helapay', 'hela pay'], label: 'HelaPay', matchTokens: ['helapay', 'hela'] },
];

// Debit vs Credit detection keywords
const DEBIT_KEYWORDS = [
  'debited', 'debit', 'spent', 'paid', 'purchase', 'purchased', 'withdrawn', 'withdrawal',
  'sent', 'charged', 'pos transaction', 'pos txn', 'transfer to', 'transferred to',
  'bill payment', 'payment of', 'atm withdrawal', 'deducted', 'used for', 'lankaqr'
];

const CREDIT_KEYWORDS = [
  'credited', 'credit', 'received', 'deposited', 'refund', 'refunded', 'reversal', 'added',
  'salary', 'transfer from', 'transferred from', 'cash back', 'cashback', 'inward remittance',
  'ceft credit', 'slips credit', 'interest credited', 'dividend', 'earned', 'got paid', 'income', 'bonus'
];

const SPOKEN_SMALL = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

const SPOKEN_SCALES = {
  hundred: 100,
  thousand: 1000,
  lakh: 100000,
  lakhs: 100000,
  million: 1000000
};

/**
 * Convert spoken number sequences (e.g. "two thousand five hundred", "15 hundred") into digits
 */
export function normalizeSpokenNumbers(input) {
  if (!input || typeof input !== 'string') return '';
  // First handle "<digits> thousand/hundred/lakh" e.g. "2 thousand 500" or "3.5 thousand"
  let text = input.replace(/\b(\d+(?:\.\d+)?)\s+(thousand|hundred|lakh|lakhs|million)\b/gi, (_, num, scale) => {
    const mult = SPOKEN_SCALES[scale.toLowerCase()] || 1;
    return String(Math.round(parseFloat(num) * mult));
  });

  const tokens = text.split(/(\s+)/);
  let out = [];
  let currentTotal = 0;
  let currentChunk = 0;
  let inNumber = false;

  const flushNumber = () => {
    if (inNumber) {
      const val = currentTotal + currentChunk;
      if (val > 0) out.push(String(val));
      currentTotal = 0;
      currentChunk = 0;
      inNumber = false;
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (/^\s+$/.test(tok)) {
      if (!inNumber) out.push(tok);
      continue;
    }
    const clean = tok.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean === 'and' && inNumber) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(SPOKEN_SMALL, clean)) {
      currentChunk += SPOKEN_SMALL[clean];
      inNumber = true;
    } else if (Object.prototype.hasOwnProperty.call(SPOKEN_SCALES, clean)) {
      const mult = SPOKEN_SCALES[clean];
      if (!inNumber) currentChunk = 1;
      if (mult === 100) {
        currentChunk = (currentChunk || 1) * 100;
      } else {
        currentTotal += (currentChunk || 1) * mult;
        currentChunk = 0;
      }
      inNumber = true;
    } else if (inNumber && /^\d+$/.test(clean)) {
      currentChunk += parseInt(clean, 10);
    } else {
      if (inNumber) {
        flushNumber();
        out.push(' ');
      }
      out.push(tok);
    }
  }
  flushNumber();
  return out.join('').replace(/\s+/g, ' ').trim();
}

/**
 * Clean up extracted merchant string
 */
function cleanMerchant(str) {
  if (!str) return '';
  let m = str.trim();
  m = m.replace(/^(at|to|for|from|via|in|by)\s+/i, '');
  m = m.replace(/\s+(on|at|ref|txn|via|with|using|available|avail|avl|bal|balance|card|a\/c|acct|ending|dated|dt)\b.*$/i, '');
  m = m.replace(/[.,;:*#/-]+$/, '');
  m = m.replace(/\s+/g, ' ').trim();
  if (m === m.toUpperCase() && m.length > 3) {
    m = m.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  return m;
}

/**
 * Parse an SMS, voice dictation transcript, or clipboard message
 * @param {string} text - Raw SMS or spoken string
 * @param {Array} accounts - Optional list of user accounts to auto-match
 * @returns {object} Extracted transaction details
 */
export function parseBankSMS(text, accounts = []) {
  if (!text || typeof text !== 'string') {
    return { success: false, error: 'Empty message text' };
  }

  const normalizedText = normalizeSpokenNumbers(text);
  const cleanText = normalizedText.replace(/[\r\n]+/g, ' ').trim();
  const lower = cleanText.toLowerCase();

  // 1. Detect Type (Expense vs Income)
  let type = 'Expense';
  let isCredit = false;
  let isDebit = false;

  for (const kw of CREDIT_KEYWORDS) {
    if (lower.includes(kw)) {
      isCredit = true;
      break;
    }
  }

  for (const kw of DEBIT_KEYWORDS) {
    if (lower.includes(kw)) {
      isDebit = true;
      break;
    }
  }

  // Handle "credited to merchant" vs "debited from your A/C"
  if (lower.includes('debited') || lower.includes('purchase') || lower.includes('spent') || lower.includes('withdrawn')) {
    type = 'Expense';
  } else if (isCredit && !isDebit) {
    type = 'Income';
  } else {
    type = 'Expense';
  }

  // 2. Extract Amount & Currency
  // Strip out "Avl Bal LKR 12,345.00" or "Available Balance Rs. 50,000" before matching transaction amount
  const textWithoutAvailBal = cleanText.replace(
    /(?:avail(?:able)?|avl|curr(?:ent)?|new|rem(?:aining)?)\s*(?:bal(?:ance)?|limit)\s*[:=-]?\s*(?:LKR|Rs\.?|SLR|USD|\$|EUR|GBP)?\s*[\d,]+(?:\.\d{1,2})?/gi,
    ''
  );

  let amount = 0;
  let currency = '';

  const prefixMatch = textWithoutAvailBal.match(CURRENCY_PREFIX_REGEX) || cleanText.match(CURRENCY_PREFIX_REGEX);
  const suffixMatch = !prefixMatch ? (textWithoutAvailBal.match(CURRENCY_SUFFIX_REGEX) || cleanText.match(CURRENCY_SUFFIX_REGEX)) : null;

  if (prefixMatch) {
    const numStr = prefixMatch[1].replace(/,/g, '');
    amount = parseFloat(numStr) || 0;
    currency = prefixMatch[0].replace(prefixMatch[1], '').replace(/\/-$/, '').trim();
  } else if (suffixMatch) {
    const numStr = suffixMatch[1].replace(/,/g, '');
    amount = parseFloat(numStr) || 0;
    currency = suffixMatch[0].replace(suffixMatch[1], '').trim();
  } else {
    const numMatch = textWithoutAvailBal.match(AMOUNT_FALLBACK_REGEX);
    if (numMatch) {
      amount = parseFloat(numMatch[1].replace(/,/g, '')) || 0;
    } else {
      const kMatch = textWithoutAvailBal.match(/\b(\d+(?:\.\d+)?)\s*k\b/i);
      if (kMatch) {
        amount = parseFloat(kMatch[1]) * 1000;
      } else {
        const allNums = [...textWithoutAvailBal.matchAll(/\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?)\b/g)]
          .map(m => parseFloat(m[1].replace(/,/g, '')))
          .filter(n => n > 0 && !(n >= 2020 && n <= 2035 && Number.isInteger(n)));
        if (allNums.length > 0) {
          amount = allNums[0];
        }
      }
    }
  }

  if (!amount || amount <= 0) {
    return { success: false, error: 'Could not find an amount. Example: "LKR 4,500 debited at Keells Super"' };
  }

  // 3. Extract Merchant / Payee / Note
  let merchant = '';

  const atMatch = cleanText.match(/\bat\s+([A-Za-z0-9\s&'._/-]{2,42}?)(?:\s+(?:on|ref|txn|via|dt|dated|with|avail|avl|bal|available|for|card|a\/c|\.|,|\d{1,2}[:/-]))/i)
    || cleanText.match(/\bat\s+([A-Za-z0-9\s&'._-]{2,36})$/i);
  const toMatch = cleanText.match(/\b(?:to|towards)\s+([A-Za-z0-9\s&'._-]{2,40}?)(?:\s+(?:on|ref|txn|via|dt|with|avail|avl|bal|available|\.|,|\d{1,2}[:/-]))/i);
  const fromMatch = type === 'Income'
    ? cleanText.match(/\bfrom\s+([A-Za-z0-9\s&'._-]{2,40}?)(?:\s+(?:on|ref|txn|via|dt|to|into|avail|avl|bal|\.|,|$))/i)
    : null;
  const remMatch = cleanText.match(/(?:remarks|info|narration|desc|details|merchant|location)\s*[:-]\s*([A-Za-z0-9\s&'._-]{2,38})/i);
  const nlMatch = cleanText.match(/\b(?:on|for)\s+([A-Za-z0-9\s&'-]{2,45}?)(?:\s+(?:today|yesterday|from|into|via|using|with)\b|$)/i);

  if (remMatch && remMatch[1]) {
    merchant = cleanMerchant(remMatch[1]);
  } else if (atMatch && atMatch[1]) {
    merchant = cleanMerchant(atMatch[1]);
  } else if (fromMatch && fromMatch[1]) {
    merchant = cleanMerchant(fromMatch[1]);
  } else if (toMatch && toMatch[1]) {
    merchant = cleanMerchant(toMatch[1]);
  } else if (nlMatch && nlMatch[1]) {
    merchant = cleanMerchant(nlMatch[1]);
  }

  if (!merchant) {
    if (lower.includes('keells')) merchant = 'Keells Super';
    else if (lower.includes('cargills')) merchant = 'Cargills Food City';
    else if (lower.includes('glomark')) merchant = 'Glomark Supermarket';
    else if (lower.includes('arpico')) merchant = 'Arpico Supercentre';
    else if (lower.includes('spar')) merchant = 'SPAR Supermarket';
    else if (lower.includes('uber eats')) merchant = 'Uber Eats';
    else if (lower.includes('uber')) merchant = 'Uber';
    else if (lower.includes('pickme food')) merchant = 'PickMe Food';
    else if (lower.includes('pickme')) merchant = 'PickMe';
    else if (lower.includes('ceypetco') || lower.includes('fuel') || lower.includes('lioc')) merchant = 'Fuel Station';
    else if (lower.includes('sinopec')) merchant = 'Sinopec Fuel';
    else if (lower.includes('dialog')) merchant = 'Dialog Bill';
    else if (lower.includes('mobitel') || lower.includes('slt')) merchant = 'SLT-Mobitel Bill';
    else if (lower.includes('airtel') || lower.includes('hutch')) merchant = 'Mobile Reload / Bill';
    else if (lower.includes('ceb') || lower.includes('leco') || lower.includes('electricity')) merchant = 'Electricity Bill';
    else if (lower.includes('water board') || lower.includes('nwsdb')) merchant = 'Water Board Bill';
    else if (lower.includes('netflix')) merchant = 'Netflix Subscription';
    else if (lower.includes('spotify')) merchant = 'Spotify';
    else if (lower.includes('daraz')) merchant = 'Daraz Shopping';
    else if (lower.includes('salary') || lower.includes('payroll')) merchant = 'Monthly Salary';
    else if (lower.includes('atm')) merchant = 'ATM Cash Withdrawal';
    else {
      const stripped = cleanText
        .replace(CURRENCY_PREFIX_REGEX, '')
        .replace(CURRENCY_SUFFIX_REGEX, '')
        .replace(/\b(\d+(?:\.\d+)?\s*k|\d[\d,.]*)\b/gi, '')
        .replace(/\b(spent|paid|received|got|earned|bought|debited|credited|for|on|at|today|yesterday|rs|lkr|usd|your|account|card|ac|ending|txn|alert)\b/gi, '')
        .replace(/[.,;:*#/-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (stripped.length >= 2 && stripped.length <= 45) {
        merchant = cleanMerchant(stripped);
      }
    }
  }

  // 4. Detect Bank Name & Account/Card 4-digit hint
  let accountHint = '';
  const acctMatch = cleanText.match(/(?:a\/c|account|card|acct|ending|no\.?)\s*(?:no\.?|ending|in|\*+|x+|xx|#|\.)*\s*[*xX.#-]*(\d{3,4})\b/i)
    || cleanText.match(/[*xX]{2,}(\d{4})\b/);
  if (acctMatch) {
    accountHint = acctMatch[1];
  }

  let detectedBank = '';
  let matchedAccountId = '';
  for (const bank of BANK_ALIASES) {
    if (bank.keywords.some(k => lower.includes(k))) {
      detectedBank = bank.label;
      if (accounts && accounts.length > 0) {
        const foundByBank = accounts.find(a =>
          a.name && bank.matchTokens.some(tok => a.name.toLowerCase().includes(tok))
        );
        if (foundByBank) matchedAccountId = foundByBank.id;
      }
      break;
    }
  }

  if (accounts && accounts.length > 0) {
    if (accountHint) {
      const foundByDigits = accounts.find(a =>
        (a.account_number && String(a.account_number).endsWith(accountHint)) ||
        (a.name && a.name.includes(accountHint))
      );
      if (foundByDigits) matchedAccountId = foundByDigits.id;
    }
    if (!matchedAccountId) {
      const byName = accounts.find(a => a.name && lower.includes(a.name.toLowerCase()));
      if (byName) matchedAccountId = byName.id;
    }
  }

  // 5. Extract Date (supports DD/MM/YYYY, DD-MMM-YYYY, YYYY-MM-DD, "yesterday")
  let date = todayYMD();
  if (lower.includes('yesterday')) {
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    date = toYMD(yest);
  } else {
    const isoMatch = cleanText.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/);
    const dmyMatch = cleanText.match(/\b(\d{1,2})[-/]([A-Za-z]{3}|\d{1,2})[-/](\d{2,4})\b/);
    if (isoMatch) {
      date = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    } else if (dmyMatch) {
      try {
        const day = parseInt(dmyMatch[1], 10);
        const month = dmyMatch[2];
        let year = parseInt(dmyMatch[3], 10);
        if (year < 100) year += 2000;

        const MONTH_NAMES = {
          jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
          jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
        };

        let mNum = parseInt(month, 10);
        if (isNaN(mNum)) {
          mNum = MONTH_NAMES[month.toLowerCase().slice(0, 3)] || (new Date().getMonth() + 1);
        }

        if (day >= 1 && day <= 31 && mNum >= 1 && mNum <= 12 && year >= 2000 && year <= 2100) {
          date = `${year}-${String(mNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      } catch {}
    }
  }

  return {
    success: true,
    amount: parseFloat(amount.toFixed(2)),
    type,
    merchant: merchant || (type === 'Income' ? 'Bank Credit' : 'Card / Bank Payment'),
    date,
    accountHint,
    detectedBank,
    matchedAccountId,
    currency: (currency || 'LKR').toUpperCase(),
    raw: cleanText
  };
}

export const SAMPLE_BANK_SMS = [
  'ComBank Alert: Your Card ending 4821 was debited for LKR 4,850.00 at KEELLS SUPER on 16/10/2026. Avl Bal LKR 84,200.00',
  'Sampath Vishwa: A/C *9012 credited with LKR 185,000.00 on 15-Oct-2026. Remarks: Monthly Salary',
  'HNB SMS Alert: Purchase of Rs. 2,340.00 using Card xx3310 at UBER EATS. Available Balance Rs. 42,110.00',
];
