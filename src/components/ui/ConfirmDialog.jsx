"use client";
import { Modal } from "./Modal";
import { Button } from "./Button";

/** Reusable "are you sure?" dialog. Pass `target` (truthy opens it). */
function ConfirmDialog({ target, title, children, confirmLabel = "Delete", busy, onCancel, onConfirm, variant = "danger" }) {
  return (
    <Modal open={!!target} onClose={onCancel} title={title} size="sm">
      <div className="text-sm text-steel-500 dark:text-steel-400">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant={variant} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
export { ConfirmDialog };
