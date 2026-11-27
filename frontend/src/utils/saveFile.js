// Save a generated file (backup, CSV, Excel, PDF) for the user.
// Browser: a normal download. Android app: the WebView ignores downloads, so
// the file is written to the app's cache folder and handed to the share sheet
// (Save to Files / Drive / email). Resolves only once the file was handed off,
// so callers can record "backup done" truthfully. Throws on failure.

const isNative = () => typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true;

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(reader.error || new Error('Could not read the file'));
  reader.readAsDataURL(blob);
});

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export async function saveFile(blob, filename) {
  const safeName = String(filename || 'export').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  if (isNative()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: `exports/${safeName}`,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    });
    try {
      await Share.share({ title: safeName, files: [uri], dialogTitle: `Save ${safeName}` });
    } catch (err) {
      // Closing the share sheet without choosing anything is not a save.
      if (/cancel/i.test(String(err?.message || err))) throw new Error('Not saved: the share sheet was closed.');
      throw err;
    }
    return { uri };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { url };
}

/** jsPDF document → saved file. */
export const savePdf = (pdf, filename) => saveFile(pdf.output('blob'), filename);

/** SheetJS workbook → saved .xlsx file. */
export async function saveWorkbook(XLSX, wb, filename) {
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return saveFile(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
