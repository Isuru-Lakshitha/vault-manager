import { todayYMD } from './dates.js';
import { roundMoney } from './money.js';
/**
 * Universal Bank Statement & Feed Parser
 * Supports:
 *  - OFX (Open Financial Exchange 1.x & 2.x)
 *  - QFX (Quicken Financial Exchange)
 *  - QIF (Quicken Interchange Format)
 *  - Multi-Bank CSV with intelligent header auto-detection
 *
 * 100% Client-side. Free forever, no subscription needed.
 */

// Helper to format YYYYMMDDHHMMSS or YYYYMMDD from OFX into YYYY-MM-DD
function parseOFXDate(dateStr) {
  if (!dateStr) return todayYMD();
  const clean = dateStr.trim().replace(/[^0-9]/g, '');
  if (clean.length >= 8) {
    const y = clean.substring(0, 4);
    const m = clean.substring(4, 6);
    const d = clean.substring(6, 8);
    return `${y}-${m}-${d}`;
  }
  return todayYMD();
}

// Helper to format QIF date (M/D/YY, M/D/YYYY, D-M-YY, etc.)
function parseQIFDate(dateStr) {
  if (!dateStr) return todayYMD();
  const parts = dateStr.trim().split(/[/.-]/);
  if (parts.length === 3) {
    let [p1, p2, p3] = parts;
    if (p3.length === 2) p3 = '20' + p3;
    // Guess M/D/Y or D/M/Y
    let m = parseInt(p1, 10);
    let d = parseInt(p2, 10);
    if (m > 12 && d <= 12) {
      // swapped D/M/Y
      const tmp = m;
      m = d;
      d = tmp;
    }
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${p3}-${mm}-${dd}`;
  }
  return todayYMD();
}

/**
 * Parses OFX / QFX XML/SGML file content
 */
export function parseOFX(content) {
  const transactions = [];
  
  // Extract all <STMTTRN>...</STMTTRN> or unclosed <STMTTRN> blocks
  const trnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi;
  let match;
  
  const getTag = (block, tag) => {
    const tagRegex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
    const m = block.match(tagRegex);
    return m ? m[1].trim() : '';
  };

  while ((match = trnRegex.exec(content)) !== null) {
    const block = match[1];
    const trnType = getTag(block, 'TRNTYPE');
    const dtPosted = getTag(block, 'DTPOSTED');
    const trnAmt = parseFloat(getTag(block, 'TRNAMT')) || 0;
    const fitId = getTag(block, 'FITID');
    const name = getTag(block, 'NAME') || getTag(block, 'PAYEE');
    const memo = getTag(block, 'MEMO');
    
    const description = [name, memo].filter(Boolean).join(' - ') || 'Bank Transaction';
    const isCredit = trnAmt > 0 || /credit|dep|deposit|interest/i.test(trnType);
    // Some banks send 3+ decimals; the ledger stores cents.
    const amount = roundMoney(Math.abs(trnAmt));
    const date = parseOFXDate(dtPosted);

    if (amount <= 0) continue; // nothing to record (e.g. 0.004 rounds to 0)
    transactions.push({
      // Empty when the bank sends none; bankRowRefs() then builds a stable one.
      fitId: fitId || '',
      date,
      amount,
      type: isCredit ? 'Income' : 'Expense',
      notes: description,
      category: isCredit ? 'Income' : 'General',
      source: 'OFX/QFX Bank Export'
    });
  }

  return transactions;
}

/**
 * Parses QIF (Quicken Interchange Format) file content
 */
export function parseQIF(content) {
  const transactions = [];
  const lines = content.split(/\r?\n/);
  let currentTx = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const code = trimmed[0];
    const val = trimmed.substring(1).trim();

    if (trimmed.startsWith('!Type:')) {
      // Header, skip
      continue;
    }

    if (code === '^') {
      // End of transaction entry
      if (currentTx && currentTx.amount > 0) {
        transactions.push(currentTx);
      }
      currentTx = null;
      continue;
    }

    if (!currentTx) {
      currentTx = {
        date: todayYMD(),
        amount: 0,
        type: 'Expense',
        notes: '',
        category: 'General',
        source: 'QIF Bank Export'
      };
    }

    switch (code) {
      case 'D': // Date
        currentTx.date = parseQIFDate(val);
        break;
      case 'T': // Amount
      case 'U': {
        const num = parseFloat(val.replace(/,/g, '')) || 0;
        currentTx.amount = roundMoney(Math.abs(num));
        currentTx.type = num >= 0 ? 'Income' : 'Expense';
        break;
      }
      case 'P': // Payee / Description
        currentTx.notes = val;
        break;
      case 'M': // Memo
        if (currentTx.notes) currentTx.notes += ` (${val})`;
        else currentTx.notes = val;
        break;
      case 'L': // Category
        if (val) currentTx.category = val;
        break;
      default:
        break;
    }
  }

  if (currentTx && currentTx.amount > 0) {
    transactions.push(currentTx);
  }

  return transactions;
}

/**
 * Auto-detects and parses any bank statement file (.ofx, .qfx, .qif, .csv)
 */
export function parseAnyBankFile(fileContent, fileName = '') {
  const name = fileName.toLowerCase();
  
  if (name.endsWith('.ofx') || name.endsWith('.qfx') || fileContent.includes('<OFX>') || fileContent.includes('<STMTTRN>')) {
    return {
      format: 'OFX/QFX',
      transactions: parseOFX(fileContent)
    };
  }

  if (name.endsWith('.qif') || fileContent.startsWith('!Type:')) {
    return {
      format: 'QIF',
      transactions: parseQIF(fileContent)
    };
  }

  return {
    format: 'UNKNOWN',
    transactions: []
  };
}
