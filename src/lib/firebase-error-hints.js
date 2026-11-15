// Plain-English fixes for the Firebase error codes people actually hit when
// setting up a project. Shared by the connection diagnostics panel, the login
// page and the save-error toasts so the message is consistent everywhere.
export const FIREBASE_ERROR_HINTS = {
  "permission-denied":
    "Firestore security rules are blocking this. In the Firebase console: Firestore Database → Rules → paste this project's firestore.rules → Publish. (New collections such as clients, sales_orders and payments need the updated rules.)",
  "not-found":
    "This Firestore database doesn't exist yet. In the Firebase console: Build → Firestore Database → Create database.",
  unavailable:
    "Can't reach Firestore right now. Check your internet connection. Your entry is kept on this device and will sync when the connection returns.",
  unauthenticated: "You're not signed in. Log out and log back in.",
  "failed-precondition":
    "Firestore couldn't complete this request (another tab may have an older version open, or an index is missing). Refresh the page and try again.",
  "resource-exhausted": "The Firebase free-tier quota for today has been used up. It resets daily; try again tomorrow or upgrade the plan.",
  aborted: "Another change happened at the same moment. Please try again.",
  "deadline-exceeded": "The server took too long to answer. Check your connection and try again.",
  "invalid-api-key":
    "The Firebase API key doesn't match this project. Recheck it against Firebase console → Project settings → General → Your apps.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
    "The Firebase API key is missing or wrong on this deployment. Add the six NEXT_PUBLIC_FIREBASE_* environment variables in your host's settings and redeploy (Netlify: Clear cache and deploy site).",
  "auth/invalid-api-key":
    "The Firebase API key doesn't match this project. Recheck it against Firebase console → Project settings → General → Your apps.",
  "auth/network-request-failed": "No internet connection, or Firebase is unreachable. Check your network and try again.",
  "auth/too-many-requests": "Too many failed attempts. Wait a few minutes, or reset your password, then try again.",
  "auth/user-disabled": "This account has been disabled in the Firebase console.",
  "auth/operation-not-allowed": "Email/Password sign-in is turned off. Firebase console → Authentication → Sign-in method → enable Email/Password.",
  "auth/unauthorized-domain": "This website's domain isn't authorised. Firebase console → Authentication → Settings → Authorized domains → add your Netlify domain.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/wrong-password": "Invalid email or password.",
  "auth/user-not-found": "Invalid email or password.",
  "auth/invalid-email": "That doesn't look like a valid email address.",
};

export function explainFirebaseError(err) {
  if (!err) return "Unknown error.";
  const hint = FIREBASE_ERROR_HINTS[err.code];
  return hint ? hint : `[${err.code ?? "error"}] ${err.message ?? "Something went wrong."}`;
}
