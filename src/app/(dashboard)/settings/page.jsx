"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";
import { WEEK_START_OPTIONS } from "@/lib/constants";
import { errorMessage } from "@/lib/firestore-service";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

const CURRENCIES = ["BDT", "USD", "EUR", "GBP", "INR"];

export default function SettingsPage() {
  const { settings, updateSettings, loading } = useSettings();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!loading && !synced) {
      setForm(settings);
      setSynced(true);
    }
  }, [loading, synced, settings]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function handleSave() {
    const nums = { opening_balance: form.opening_balance, credit_days: form.credit_days, low_cash_threshold: form.low_cash_threshold };
    for (const [k, v] of Object.entries(nums)) {
      if (v === "" || !Number.isFinite(Number(v))) return toast.error("Please enter valid numbers in the finance settings.");
    }
    if (Number(form.credit_days) < 0 || Number(form.low_cash_threshold) < 0) return toast.error("Credit days and the cash minimum can't be negative.");
    setSaving(true);
    try {
      await updateSettings({
        ...form,
        opening_balance: Number(form.opening_balance),
        credit_days: Math.round(Number(form.credit_days)),
        low_cash_threshold: Number(form.low_cash_threshold),
        week_starts_on: Number(form.week_starts_on),
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errorMessage(err, "Could not save settings"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" description="Business details, money rules, shifts and appearance." />

      <Card>
        <CardHeader><CardTitle>Business</CardTitle></CardHeader>
        <CardBody className="space-y-4">
          <div><Label>Business / factory name</Label><Input value={form.factory_name} onChange={set("factory_name")} /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><Label>Phone (on invoices)</Label><Input value={form.business_phone ?? ""} onChange={set("business_phone")} /></div>
            <div><Label>Currency</Label><Select value={form.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
          </div>
          <div><Label>Address (on invoices)</Label><Textarea rows={2} value={form.business_address ?? ""} onChange={set("business_address")} /></div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Money rules</CardTitle></CardHeader>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Opening cash balance</Label>
            <Input type="number" step="0.01" value={form.opening_balance} onChange={set("opening_balance")} />
            <p className="mt-1 text-xs text-steel-400">Cash you already had before you started recording payments here. Available cash = this + received − spent.</p>
          </div>
          <div>
            <Label>Default payment terms (days)</Label>
            <Input type="number" min="0" step="1" value={form.credit_days} onChange={set("credit_days")} />
            <p className="mt-1 text-xs text-steel-400">New orders get a due date this many days after the order date. Unpaid orders past it are flagged overdue.</p>
          </div>
          <div>
            <Label>Low-cash alert below</Label>
            <Input type="number" min="0" step="0.01" value={form.low_cash_threshold} onChange={set("low_cash_threshold")} />
            <p className="mt-1 text-xs text-steel-400">0 turns this alert off.</p>
          </div>
          <div>
            <Label>Week starts on</Label>
            <Select value={form.week_starts_on} onChange={set("week_starts_on")}>{WEEK_START_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
            <p className="mt-1 text-xs text-steel-400">Used by the weekly analytics report.</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Shift schedule</CardTitle></CardHeader>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><Label>Day shift starts</Label><Input type="time" value={form.day_shift_start} onChange={set("day_shift_start")} /></div>
          <div><Label>Night shift starts</Label><Input type="time" value={form.night_shift_start} onChange={set("night_shift_start")} /></div>
          <p className="text-xs text-steel-400 sm:col-span-2">The production entry form uses these times to auto-detect the current shift.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
        <CardBody>
          <Label>Theme</Label>
          <Select value={form.theme} onChange={set("theme")}>
            <option value="system">Match System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </CardBody>
      </Card>

      <Button onClick={handleSave} loading={saving} size="lg">Save Settings</Button>
    </div>
  );
}
