/*
 * One-tap backup to the user's Google Drive.
 *
 * Uses Google Identity Services with the narrow `drive.file` scope: the app
 * can only see files it created itself, never the rest of the user's Drive.
 * Backups go into a "Vault Manager backups" folder.
 *
 * Needs VITE_GOOGLE_CLIENT_ID (an OAuth "Web application" client ID; see
 * README). Without it the feature reports itself as unavailable.
 *
 * Browsers only grant short-lived tokens after a user tap, so this is a
 * one-tap backup (prompted weekly by the backup reminder), not a silent
 * background job; that would need a server holding a refresh token.
 */
import { buildVaultBackup, markBackupCompleted } from './backupCrypto';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'Vault Manager backups';
const LAST_KEY = 'vm_drive_last_backup';

export const driveClientId = () => import.meta.env?.VITE_GOOGLE_CLIENT_ID || '';
// Google blocks its sign-in inside app WebViews, so Drive backup is web-only for now.
export const isDriveBackupAvailable = () => !!driveClientId() && !(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
export const lastDriveBackup = () => { try { return localStorage.getItem(LAST_KEY); } catch { return null; } };

let gisPromise = null;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

let token = null; // { access_token, expires_at }
async function getToken() {
  if (token && token.expires_at > Date.now() + 60_000) return token.access_token;
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: driveClientId(),
      scope: SCOPE,
      callback: (res) => {
        if (res.error) { reject(new Error(res.error_description || res.error)); return; }
        token = { access_token: res.access_token, expires_at: Date.now() + (Number(res.expires_in) || 3600) * 1000 };
        resolve(token.access_token);
      },
      error_callback: (err) => reject(new Error(err?.message || 'Google sign-in was closed')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

async function drive(path, init, accessToken) {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`Google Drive error ${res.status}`);
  return res.json();
}

async function ensureFolder(accessToken) {
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await drive(`/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`, {}, accessToken);
  if (found.files?.length) return found.files[0].id;
  const created = await drive('/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  }, accessToken);
  return created.id;
}

/**
 * Builds a full backup (encrypted when a passphrase is given) and uploads it.
 * Must be called from a user tap (Google opens a consent popup the first time).
 */
export async function backupToDrive(password = '') {
  if (!isDriveBackupAvailable()) throw new Error('Google Drive backup is not set up for this app');
  const accessToken = await getToken();
  const { payload, filename, encrypted } = await buildVaultBackup(password);
  const folderId = await ensureFolder(accessToken);
  const boundary = `vm${Math.random().toString(36).slice(2)}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name: filename, parents: [folderId], mimeType: 'application/json' }),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify(payload),
    `--${boundary}--`,
  ].join('\r\n');
  const file = await drive('/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  }, accessToken);
  const at = new Date().toISOString();
  try { localStorage.setItem(LAST_KEY, at); } catch { /* private mode */ }
  markBackupCompleted();
  return { ...file, encrypted, at };
}
