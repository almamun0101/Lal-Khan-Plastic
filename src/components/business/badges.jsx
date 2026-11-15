import { Badge } from "@/components/ui/Badge";
import { STATUS_META, METHOD_LABEL } from "@/lib/constants";

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function PayBadge({ state, overdue }) {
  if (overdue) return <Badge tone="red">Overdue</Badge>;
  if (state === "paid") return <Badge tone="green">Paid</Badge>;
  if (state === "partial") return <Badge tone="amber">Partial</Badge>;
  return <Badge tone="gray">Unpaid</Badge>;
}

export function MethodBadge({ method }) {
  const tone = method === "bkash" ? "purple" : method === "bank" ? "blue" : method === "cash" ? "green" : "gray";
  return <Badge tone={tone}>{METHOD_LABEL[method] ?? "Other"}</Badge>;
}

export function DeliveryBadge({ progress, status }) {
  if (status === "cancelled") return <span className="text-xs text-steel-400">—</span>;
  const { ordered, delivered, state } = progress;
  const tone = state === "full" ? "green" : state === "partial" ? "amber" : "gray";
  return <Badge tone={tone}>{delivered}/{ordered}</Badge>;
}
