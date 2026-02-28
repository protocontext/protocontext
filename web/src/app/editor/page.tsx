"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorPanel } from "@/components/dashboard/panels/EditorPanel";
import { useAuth } from "@/lib/auth-context";

export default function EditorPage() {
  const router = useRouter();
  const {
    isLoading: authLoading,
    needsSetup,
    isAuthenticated,
    legacyMode,
    apiUnreachable,
    refreshAuth,
  } = useAuth();

  useEffect(() => {
    if (!authLoading && !apiUnreachable) {
      if (needsSetup) router.replace("/setup");
      else if (!isAuthenticated && !legacyMode) router.replace("/login");
    }
  }, [authLoading, needsSetup, isAuthenticated, legacyMode, apiUnreachable, router]);

  if (apiUnreachable) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto px-6">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Cannot reach the API</h2>
          <p className="text-sm text-muted-foreground mb-1">
            The engine at{" "}
            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">localhost:8000</code>{" "}
            is not responding.
          </p>
          <Button onClick={refreshAuth} variant="outline" size="sm" className="gap-1.5 text-xs mt-5">
            <Loader2 className="w-3 h-3" />
            Retry connection
          </Button>
        </div>
      </div>
    );
  }

  if (authLoading || needsSetup || (!isAuthenticated && !legacyMode)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <EditorPanel />
      </div>
    </main>
  );
}
