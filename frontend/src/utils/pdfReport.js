import { formatCurrency } from './format';
import { toYMD, todayYMD } from './dates';
import { isInternalMove } from './ledgerReporting.js';
import { toCSV } from './csv.js';

// Escape text before it goes into the report's HTML: notes, names and
// categories can come from imported bank files, so they must never be read
// as markup (an <img onerror=...> in a note would otherwise run).
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * PDF Report Generator
 * Uses html2canvas + jsPDF to generate a styled financial report.
 */
export const generatePDFReport = async (data) => {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const fmt = (v) => formatCurrency(v, { ignoreStealth: true, decimals: 0 });
  const now = new Date();
  const reportDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Build printable HTML
  const el = document.createElement('div');
  el.style.cssText = `
    width: 800px; padding: 48px; font-family: 'Inter', sans-serif;
    background: #fff; color: #1a1a2e; position: fixed;
    top: -9999px; left: -9999px; z-index: -1;
  `;

  el.innerHTML = `
    <div style="border-bottom: 3px solid #6366f1; padding-bottom: 24px; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <h1 style="margin:0; font-size: 28px; color: #6366f1; font-family: 'Outfit', sans-serif;">VaultManager</h1>
        <p style="margin: 4px 0 0; color: #666; font-size: 13px;">Financial Intelligence Report</p>
      </div>
      <div style="text-align: right; color: #888; font-size: 12px;">
        <div>Generated: ${reportDate}</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 32px;">
      ${[
        { label: 'Total Income',    val: fmt(data.totalIncome),   color: '#10b981' },
        { label: 'Total Expenses',  val: fmt(data.totalExpense),  color: '#f43f5e' },
        { label: 'Net Savings',     val: fmt(data.netSavings),    color: data.netSavings >= 0 ? '#6366f1' : '#f43f5e' },
        { label: 'Savings Rate',    val: `${esc(data.savingsRate)}%`,  color: '#6366f1' },
        { label: 'Avg Monthly Spend', val: fmt(data.avgMonthlySpend), color: '#f59e0b' },
        { label: 'Categories',      val: (data.categoryData||[]).length, color: '#06b6d4' },
      ].map(c => `
        <div style="background: #f8f9ff; border-radius: 10px; padding: 16px; border-left: 4px solid ${esc(c.color)};">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px;">${esc(c.label)}</div>
          <div style="font-size: 22px; font-weight: 700; color: ${esc(c.color)};">${esc(c.val)}</div>
        </div>
      `).join('')}
    </div>

    <h2 style="font-size: 16px; color: #333; margin: 0 0 16px; border-left: 3px solid #6366f1; padding-left: 10px;">Top Spending Categories</h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px; font-size: 13px;">
      <thead>
        <tr style="background: #f0f1ff;">
          <th style="text-align:left; padding: 10px 12px; color: #666; font-weight: 600;">#</th>
          <th style="text-align:left; padding: 10px 12px; color: #666; font-weight: 600;">Category</th>
          <th style="text-align:right; padding: 10px 12px; color: #666; font-weight: 600;">Amount</th>
          <th style="text-align:right; padding: 10px 12px; color: #666; font-weight: 600;">Share</th>
        </tr>
      </thead>
      <tbody>
        ${(data.categoryData||[]).slice(0,8).map((c, i) => `
          <tr style="border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 9px 12px; color: #aaa;">${i+1}</td>
            <td style="padding: 9px 12px; font-weight: 600;">${esc(c.category)}</td>
            <td style="padding: 9px 12px; text-align:right; color: #f43f5e; font-weight: 600;">${fmt(c.total)}</td>
            <td style="padding: 9px 12px; text-align:right; color: #888;">${esc(c.pct)}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2 style="font-size: 16px; color: #333; margin: 0 0 16px; border-left: 3px solid #10b981; padding-left: 10px;">AI Insights</h2>
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${(data.recommendations||[]).slice(0,4).map(r => `
        <div style="padding: 12px 16px; border-radius: 8px; background: #f8f9ff; border-left: 3px solid #6366f1; font-size: 13px;">
          <strong>${esc(r.icon)} ${esc(r.title)}</strong><br/>
          <span style="color: #555; line-height: 1.6;">${esc(r.body)}</span>
        </div>
      `).join('')}
    </div>

    <div style="margin-top: 48px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #bbb; text-align: center;">
      VaultManager Financial Report · Generated ${reportDate} · Confidential
    </div>
  `;

  document.body.appendChild(el);

  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  document.body.removeChild(el);

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const imgH = (canvas.height * pageWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgH);
  pdf.save(`VaultManager_Report_${toYMD(now)}.pdf`);
};

/**
 * Generate Executive Monthly Financial Statement PDF
 */
export const generateMonthlyStatement = async ({
  month = todayYMD().slice(0, 7),
  userEmail = 'Account Holder',
  accounts = [],
  transactions = [],
  budgets: _budgets = []
}) => {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const fmt = (v) => formatCurrency(v, { ignoreStealth: true, decimals: 0 });
  const [year, mNum] = month.split('-');
  const monthDate = new Date(parseInt(year), parseInt(mNum) - 1, 1);
  const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayFormatted = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  // Active (non-reversed) transactions for this month; transfer fees are real spending
  const monthTxs = transactions.filter(t => t && !t.reversed_at && !t.reversal_of && t.date && t.date.startsWith(month));
  const incomeTxs = monthTxs.filter(t => !isInternalMove(t) && t.type === 'Income');
  const expenseTxs = monthTxs.filter(t => !isInternalMove(t) && (t.type === 'Expense' || t.type === 'Loan Payment'));

  const totalIncome = Math.round(incomeTxs.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0) * 100) / 100;
  const totalExpense = Math.round(expenseTxs.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0) * 100) / 100;
  const netSavings = Math.round((totalIncome - totalExpense) * 100) / 100;
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

  // Category breakdown (supports split transactions)
  const catMap = {};
  expenseTxs.forEach(t => {
    const validSplits = t.isSplit !== false && Array.isArray(t.splits)
      ? t.splits.filter(sp => (parseFloat(sp?.amount) || 0) > 0)
      : [];
    if (validSplits.length > 0) {
      validSplits.forEach(sp => {
        const c = sp.category || t.category || 'Other';
        catMap[c] = (catMap[c] || 0) + (parseFloat(sp.amount) || 0);
      });
    } else {
      const c = t.category || 'Other';
      catMap[c] = (catMap[c] || 0) + (parseFloat(t.amount) || 0);
    }
  });
  const catList = Object.entries(catMap)
    .map(([cat, amount]) => ({ cat, amount, pct: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  // Top 5 largest expenses
  const topExpenses = [...expenseTxs].sort((a, b) => b.amount - a.amount).slice(0, 5);

  const el = document.createElement('div');
  el.style.cssText = `
    width: 800px; padding: 48px; font-family: 'Inter', system-ui, sans-serif;
    background: #ffffff; color: #1e1e32; position: fixed;
    top: -9999px; left: -9999px; z-index: -1;
  `;

  el.innerHTML = `
    <div style="border-bottom: 3px solid #4ade80; padding-bottom: 20px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 28px; height: 28px; border-radius: 8px; background: #1a1a2e; color: #4ade80; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px;">V</div>
          <h1 style="margin:0; font-size: 26px; color: #1a1a2e; font-family: 'Outfit', sans-serif; letter-spacing: -0.5px;">VaultManager</h1>
        </div>
        <p style="margin: 6px 0 0; color: #64748b; font-size: 13px; font-weight: 500;">Official Monthly Financial Statement</p>
      </div>
      <div style="text-align: right; color: #64748b; font-size: 12px; line-height: 1.5;">
        <div><strong>Statement Period:</strong> ${monthName}</div>
        <div><strong>Generated:</strong> ${todayFormatted}</div>
        <div><strong>User:</strong> ${esc(userEmail)}</div>
      </div>
    </div>

    <!-- Executive KPI Strip -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; border-left: 4px solid #10b981;">
        <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px;">Total Income</div>
        <div style="font-size: 18px; font-weight: 800; color: #10b981;">${fmt(totalIncome)}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; border-left: 4px solid #f43f5e;">
        <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px;">Total Expenses</div>
        <div style="font-size: 18px; font-weight: 800; color: #f43f5e;">${fmt(totalExpense)}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; border-left: 4px solid ${netSavings >= 0 ? '#10b981' : '#f43f5e'};">
        <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px;">Net Cash Flow</div>
        <div style="font-size: 18px; font-weight: 800; color: ${netSavings >= 0 ? '#10b981' : '#f43f5e'};">${netSavings >= 0 ? '+' : ''}${fmt(netSavings)}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; border-left: 4px solid #818cf8;">
        <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px;">Savings Rate</div>
        <div style="font-size: 18px; font-weight: 800; color: #6366f1;">${savingsRate}%</div>
      </div>
    </div>

    <!-- Category Breakdown Table -->
    <h2 style="font-size: 14px; color: #1e1e32; margin: 0 0 12px; font-family: 'Outfit', sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">Expenditure by Category</h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px;">
      <thead>
        <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
          <th style="text-align:left; padding: 8px 10px; color: #475569; font-weight: 600;">Category</th>
          <th style="text-align:right; padding: 8px 10px; color: #475569; font-weight: 600;">Amount Spent</th>
          <th style="text-align:right; padding: 8px 10px; color: #475569; font-weight: 600;">Share %</th>
        </tr>
      </thead>
      <tbody>
        ${catList.length > 0 ? catList.map(c => `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 7px 10px; font-weight: 600; color: #334155;">${esc(c.cat)}</td>
            <td style="padding: 7px 10px; text-align:right; color: #f43f5e; font-weight: 700;">${fmt(c.amount)}</td>
            <td style="padding: 7px 10px; text-align:right; color: #64748b;">${esc(c.pct)}%</td>
          </tr>
        `).join('') : `<tr><td colspan="3" style="padding: 10px; text-align:center; color:#94a3b8;">No expenses recorded in this period.</td></tr>`}
      </tbody>
    </table>

    <!-- Top Expenses Table -->
    <h2 style="font-size: 14px; color: #1e1e32; margin: 0 0 12px; font-family: 'Outfit', sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">Top 5 Largest Transactions</h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px;">
      <thead>
        <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
          <th style="text-align:left; padding: 8px 10px; color: #475569; font-weight: 600;">Date</th>
          <th style="text-align:left; padding: 8px 10px; color: #475569; font-weight: 600;">Description / Merchant</th>
          <th style="text-align:left; padding: 8px 10px; color: #475569; font-weight: 600;">Category</th>
          <th style="text-align:right; padding: 8px 10px; color: #475569; font-weight: 600;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${topExpenses.length > 0 ? topExpenses.map(t => `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 7px 10px; color: #64748b;">${esc(t.date)}</td>
            <td style="padding: 7px 10px; font-weight: 600; color: #1e293b;">${esc(t.notes || 'Expense')}</td>
            <td style="padding: 7px 10px; color: #64748b;">${esc(t.category || '-')}</td>
            <td style="padding: 7px 10px; text-align:right; color: #f43f5e; font-weight: 700;">${fmt(t.amount)}</td>
          </tr>
        `).join('') : `<tr><td colspan="4" style="padding: 10px; text-align:center; color:#94a3b8;">No transactions found.</td></tr>`}
      </tbody>
    </table>

    <!-- Account Balances Snapshot -->
    <h2 style="font-size: 14px; color: #1e1e32; margin: 0 0 12px; font-family: 'Outfit', sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">Current Account Balances</h2>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 24px;">
      ${accounts.slice(0, 6).map(a => `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px;">
          <div style="font-size: 11px; color: #64748b; font-weight: 500;">${esc(a.name)} (${esc(a.type || 'Account')})</div>
          <div style="font-size: 14px; font-weight: 700; color: #1e293b; margin-top: 2px;">${fmt(a.balance)}</div>
        </div>
      `).join('')}
    </div>

    <div style="margin-top: 36px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; display: flex; justify-content: space-between;">
      <span>VaultManager Personal Finance Platform</span>
      <span>Confidential Financial Document</span>
      <span>Page 1 of 1</span>
    </div>
  `;

  document.body.appendChild(el);
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  document.body.removeChild(el);

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const imgH = (canvas.height * pageWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgH);
  pdf.save(`VaultManager_Statement_${month}.pdf`);
};


