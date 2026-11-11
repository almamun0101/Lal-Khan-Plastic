import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// True when the NEXT_PUBLIC_FIREBASE_* env vars weren't provided at build time
// (e.g. they were never added in Netlify/Vercel). Firebase's getAuth() throws
// on an empty API key, which used to crash the whole build while Next.js
// pre-renders pages. We use a placeholder so the build can finish, and the
// login page shows a clear "config missing" notice instead.
const firebaseConfigMissing = !process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "missing-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
export {
  firebaseConfigMissing,
  app,
  auth,
  db
};
