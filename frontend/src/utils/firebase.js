import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { initializeAuth, getAuth, browserLocalPersistence, indexedDBLocalPersistence } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  projectId: "money-manager-isuru",
  appId: "1:257633712117:web:5945671c04bc03056ad2bc",
  storageBucket: "money-manager-isuru.firebasestorage.app",
  apiKey: "REMOVED-firebase-web-api-key",
  authDomain: "money-manager-isuru.firebaseapp.com",
  messagingSenderId: "257633712117",
  projectNumber: "257633712117"
};

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
