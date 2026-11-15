"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { runDiagnostics } from "@/lib/diagnostics";
import { explainFirebaseError } from "@/lib/firebase-error-hints";
import { useData } from "@/contexts/DataContext";
import { Button } from "@/components/ui/Button";

/**
 * Stays on screen (not a toast that can be missed) whenever the database can't
 * be read: wrong rules, no database, bad config, no network. Shows which
 * collections failed and exactly what to do, so a problem is never mistaken
 * for "no data yet".
 */
export function DiagnosticsBanner() {
  const { errors, reconnect } = useData();
  const [diag, setDiag] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);

  async function check(testWrite = false) {
    setChecking(true);
    const r = await runDiagnostics({ testWrite });
    setDiag(r);
    if (Object.keys(errors).length) reconnect();
    setChecking(false);
  }

  useEffect(() => {
    check(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failedCollections = Object.keys(errors);
  const diagFailures = diag ? ["auth", "read", "write"].filter((k) => diag[k] && !diag[k].ok) : [];
  if ((failedCollections.length === 0 && diagFailures.length === 0) || dismissed) return null;

  const firstErr = errors[failedCollections[0]];
  return (
    <div className="no-print mb-4 rounded-panel border border-danger/30 bg-danger/5 p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-danger">Firebase connection problem. Some data can't be loaded or saved.</p>
          <div className="mt-2 space-y-1.5 text-steel-700 dark:text-steel-300">
            {failedCollections.length > 0 && (
              <p>
                <span className="font-mono text-xs uppercase text-steel-400">Can't read: </span>
                {failedCollections.join(", ")}. {explainFirebaseError(firstErr)}
              </p>
            )}
            {diagFailures.map((key) => (
              <p key={key}>
                <span className="font-mono text-xs uppercase text-steel-400">{key}: </span>
                {diag[key].message}
              </p>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => check(true)} loading={checking}>
              <RefreshCw className="h-3.5 w-3.5" /> Re-check (incl. write test)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              <X className="h-3.5 w-3.5" /> Dismiss for now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
