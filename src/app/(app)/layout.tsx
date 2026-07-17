"use client";

import { BottomNav } from "@/components/BottomNav";
import { useApp } from "@/lib/app-context";
import { useReminders } from "@/hooks/useReminders";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, demoMode } = useApp();
  const router = useRouter();
  useReminders();

  useEffect(() => {
    if (loading) return;
    if (!user && !demoMode) {
      router.replace("/login");
    }
  }, [user, loading, demoMode, router]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <p className="font-display text-2xl text-teal-900">MyWitness</p>
          <p className="mt-2 text-sm text-stone-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user && !demoMode && isSupabaseConfigured()) {
    return null;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      {demoMode && (
        <div className="safe-top bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
          Demo mode — fictional sample data
        </div>
      )}
      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
      <BottomNav />
    </div>
  );
}
