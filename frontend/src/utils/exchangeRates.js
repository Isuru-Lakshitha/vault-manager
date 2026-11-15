// Map values are LKR per one unit; metadata is deliberately retained for display.
export function parseExchangeRates(rows, fetchedAt = new Date().toISOString()) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Exchange rates are unavailable');
  const rates = { LKR: 1, _source: 'Frankfurter', _fetchedAt: fetchedAt, _dates: {} };
  for (const row of rows) {
    const currency = String(row.quote || '').toUpperCase();
    if (String(row.base).toUpperCase() !== 'LKR' || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(row.rate) || row.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    rates[currency] = 1 / row.rate;
    rates._dates[currency] = row.date;
  }
  const dates = Object.values(rates._dates).sort();
  if (!dates.length) throw new Error('No valid exchange rates were returned');
  rates._date = dates[0];
  return rates;
}
export function currencyRate(from, to, rates) {
  if (from === to) return 1;
  if (!rates?._source || !rates?._date) return NaN;
  const source = rates[from], target = rates[to];
  return Number.isFinite(source) && source > 0 && Number.isFinite(target) && target > 0 ? source / target : NaN;
}
