import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { initializeAuth, getAuth, browserLocalPersistence, indexedDBLocalPersistence } from "firebase/auth";
import { getStorage } from "firebase/storage";

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

// Firestore with full offline persistence — works offline in PWA
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Initialize Auth directly with local persistence (no extra async setPersistence lock wait)
let auth;
try {
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence]
  });
} catch {
  auth = getAuth(app);
}

const storage = getStorage(app);

export { db, auth, storage };
