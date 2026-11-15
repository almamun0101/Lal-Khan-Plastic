"use client";
// Last-resort safety net: a crash on any page shows this instead of a blank white screen.
import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-panel border border-steel-200 bg-white p-6 text-center shadow-panel dark:border-steel-700 dark:bg-steel-800">
        <h1 className="font-display text-xl font-bold text-steel-800 dark:text-steel-50">Something went wrong</h1>
        <p className="mt-2 text-sm text-steel-500 dark:text-steel-400">
          The page hit an unexpected error. Your saved data is safe. Try again, and if it keeps happening, reload the page.
        </p>
        <p className="mt-3 break-words rounded-lg bg-steel-100 p-2 font-mono text-xs text-steel-500 dark:bg-steel-900">{error?.message}</p>
        <button onClick={reset} className="mt-4 rounded-lg bg-instrument-600 px-4 py-2 text-sm font-medium text-white hover:bg-instrument-500">
          Try again
        </button>
      </div>
    </div>
  );
}
