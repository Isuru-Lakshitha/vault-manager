import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOFX, parseQIF, parseAnyBankFile } from '../src/utils/bankFileParser.js';

const ofx = `<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103120000<TRNAMT>-12.345<FITID>A1<NAME>Coffee Shop<MEMO>Card 1234</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105<TRNAMT>2500.00<FITID>A2<NAME>Salary</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106<TRNAMT>-5<NAME>No id</STMTTRN>
</BANKTRANLIST></OFX>`;

test('OFX rows keep the bank id, date, direction and a cents amount', () => {
  const rows = parseOFX(ofx);
  assert.equal(rows.length, 3);
  assert.deepEqual([rows[0].date, rows[0].type, rows[0].amount, rows[0].fitId], ['2026-11-03', 'Expense', 12.35, 'A1']);
  assert.equal(rows[0].notes, 'Coffee Shop - Card 1234');
  assert.deepEqual([rows[1].type, rows[1].amount], ['Income', 2500]);
  assert.equal(rows[2].fitId, '', 'no invented id when the bank sends none');
});

test('QIF rows parse dates, thousands separators, signs and memos', () => {
  const qif = '!Type:Bank\nD11/03/2026\nT-1,234.567\nPRent\nMNovember\n^\nD11/04/2026\nT50\nPRefund\n^\n';
  const rows = parseQIF(qif);
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].type, rows[0].amount, rows[0].notes], ['Expense', 1234.57, 'Rent (November)']);
  assert.deepEqual([rows[1].type, rows[1].amount], ['Income', 50]);
});

test('file type is detected from the name or the content', () => {
  assert.equal(parseAnyBankFile(ofx, 'statement.txt').format, 'OFX/QFX');
  assert.equal(parseAnyBankFile('!Type:Bank\nT1\n^', 'x.qif').transactions.length, 1);
});
