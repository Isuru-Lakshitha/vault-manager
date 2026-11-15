import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where } from "firebase/firestore";

const firebaseConfig = {
  projectId: "money-manager-isuru",
  appId: "1:257633712117:web:5945671c04bc03056ad2bc",
  storageBucket: "money-manager-isuru.firebasestorage.app",
  apiKey: "REMOVED-firebase-web-api-key",
  authDomain: "money-manager-isuru.firebaseapp.com",
  messagingSenderId: "257633712117",
  projectNumber: "257633712117"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function test() {
  try {
    console.log("Testing basic getDocs...");
    const snap = await getDocs(collection(db, 'accounts'));
    console.log(`Success! Found ${snap.docs.length} documents.`);
    
    if (snap.docs.length > 0) {
      console.log("Sample doc data:", snap.docs[0].data());
    }

    console.log("Testing getDocs with uid filter...");
    const q = query(collection(db, 'accounts'), where('uid', '==', 'test-uid'));
    const snap2 = await getDocs(q);
    console.log(`Success! Found ${snap2.docs.length} documents with test-uid.`);
  } catch (err) {
    console.error("FIREBASE ERROR:", err.code, err.message);
  }
}

test();
