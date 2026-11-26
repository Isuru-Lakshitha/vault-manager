// Firebase app + Auth only. Kept free of Firestore so the sign-in page and
// the app shell load without the ~170 KB (gzip) database library; data
// modules import `db` from ./firebase.js, which is loaded after sign-in.
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { initializeAuth, getAuth, browserLocalPersistence, indexedDBLocalPersistence } from "firebase/auth";

// Web config comes from frontend/.env (never committed). See .env.example.
// These values identify the Firebase project; access is enforced by
// firestore.rules and storage.rules, not by keeping them hidden.
// Plain Node (unit tests) has no import.meta.env: use an offline placeholder
// project there so modules load; the browser build always needs real values.
const env = import.meta.env ?? {
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-test',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-test.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
  VITE_FIREBASE_APP_ID: '1:0:web:0',
};
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
const missing = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  throw new Error(`Firebase config missing (${missing.join(', ')}). Copy frontend/.env.example to frontend/.env and fill it in.`);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// App Check: proves requests come from this app, not a script reusing the
// public web config. Enabled when VITE_APPCHECK_SITE_KEY (a reCAPTCHA v3
// site key registered in Firebase → App Check) is set. In `npm run dev` a
// debug token is used instead; register it in the console once (it is
// printed in the browser console).
const appCheckKey = import.meta.env?.VITE_APPCHECK_SITE_KEY;
if (appCheckKey && typeof window !== 'undefined') {
  if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
  try {
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckKey), isTokenAutoRefreshEnabled: true });
  } catch (err) {
    console.warn('App Check not started', err);
  }
}

// Initialize Auth directly with local persistence (no extra async setPersistence lock wait)
let auth;
try {
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence]
  });
} catch {
  auth = getAuth(app);
}

export { app, auth };