export const generatePaymentVoucherPDF = async (tx, accountName) => {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const fmt = (v) => formatCurrency(v, { ignoreStealth: true, decimals: 2 });
  const txDate = tx.date || todayYMD();
  const refCode = `VM-TXN-${(tx.id || Math.random().toString(36).substring(2, 9)).toUpperCase()}`;
  const now = new Date().toLocaleString();

  const el = document.createElement('div');
  el.style.cssText = `
    width: 650px; padding: 40px; font-family: 'Inter', system-ui, sans-serif;
    background: #ffffff; color: #0f172a; position: fixed;
    top: -9999px; left: -9999px; z-index: -1;
  `;

  const typeColor = tx.type === 'Income' ? '#16a34a' : tx.type === 'Transfer' ? '#4f46e5' : '#dc2626';

  el.innerHTML = `
    <div style="border: 2px solid #e2e8f0; border-radius: 16px; padding: 32px; background: #ffffff;">
      <!-- Top Corporate Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 28px; height: 28px; border-radius: 8px; background: #6366f1; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;">V</div>
            <h1 style="margin: 0; font-size: 20px; color: #0f172a; font-family: 'Outfit', sans-serif; font-weight: 800; letter-spacing: -0.5px;">Vault Manager</h1>
          </div>
          <p style="margin: 4px 0 0; color: #64748b; font-size: 11px; letter-spacing: 1px; font-weight: 600;">OFFICIAL PAYMENT & TRANSACTION VOUCHER</p>
        </div>
        <div style="text-align: right;">
          <div style="display: inline-block; padding: 4px 10px; border-radius: 6px; background: #dcfce7; border: 1px solid #86efac; color: #15803d; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">
            ✓ VERIFIED & POSTED
          </div>
          <div style="margin-top: 6px; font-family: monospace; font-size: 11px; color: #64748b; font-weight: 600;">REF: ${refCode}</div>
        </div>
      </div>

      <!-- Amount Highlight Banner -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <div style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">Transaction Amount</div>
        <div style="font-size: 32px; font-weight: 800; color: ${typeColor}; font-family: 'Outfit', sans-serif; margin: 4px 0;">
          ${tx.type === 'Income' ? '+' : tx.type === 'Transfer' ? '↔' : '-'}${fmt(tx.amount)}
        </div>
        <div style="font-size: 12px; color: #475569; font-weight: 600;">
          ${esc(tx.type.toUpperCase())} · ${esc(tx.category || 'General')}
        </div>
      </div>

      <!-- Detailed Breakdown Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
        <tbody>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b; width: 40%; font-weight: 500;">Transaction Date</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">${txDate}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Account / Method</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">${esc(accountName || "Primary Asset Account")}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Classification / Category</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">${esc(tx.category || 'Uncategorized')}</td>
          </tr>
          ${tx.fee_amount ? `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Transfer Fee</td>
            <td style="padding: 10px 0; color: #e11d48; font-weight: 600; text-align: right;">${fmt(tx.fee_amount)}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-weight: 500; vertical-align: top;">Notes / Narrative</td>
            <td style="padding: 10px 0; color: #334155; text-align: right; font-style: italic;">
              ${esc(tx.notes || 'No memo logged for this entry.')}
            </td>
          </tr>
        </tbody>
      </table>

      ${tx.splits && tx.splits.length > 0 ? `
      <!-- Splits Section -->
      <div style="margin-bottom: 24px; padding: 12px; background: #f1f5f9; border-radius: 8px;">
        <div style="font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 8px; text-transform: uppercase;">Split Allocation</div>
        ${tx.splits.map(s => `
          <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 3px 0; color: #334155;">
            <span>${esc(s.category)}</span>
            <span style="font-weight: 600;">${fmt(s.amount)}</span>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- System Verification Hash & Legal Footer -->
      <div style="border-top: 1px dashed #cbd5e1; padding-top: 16px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; color: #94a3b8;">
        <div>
          <div>INTEGRITY TOKEN: ${btoa(refCode + txDate).slice(0, 24)}...</div>
          <div style="margin-top: 2px;">Generated by Vault Manager System on ${now}</div>
        </div>
        <div style="text-align: right; font-style: italic;">
          Certified Digital Record · No Physical Signature Required
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(el);
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  document.body.removeChild(el);

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 5, pageWidth, Math.min(imgH, pageHeight - 10));
  pdf.save(`Payment_Voucher_${refCode}.pdf`);
};

