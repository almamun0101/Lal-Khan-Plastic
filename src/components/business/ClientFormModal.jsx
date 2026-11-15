"use client";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { clientSchema } from "@/lib/schemas";
import { createDoc, errorMessage, newId, notifySaved, updateDocById } from "@/lib/firestore-service";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

const EMPTY = { name: "", phone: "", email: "", address: "", notes: "", credit_limit: 0, status: "active" };

/** Add or edit a client. `onSaved(id)` lets other forms select the new client straight away. */
export function ClientFormModal({ open, onClose, client, onSaved }) {
  const { user } = useAuth();
  const idRef = useRef("");
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(clientSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    idRef.current = client?.id ?? newId("clients");
    reset(
      client
        ? { name: client.name ?? "", phone: client.phone ?? "", email: client.email ?? "", address: client.address ?? "", notes: client.notes ?? "", credit_limit: client.credit_limit ?? 0, status: client.status ?? "active" }
        : EMPTY
    );
  }, [open, client, reset]);

  async function onSubmit(v) {
    try {
      const fields = {
        name: v.name.trim(),
        phone: (v.phone ?? "").trim(),
        email: (v.email ?? "").trim(),
        address: v.address ?? "",
        notes: v.notes ?? "",
        credit_limit: Number(v.credit_limit) || 0,
        status: v.status,
        updated_at: Date.now(),
      };
      if (client) {
        notifySaved(await updateDocById("clients", client.id, fields), "Client updated");
      } else {
        const r = await createDoc("clients", { ...fields, created_at: Date.now(), created_by: user?.email ?? "" }, idRef.current);
        notifySaved(r, "Client added");
        onSaved?.(r.id);
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the client"));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={client ? "Edit Client" : "Add Client"} size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label>Client name *</Label>
          <Input {...register("name")} error={errors.name?.message} placeholder="e.g. Rahim Traders" autoFocus />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Phone</Label>
            <Input {...register("phone")} inputMode="tel" placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" {...register("email")} error={errors.email?.message} />
          </div>
        </div>
        <div>
          <Label>Address</Label>
          <Textarea rows={2} {...register("address")} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Credit limit (optional)</Label>
            <Input type="number" min={0} step="0.01" {...register("credit_limit")} error={errors.credit_limit?.message} />
            <p className="mt-1 text-xs text-steel-400">You get an alert when their unpaid amount goes above this. 0 = no limit.</p>
          </div>
          <div>
            <Label>Status</Label>
            <Select {...register("status")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea rows={2} {...register("notes")} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{client ? "Save Changes" : "Add Client"}</Button>
        </div>
      </form>
    </Modal>
  );
}
