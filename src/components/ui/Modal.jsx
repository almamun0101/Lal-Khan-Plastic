"use client";
import { useEffect, useId } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

// Open dialogs, top-most last. Escape only closes the top one, and the page
// behind stays locked until the last dialog is gone (dialogs can be nested,
// e.g. "new client" opened from inside the order form).
const stack = [];

function Modal({ open, onClose, title, children, size = "md" }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const token = Symbol("modal");
    stack.push(token);
    function onKey(e) {
      if (e.key === "Escape" && stack[stack.length - 1] === token) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) document.body.style.overflow = prev === "hidden" ? "" : prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-steel-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative flex max-h-[92vh] w-full flex-col rounded-t-panel bg-white shadow-2xl dark:bg-steel-800 sm:rounded-panel", sizes[size])}>
        <div className="flex shrink-0 items-center justify-between border-b border-steel-100 px-5 py-4 dark:border-steel-700">
          <h3 id={titleId} className="font-display text-base font-semibold text-steel-800 dark:text-steel-100">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-steel-400 hover:bg-steel-100 hover:text-steel-600 dark:hover:bg-steel-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
export { Modal };
