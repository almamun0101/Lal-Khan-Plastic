import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

// True when the NEXT_PUBLIC_FIREBASE_* env vars weren't provided at build time
// (e.g. they were never added in Netlify). We use a placeholder key so the
// build can still finish; the login page and the app shell then show a clear
// "configuration missing" notice instead of a blank screen.
const firebaseConfigMissing =
  !process.env.NEXT_PUBLIC_FIREBASE_API_KEY || !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "missing-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "missing-project-id",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Firestore setup, tuned for reliability on real-world connections:
//  - persistent local cache: pages open instantly from the device cache, and
//    entries typed while offline are queued and synced when the connection returns
//  - auto-detected long polling: keeps working behind proxies/ISPs that break
//    the default streaming connection (a common cause of "saving forever")
function createFirestore() {
  try {
    if (typeof window === "undefined") {
      return initializeFirestore(app, { localCache: memoryLocalCache(), experimentalAutoDetectLongPolling: true });
    }
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    // Already initialised (hot reload) or IndexedDB unavailable (private mode).
    try {
      return getFirestore(app);
    } catch {
      return initializeFirestore(app, { localCache: memoryLocalCache(), experimentalAutoDetectLongPolling: true });
    }
  }
}
const db = createFirestore();

export { firebaseConfigMissing, app, auth, db };
