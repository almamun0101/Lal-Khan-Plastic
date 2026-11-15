"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Factory, Gauge } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { firebaseConfigMissing } from "@/lib/firebase";
import { explainFirebaseError } from "@/lib/firebase-error-hints";

function LoginPage() {
  const { login, resetPassword, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e) {
    e.preventDefault();
    if (firebaseConfigMissing) {
      toast.error("Firebase isn't configured on this deployment (see the notice above).");
      return;
    }
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      router.replace("/dashboard");
    } catch (err) {
      toast.error(explainFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgot() {
    if (!email.trim()) {
      toast.error("Type your email above first, then press \"Forgot password\".");
      return;
    }
    try {
      await resetPassword(email);
      toast.success("If that account exists, a password-reset email is on its way.");
    } catch (err) {
      toast.error(explainFirebaseError(err));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-steel-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-instrument-600">
            <Factory className="h-7 w-7 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold text-white">Business Control Panel</h1>
          <p className="mt-1 text-sm text-steel-400">Sign in to manage clients, orders and production</p>
        </div>

        {firebaseConfigMissing && (
          <div className="mb-4 rounded-panel border border-danger/40 bg-danger/10 p-4 text-sm text-red-200">
            <p className="font-semibold">Firebase isn't configured on this deployment.</p>
            <p className="mt-1">
              The NEXT_PUBLIC_FIREBASE_* environment variables were missing when this site was built. Add all six in your host's
              environment settings (Netlify: Site configuration → Environment variables), then redeploy with "Clear cache and deploy site".
            </p>
          </div>
        )}
        <form onSubmit={onSubmit} className="rounded-panel border border-steel-800 bg-steel-900 p-6 shadow-panel-dark">
          <div className="mb-4">
            <Label className="text-steel-400">Email</Label>
            <Input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="border-steel-700 bg-steel-950 text-steel-100" />
          </div>
          <div className="mb-6">
            <Label className="text-steel-400">Password</Label>
            <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="border-steel-700 bg-steel-950 text-steel-100" />
          </div>
          <Button type="submit" loading={submitting} className="w-full justify-center">
            <Gauge className="h-4 w-4" />
            Sign In
          </Button>
          <button type="button" onClick={onForgot} className="mt-3 w-full text-center text-xs text-steel-400 hover:text-steel-200">
            Forgot password?
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-steel-500">Accounts are created by an administrator in the Firebase console.</p>
      </div>
    </div>
  );
}
export { LoginPage as default };
