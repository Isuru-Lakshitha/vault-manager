// Local-calendar date helpers.
//
// `date.toISOString().split('T')[0]` converts to UTC first. In Sri Lanka
// (UTC+5:30) that returns *yesterday* between 00:00 and 05:30, and turns a
// local month start like new Date(2026, 9, 1) into "2026-09-30".
// These helpers format using the device's local calendar instead.

/** Format a Date as 'YYYY-MM-DD' in local time. */
export const toYMD = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Today's local date as 'YYYY-MM-DD'. */
export const todayYMD = () => toYMD(new Date());
