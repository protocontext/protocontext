"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Terminal, Loader2, AlertCircle, Copy, Check, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import * as api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { needsSetup, isLoading, isAuthenticated, apiUnreachable, refreshAuth } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Token dialog state
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [copied, setCopied] = useState(false);

  // Redirect if already authenticated or needs setup (but NOT if API is down)
  useEffect(() => {
    if (!isLoading && !apiUnreachable) {
      if (needsSetup) router.replace("/setup");
      else if (isAuthenticated) router.replace("/dashboard");
    }
  }, [isLoading, needsSetup, isAuthenticated, apiUnreachable, router]);

  function handleCopyToken() {
    navigator.clipboard.writeText(adminToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleContinue() {
    setShowTokenDialog(false);
    router.replace("/dashboard");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !email.includes("@")) {
      setError("Valid email required");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await api.authLogin({ email: email.trim(), password });
      await refreshAuth();
      // Show token dialog instead of redirecting immediately
      setAdminToken(data.token);
      setShowTokenDialog(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (apiUnreachable) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto px-6">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Cannot reach the API</h2>
          <p className="text-sm text-muted-foreground mb-1">
            The engine at <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">localhost:8000</code> is not responding.
          </p>
          <p className="text-xs text-muted-foreground/60 mb-6">
            Make sure <code className="font-mono">docker compose up</code> is running.
          </p>
          <Button onClick={refreshAuth} variant="outline" size="sm" className="gap-1.5 text-xs">
            <Loader2 className="w-3 h-3" />
            Retry connection
          </Button>
        </div>
      </div>
    );
  }

  if (needsSetup || isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 space-y-6">
          {/* Logo + title */}
          <div className="text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <Terminal className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold">ProtoContext</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Token Dialog */}
      <Dialog open={showTokenDialog} onOpenChange={(open) => { if (!open) handleContinue(); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-2">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle className="text-center">Your Admin Token</DialogTitle>
            <DialogDescription className="text-center">
              Use this token to authenticate API requests and MCP connections.
            </DialogDescription>
          </DialogHeader>

          <div className="relative group">
            <div className="bg-muted/30 border border-border/40 rounded-lg p-3 pr-12 font-mono text-xs break-all text-foreground/80 leading-relaxed">
              {adminToken}
            </div>
            <button
              onClick={handleCopyToken}
              className="absolute top-2 right-2 p-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
          </div>

          <DialogFooter>
            <Button onClick={handleContinue} className="w-full">
              Continue to Dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
