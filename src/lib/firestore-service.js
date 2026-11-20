import {
  collection,
  deleteDoc,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { toast } from "sonner";
import { auth, db } from "./firebase";
import { explainFirebaseError } from "./firebase-error-hints";

// Firestore only resolves a write promise once the SERVER confirms it. When the
// connection is bad the write is still safely stored on this device and will
// sync later, but the promise just hangs, which used to look like a form stuck
// on a spinner (and tempted people to submit twice).
//
// So after `ms` we stop waiting and report { queued: true } instead of an error.
// Every create uses an ID generated up-front, so re-submitting the same form
// can never create a duplicate.
function guarded(promise, ms = 12000) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ queued: true }), ms);
  });
  return Promise.race([promise.then(() => ({ queued: false })), timeout]).then(
    (r) => {
      clearTimeout(timer);
      return r;
    },
    (err) => {
      clearTimeout(timer);
      if (err?.code) err.message = explainFirebaseError(err);
      throw err;
    }
  );
}

export function newId(collectionName) {
  return doc(collection(db, collectionName)).id;
}

// Creates (or idempotently re-creates) a document. Pass `id` from newId() so a
// retry after a timeout overwrites the same document instead of adding another.
export async function createDoc(collectionName, data, id) {
  const ref = id ? doc(db, collectionName, id) : doc(collection(db, collectionName));
  const { queued } = await guarded(setDoc(ref, data));
  return { id: ref.id, queued };
}

export async function updateDocById(collectionName, id, data) {
  return guarded(updateDoc(doc(db, collectionName, id), data));
}

export async function setDocById(collectionName, id, data, options) {
  return guarded(options ? setDoc(doc(db, collectionName, id), data, options) : setDoc(doc(db, collectionName, id), data));
}

export async function deleteDocById(collectionName, id) {
  return guarded(deleteDoc(doc(db, collectionName, id)));
}

// Deletes several documents atomically (all or nothing).
export async function deleteMany(collectionName, ids) {
  const batch = writeBatch(db);
  ids.forEach((id) => batch.delete(doc(db, collectionName, id)));
  return guarded(batch.commit());
}

/**
 * Creates a customer order and assigns its number (ORD-0001, ORD-0002 …) inside
 * a transaction, so two people or two tabs can never get the same number.
 * `floor` is the highest number already seen in the loaded data, a safety net in
 * case the counter document was ever deleted.
 */
export async function createSalesOrder(data, { id, floor = 0 } = {}) {
  const ref = id ? doc(db, "sales_orders", id) : doc(collection(db, "sales_orders"));
  const counterRef = doc(db, "app_config", "counters");
  let order_no = "";
  const { queued } = await guarded(
    runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists()) {
        order_no = existing.data().order_no; // retry of an order that already saved
        return;
      }
      const counter = await tx.get(counterRef);
      const current = counter.exists() ? Number(counter.data().sales_order) || 0 : 0;
      const next = Math.max(current, Number(floor) || 0) + 1;
      order_no = `ORD-${String(next).padStart(4, "0")}`;
      tx.set(counterRef, { sales_order: next }, { merge: true });
      tx.set(ref, { ...data, order_no });
    }),
    20000
  );
  return { id: ref.id, order_no, queued };
}

/**
 * Records who changed or removed something important (payments, expenses, salary
 * payments, orders). Entries can be created and read but never edited or deleted
 * (see firestore.rules), so there is always a trail. Never blocks or fails the
 * action it describes.
 */
export function logActivity(action, entity, summary) {
  try {
    createDoc("activity_log", { action, entity, summary, by: auth.currentUser?.email ?? "", at: Date.now() }).catch(() => {});
  } catch {
    /* logging must never get in the way */
  }
}

// One consistent success/queued toast for every save.
export function notifySaved(result, message) {
  if (result?.queued) {
    toast.warning(`${message} — saved on this device, waiting for the connection. It will sync automatically; don't enter it again.`, { duration: 7000 });
  } else {
    toast.success(message);
  }
}

export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  return err?.message || fallback;
}
