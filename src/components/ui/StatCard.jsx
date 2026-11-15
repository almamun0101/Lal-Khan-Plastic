import Link from "next/link";
import { cn } from "@/lib/utils";

const tones = {
  blue: "bg-instrument-500/10 text-instrument-600 dark:text-instrument-400",
  green: "bg-ok/10 text-ok",
  red: "bg-danger/10 text-danger",
  amber: "bg-gauge-100 text-gauge-600 dark:bg-gauge-900/30 dark:text-gauge-300",
  gray: "bg-steel-100 text-steel-500 dark:bg-steel-700 dark:text-steel-300",
};
const valueTones = { red: "text-danger", green: "text-ok", default: "text-steel-800 dark:text-steel-50" };

/** A single labelled number. `hint` explains what the number means in plain words. */
function StatCard({ label, value, sub, hint, icon: Icon, tone = "blue", valueTone = "default", href, progress }) {
  const body = (
    <div className={cn("h-full rounded-panel border border-steel-200 bg-white p-4 shadow-panel dark:border-steel-700 dark:bg-steel-800 dark:shadow-panel-dark", href && "transition-shadow hover:shadow-lg")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-steel-400">{label}</p>
          <p className={cn("mt-1.5 truncate font-mono text-xl font-bold sm:text-2xl", valueTones[valueTone] ?? valueTones.default)}>{value}</p>
          {sub && <p className="mt-1 text-xs text-steel-500 dark:text-steel-400">{sub}</p>}
        </div>
        {Icon && (
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tones[tone] ?? tones.blue)}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      {progress != null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-steel-100 dark:bg-steel-700">
          <div className="h-full rounded-full bg-ok" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
      {hint && <p className="mt-2 text-[11px] leading-snug text-steel-400">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}
export { StatCard };