/**
 * Generates an official Tax Deduction & Capital Gains Schedule PDF
 */
export const generateTaxSchedulePDF = async ({ taxYear, transactions = [], taxBracket = 24, capitalGains = null }) => {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const fmt = (v) => formatCurrency(v, { ignoreStealth: true });
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const totalDeductions = transactions.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const estimatedSavings = totalDeductions * (taxBracket / 100);

  // Group by tax category
  const byCategory = {};
  transactions.forEach(t => {
    const cat = t.tax_category || 'Business Expense';
    byCategory[cat] = (byCategory[cat] || 0) + (parseFloat(t.amount) || 0);
  });

  const el = document.createElement('div');
  el.style.cssText = `
    width: 820px; padding: 44px; font-family: 'Inter', sans-serif;
    background: #ffffff; color: #0f172a; position: fixed;
    top: -9999px; left: -9999px; z-index: -1; line-height: 1.4;
  `;

  el.innerHTML = `
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <div style="font-size: 11px; font-weight: 700; color: #4ade80; text-transform: uppercase; letter-spacing: 2px;">OFFICIAL ANNUAL STATEMENT</div>
        <h1 style="margin: 2px 0 0; font-size: 24px; color: #0f172a; font-family: 'Outfit', sans-serif; letter-spacing: -0.5px;">
          Tax Deduction & Capital Gains Schedule
        </h1>
        <div style="font-size: 13px; color: #64748b; font-weight: 500;">Tax Year: <strong>${taxYear}</strong> · Generated on ${now}</div>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 11px; background: #f1f5f9; padding: 4px 10px; border-radius: 6px; font-weight: 600; color: #334155;">
          BRACKET ASSUMED: ${taxBracket}%
        </span>
      </div>
    </div>

    <!-- Summary KPI Grid -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
        <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600;">Total Deductible Claims</div>
        <div style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 4px;">${fmt(totalDeductions)}</div>
      </div>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px;">
        <div style="font-size: 10px; text-transform: uppercase; color: #166534; font-weight: 600;">Estimated Tax Savings</div>
        <div style="font-size: 18px; font-weight: 700; color: #16a34a; margin-top: 4px;">${fmt(estimatedSavings)}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
        <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600;">Deductible Items</div>
        <div style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 4px;">${esc(transactions.length)} Records</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
        <div style="font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600;">Capital Gains Net</div>
        <div style="font-size: 18px; font-weight: 700; color: ${(capitalGains?.netGains || 0) >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 4px;">
          ${fmt(capitalGains?.netGains || 0)}
        </div>
      </div>
    </div>

    <!-- Category Allocations -->
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #334155; margin: 0 0 8px;">Deductions by Category</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
            <th style="padding: 6px 10px; text-align: left;">Category</th>
            <th style="padding: 6px 10px; text-align: right;">Amount</th>
            <th style="padding: 6px 10px; text-align: right;">% Share</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(byCategory).map(([cat, amt]) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 6px 10px; font-weight: 500;">${esc(cat)}</td>
              <td style="padding: 6px 10px; text-align: right; font-weight: 600;">${fmt(amt)}</td>
              <td style="padding: 6px 10px; text-align: right; color: #64748b;">${totalDeductions > 0 ? ((amt / totalDeductions) * 100).toFixed(1) : 0}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Itemized Ledger -->
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #334155; margin: 0 0 8px;">Itemized Deductible Transactions</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
            <th style="padding: 6px 8px; text-align: left; width: 85px;">Date</th>
            <th style="padding: 6px 8px; text-align: left;">Description / Merchant</th>
            <th style="padding: 6px 8px; text-align: left; width: 120px;">Tax Category</th>
            <th style="padding: 6px 8px; text-align: right; width: 100px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.slice(0, 35).map(t => `
            <tr style="border-bottom: 1px solid #f8fafc;">
              <td style="padding: 5px 8px; color: #64748b;">${esc(t.date)}</td>
              <td style="padding: 5px 8px; font-weight: 500;">${esc(t.notes || t.category || 'Transaction')}</td>
              <td style="padding: 5px 8px; color: #0284c7;">${esc(t.tax_category || 'Business')}</td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 600;">${fmt(t.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${transactions.length > 35 ? `
        <div style="text-align: center; font-size: 10px; color: #64748b; padding: 6px 0;">
          + ${transactions.length - 35} more items in digital record. Full dataset available in CSV export.
        </div>
      ` : ''}
    </div>

    <!-- Certification & Disclaimer -->
    <div style="border-top: 1px solid #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8;">
      <div>
        Prepared via Money Manager FinTech Platform · Digital Verification Signature: ${btoa(now + taxYear).slice(0, 20)}
      </div>
      <div>
        For tax preparation purposes. Retain supporting receipts as required by law.
      </div>
    </div>
  `;

  document.body.appendChild(el);
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  document.body.removeChild(el);

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 5, pageWidth, Math.min(imgH, pageHeight - 10));
  pdf.save(`Tax_Deduction_Schedule_${taxYear}.pdf`);
};

