"use client";
import { cn } from "@/lib/utils";

/** Small pill switcher, e.g. Daily | Weekly | Monthly | Yearly. */
function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cn("inline-flex rounded-lg bg-steel-100 p-1 dark:bg-steel-900", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value ? "bg-white text-instrument-700 shadow-sm dark:bg-steel-700 dark:text-gauge-300" : "text-steel-500 hover:text-steel-800 dark:text-steel-400 dark:hover:text-steel-100"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
export { Segmented };
