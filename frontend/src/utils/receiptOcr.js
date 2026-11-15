export function parseReceiptText(text) {
  const lines=String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const totals=lines.filter(line=>/^(?:grand\s+total|total(?:\s+(?:due|amount))?|amount\s+due)\b/i.test(line));
  const amounts=totals.map(line=>line.match(/(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?!\d)/g)?.at(-1)).filter(Boolean);
  const unique=[...new Set(amounts.map(value=>Number(value.replaceAll(',',''))))];
  const iso=String(text).match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  const date=iso && Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0,10)===iso ? iso : '';
  return {amount:unique.length===1?unique[0]:'',merchant:lines[0]||'',date};
}
export async function recognizeReceipt(image, onProgress) {
  const {createWorker}=await import('tesseract.js');
  const worker=await createWorker('eng',1,{logger:message=>onProgress?.(message.status, message.progress)});
  try { const {data}=await worker.recognize(image);return {...parseReceiptText(data.text),text:data.text,confidence:data.confidence}; }
  finally {await worker.terminate();}
}