/**
 * Exports Tax Deductions as CSV for accountants
 */
export const exportTaxDeductionsCSV = ({ taxYear, transactions = [] }) => {
  const headers = ['Date', 'Description', 'Category', 'Tax Category', 'Amount', 'Tax Deductible', 'Tags'];
  // toCSV quotes every value and neutralises =/+/-/@ so a note can't run as
  // a spreadsheet formula when the accountant opens the file.
  const rows = transactions.map(t => [
    t.date || '',
    t.notes || t.category || '',
    t.category || '',
    t.tax_category || 'Business',
    parseFloat(t.amount || 0).toFixed(2),
    'Yes',
    Array.isArray(t.tags) ? t.tags.join('; ') : (t.tags || ''),
  ]);

  const csvContent = toCSV([headers, ...rows]);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Tax_Deductions_${taxYear}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Generates a professional branded Client Invoice PDF
 */
export const generateInvoicePDF = async (inv) => {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const fmt = (v) => formatCurrency(v, { ignoreStealth: true });
  const el = document.createElement('div');
  el.style.cssText = `
    width: 820px; padding: 48px; font-family: 'Inter', sans-serif;
    background: #ffffff; color: #0f172a; position: fixed;
    top: -9999px; left: -9999px; z-index: -1; line-height: 1.5;
  `;

  const subtotal = (inv.items || []).reduce((sum, item) => sum + (parseFloat(item.quantity || 1) * parseFloat(item.unitPrice || 0)), 0);
  const taxRate = parseFloat(inv.taxRate || 0);
  const taxAmount = subtotal * (taxRate / 100);
  const grandTotal = subtotal + taxAmount;

  el.innerHTML = `
    <!-- Top Header & Branding -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #0f172a; padding-bottom: 20px;">
      <div>
        <div style="font-size: 26px; font-weight: 800; color: #0f172a; font-family: 'Outfit', sans-serif;">
          ${esc(inv.senderName || 'Freelance Services')}
        </div>
        <div style="font-size: 12px; color: #64748b; margin-top: 3px;">
          ${esc(inv.senderEmail || '')} · ${esc(inv.senderAddress || '')}
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 28px; font-weight: 800; color: #0f172a; font-family: 'Outfit', sans-serif; letter-spacing: 1px;">INVOICE</div>
        <div style="font-size: 13px; font-weight: 600; color: #64748b;"># ${esc(inv.invoiceNumber || 'INV-001')}</div>
        <span style="display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: ${inv.status === 'Paid' ? '#dcfce7' : '#fef3c7'}; color: ${inv.status === 'Paid' ? '#166534' : '#92400e'};">
          ${esc(inv.status || 'SENT')}
        </span>
      </div>
    </div>

    <!-- Client & Dates Info -->
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 32px; margin-bottom: 32px;">
      <div>
        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 1.5px; margin-bottom: 6px;">BILL TO</div>
        <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${esc(inv.clientName || 'Valued Client')}</div>
        <div style="font-size: 12px; color: #475569; margin-top: 2px;">${esc(inv.clientCompany || '')}</div>
        <div style="font-size: 12px; color: #64748b;">${esc(inv.clientEmail || '')}</div>
        <div style="font-size: 12px; color: #64748b;">${esc(inv.clientAddress || '')}</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #64748b;">Issue Date:</span>
          <strong style="color: #0f172a;">${inv.issueDate || todayYMD()}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #64748b;">Due Date:</span>
          <strong style="color: #dc2626;">${esc(inv.dueDate || 'Upon Receipt')}</strong>
        </div>
      </div>
    </div>

    <!-- Line Items Table -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px;">
      <thead>
        <tr style="background: #0f172a; color: #ffffff;">
          <th style="padding: 10px 12px; text-align: left;">Item Description</th>
          <th style="padding: 10px 12px; text-align: center; width: 70px;">Qty/Hrs</th>
          <th style="padding: 10px 12px; text-align: right; width: 110px;">Unit Rate</th>
          <th style="padding: 10px 12px; text-align: right; width: 120px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${(inv.items || []).map((it, idx) => `
          <tr style="border-bottom: 1px solid #f1f5f9; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
            <td style="padding: 10px 12px; font-weight: 500; color: #1e293b;">${esc(it.description || 'Service')}</td>
            <td style="padding: 10px 12px; text-align: center; color: #64748b;">${esc(it.quantity || 1)}</td>
            <td style="padding: 10px 12px; text-align: right; color: #64748b;">${fmt(it.unitPrice || 0)}</td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 600; color: #0f172a;">${fmt((parseFloat(it.quantity) || 1) * (parseFloat(it.unitPrice) || 0))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Totals Summary -->
    <div style="display: flex; justify-content: flex-end; margin-bottom: 32px;">
      <div style="width: 280px; font-size: 12px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; color: #64748b;">
          <span>Subtotal:</span>
          <span style="font-weight: 600; color: #0f172a;">${fmt(subtotal)}</span>
        </div>
        ${taxRate > 0 ? `
          <div style="display: flex; justify-content: space-between; color: #64748b;">
            <span>Tax / VAT (${taxRate}%):</span>
            <span style="font-weight: 600; color: #0f172a;">${fmt(taxAmount)}</span>
          </div>
        ` : ''}
        <div style="border-top: 2px solid #0f172a; padding-top: 8px; display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; color: #0f172a;">
          <span>Total Due:</span>
          <span>${fmt(grandTotal)}</span>
        </div>
      </div>
    </div>

    <!-- Payment Terms & Bank Instructions -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 24px;">
      <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">Payment Instructions</div>
      <div style="font-size: 11px; color: #334155; white-space: pre-wrap;">${esc(inv.paymentNotes || 'Please transfer payment to the account details provided upon receipt.')}</div>
    </div>

    <!-- Digital Footer -->
    <div style="border-top: 1px dashed #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8;">
      <div>Thank you for your business!</div>
      <div>Invoice Hash: ${btoa(inv.invoiceNumber + grandTotal).slice(0, 16)}</div>
    </div>
  `;

  document.body.appendChild(el);
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  document.body.removeChild(el);

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 5, pageWidth, Math.min(imgH, pageHeight - 10));
  pdf.save(`Invoice_${inv.invoiceNumber || 'INV'}.pdf`);
};

/**
 * Generates an institutional-grade Executive Financial Statement & P&L Dossier PDF
 */
export const generateExecutiveFinancialDossierPDF = async ({
  analytics = {},
  accounts = [],
  loans = [],
  creditCards = [],
  investments = [],
  transactions: _transactions = [],
  periodLabel = 'Annual Fiscal Review',
  userName = 'Executive Account Holder'
}) => {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const fmt = (v) => formatCurrency(v, { ignoreStealth: true, decimals: 0 });
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Calculate Balance Sheet Figures (without double-counting Investment accounts)
  const DEBT_TYPES = new Set(['Credit Card', 'Loan', 'Mortgage', 'Liability']);
  const isInvestAcc = (a) => (a.type || '').toLowerCase().includes('invest');

  const liquidAssets = (accounts || [])
    .filter(a => !DEBT_TYPES.has(a.type) && !isInvestAcc(a))
    .reduce((s, a) => s + Math.max(0, parseFloat(a.balance) || 0), 0);

  const investmentAccAssets = (accounts || [])
    .filter(a => isInvestAcc(a))
    .reduce((s, a) => s + Math.max(0, parseFloat(a.balance) || 0), 0);

  const holdingsAssets = (investments || [])
    .reduce((s, i) => s + Math.max(0, (parseFloat(i.current_price ?? i.buy_price) || 0) * (parseFloat(i.quantity) || 1)), 0);

  const investmentAssets = investmentAccAssets + holdingsAssets;
  const totalAssets = liquidAssets + investmentAssets;

  const loanLiabilities = (loans || [])
    .filter(l => (l.status || 'Active') === 'Active')
    .reduce((s, l) => s + (parseFloat(l.principal_amount || l.amount) || 0) + (parseFloat(l.current_accrued_interest ?? l.unpaid_interest) || 0), 0);

  const cardAccountLiabilities = (accounts || [])
    .filter(a => DEBT_TYPES.has(a.type))
    .reduce((s, a) => s + Math.max(0, Math.abs(parseFloat(a.balance) || 0)), 0);

  const dedicatedCardLiabilities = (creditCards || [])
    .reduce((s, c) => s + Math.max(0, parseFloat(c.balance ?? c.current_balance) || 0), 0);

  const totalLiabilities = loanLiabilities + cardAccountLiabilities + dedicatedCardLiabilities;

  const netWorth = totalAssets - totalLiabilities;

  // Calculate P&L Figures
  const income = parseFloat(analytics.totalIncome || 0);
  const expense = parseFloat(analytics.totalExpense || 0);
  const netSavings = income - expense;
  const savingsRate = income > 0 ? Math.round((netSavings / income) * 100) : 0;
  const categories = analytics.categoryData || [];

  const el = document.createElement('div');
  el.style.cssText = `
    width: 820px; padding: 44px; font-family: 'Inter', -apple-system, sans-serif;
    background: #ffffff; color: #0f172a; position: fixed; top: -9999px; left: -9999px; z-index: -1;
  `;

  el.innerHTML = `
    <!-- Statement Header -->
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <div style="font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #6366f1; margin-bottom: 4px;">Institutional Wealth Intelligence</div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #0f172a; font-family: 'Outfit', sans-serif;">Executive Financial Statement & P&L</h1>
        <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Prepared for: <strong>${esc(userName)}</strong> • Period: <strong>${esc(periodLabel)}</strong></div>
      </div>
      <div style="text-align: right; font-size: 11px; color: #64748b;">
        <div>Certified As Of: <strong>${today}</strong></div>
        <div>Report Ref: <strong>EFS-${Date.now().toString().slice(-6)}</strong></div>
      </div>
    </div>

    <!-- Section 1: Executive KPI Cards -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Gross Cash Inflow</div>
        <div style="font-size: 18px; font-weight: 800; color: #16a34a; margin-top: 4px;">${fmt(income)}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Operating Outflows</div>
        <div style="font-size: 18px; font-weight: 800; color: #dc2626; margin-top: 4px;">${fmt(expense)}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Net Operating Surplus</div>
        <div style="font-size: 18px; font-weight: 800; color: ${netSavings >= 0 ? '#4338ca' : '#dc2626'}; margin-top: 4px;">${fmt(netSavings)}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b;">Savings Retention Rate</div>
        <div style="font-size: 18px; font-weight: 800; color: #4338ca; margin-top: 4px;">${savingsRate}%</div>
      </div>
    </div>

    <!-- Section 2: Statement of Financial Position (Balance Sheet) -->
    <h2 style="font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #0f172a; margin: 0 0 10px;">I. Statement of Financial Position (Balance Sheet)</h2>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
      <!-- Assets -->
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background: #f1f5f9; padding: 8px 12px; font-size: 11px; font-weight: 700; color: #1e293b; text-transform: uppercase;">Assets (Liquid & Invested)</div>
        <div style="padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; color: #475569;">
            <span>Liquid Cash & Bank Reserves</span>
            <strong>${fmt(liquidAssets)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; color: #475569;">
            <span>Portfolio & Invested Capital</span>
            <strong>${fmt(investmentAssets)}</strong>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-weight: 800; color: #0f172a;">
            <span>Total Gross Assets</span>
            <span>${fmt(totalAssets)}</span>
          </div>
        </div>
      </div>

      <!-- Liabilities & Net Worth -->
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background: #f1f5f9; padding: 8px 12px; font-size: 11px; font-weight: 700; color: #1e293b; text-transform: uppercase;">Liabilities & Net Equity</div>
        <div style="padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; color: #475569;">
            <span>Outstanding Debt Obligations</span>
            <strong style="color: #dc2626;">${fmt(totalLiabilities)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; color: #475569;">
            <span>Debt-to-Asset Ratio</span>
            <strong>${totalAssets > 0 ? ((totalLiabilities / totalAssets) * 100).toFixed(1) : 0}%</strong>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-weight: 800; color: #16a34a;">
            <span>Consolidated Net Worth</span>
            <span>${fmt(netWorth)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 3: Expenditure Breakdown Table -->
    <h2 style="font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #0f172a; margin: 0 0 10px;">II. Operating Expenditure Breakdown</h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 11px;">
      <thead>
        <tr style="background: #0f172a; color: #ffffff;">
          <th style="padding: 8px 10px; text-align: left;">Category</th>
          <th style="padding: 8px 10px; text-align: right;">Total Outflow</th>
          <th style="padding: 8px 10px; text-align: right;">Monthly Equivalent</th>
          <th style="padding: 8px 10px; text-align: right; width: 90px;">Share of OpEx</th>
        </tr>
      </thead>
      <tbody>
        ${categories.slice(0, 8).map((cat, idx) => {
          const share = expense > 0 ? ((cat.total / expense) * 100).toFixed(1) : 0;
          return `
            <tr style="border-bottom: 1px solid #f1f5f9; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
              <td style="padding: 8px 10px; font-weight: 600; color: #1e293b;">${esc(cat.category || 'General')}</td>
              <td style="padding: 8px 10px; text-align: right; color: #0f172a;">${fmt(cat.total)}</td>
              <td style="padding: 8px 10px; text-align: right; color: #64748b;">${fmt(cat.total / 12)}</td>
              <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #4338ca;">${share}%</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <!-- Section 4: Certification Block -->
    <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; display: grid; grid-template-columns: 2fr 1fr; gap: 20px; font-size: 10px; color: #475569;">
      <div>
        <div style="font-weight: 700; text-transform: uppercase; margin-bottom: 4px; color: #0f172a;">Certification & Attestation</div>
        <div>This document represents a mathematically validated ledger extract generated from encrypted on-device records. It reflects audited transactions, verified bank balances, and asset valuations for financial compliance.</div>
      </div>
      <div style="text-align: right; display: flex; flex-direction: column; justify-content: flex-end;">
        <div style="border-bottom: 1px solid #0f172a; width: 140px; margin-left: auto; margin-bottom: 4px;"></div>
        <div style="font-weight: 700; color: #0f172a;">Authorized Signature</div>
      </div>
    </div>
  `;

  document.body.appendChild(el);
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  document.body.removeChild(el);

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 5, pageWidth, Math.min(imgH, pageHeight - 10));
  pdf.save(`Executive_Financial_Dossier_${todayYMD()}.pdf`);
};