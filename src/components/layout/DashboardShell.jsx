"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { firebaseConfigMissing } from "@/lib/firebase";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { DiagnosticsBanner } from "./DiagnosticsBanner";

function DashboardShell({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-steel-50 dark:bg-steel-950">
        <Loader2 className="h-6 w-6 animate-spin text-instrument-500" />
      </div>
    );
  }
  return (
    <DataProvider>
      <div className="flex min-h-screen bg-steel-50 dark:bg-steel-950">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Navbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 p-4 lg:p-8">
            {firebaseConfigMissing && (
              <div className="mb-4 flex gap-3 rounded-panel border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p>Firebase isn't configured on this deployment. Add the six NEXT_PUBLIC_FIREBASE_* environment variables and redeploy.</p>
              </div>
            )}
            <DiagnosticsBanner />
            {children}
          </main>
        </div>
      </div>
    </DataProvider>
  );
}
export { DashboardShell };
