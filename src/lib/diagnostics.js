import { collection, doc, getDocsFromServer, limit, query, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { explainFirebaseError } from "./firebase-error-hints";

/**
 * Live checks against the current Firebase project, with plain-English results.
 * Reads go to the SERVER (not the device cache), so a "working" result really
 * means the database is reachable. The write test only runs when asked
 * (`testWrite`), not on every page load.
 */
export async function runDiagnostics({ testWrite = false } = {}) {
  const results = { auth: null, read: null, write: null };

  if (auth.currentUser) {
    results.auth = { ok: true, message: `Signed in as ${auth.currentUser.email}` };
  } else {
    results.auth = { ok: false, message: "Not signed in. Try logging out and back in." };
    results.read = { ok: false, message: "Skipped — not signed in." };
    results.write = { ok: false, message: "Skipped — not signed in." };
    return results;
  }

  const testRef = doc(db, "_diagnostics", "connectivity_test");
  try {
    // Test the collection that is actually failing in the banner. Reading the
    // private diagnostics collection alone can pass while activity_log is denied.
    await getDocsFromServer(query(collection(db, "activity_log"), limit(1)));
    results.read = { ok: true, message: "Firestore activity_log reads are working." };
  } catch (err) {
    results.read = {
      ok: false,
      message: `Cannot read activity_log: ${explainFirebaseError(err)}`,
      code: err.code,
    };
  }

  if (testWrite) {
    try {
      await Promise.race([
        setDoc(testRef, { lastCheckedBy: auth.currentUser.uid, lastCheckedAt: Date.now() }),
        new Promise((_, reject) => setTimeout(() => reject({ code: "unavailable" }), 10000)),
      ]);
      results.write = { ok: true, message: "Firestore writes are working." };
    } catch (err) {
      results.write = { ok: false, message: explainFirebaseError(err), code: err.code };
    }
  }
  return results;
}
