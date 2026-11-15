import { cn } from "@/lib/utils";

const tones = {
  gray: "bg-steel-100 text-steel-600 dark:bg-steel-700 dark:text-steel-300",
  blue: "bg-instrument-500/10 text-instrument-600 dark:text-instrument-400",
  amber: "bg-gauge-100 text-gauge-700 dark:bg-gauge-900/30 dark:text-gauge-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  green: "bg-ok/10 text-ok",
  red: "bg-danger/10 text-danger",
};

function Badge({ tone = "gray", className, children }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", tones[tone] ?? tones.gray, className)}>{children}</span>;
}
export { Badge };
