import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { app, auth } from "./firebaseApp.js";

// Data layer: Firestore + Storage on top of the app/auth set up in
// firebaseApp.js. Import `auth` alone from firebaseApp.js where no data is
// needed, so startup code doesn't pull in Firestore.

// Firestore with full offline persistence — works offline in PWA
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const storage = getStorage(app);

export { db, auth, storage };
