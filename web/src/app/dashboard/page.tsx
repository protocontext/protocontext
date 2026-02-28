"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Key, Check, Copy, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sidebar, type PanelId } from "@/components/dashboard/Sidebar";
import { SearchPanel } from "@/components/dashboard/panels/SearchPanel";
import { SitePanel } from "@/components/dashboard/panels/SitePanel";
import { ScraperPanel } from "@/components/dashboard/panels/ScraperPanel";
import { EditorPanel } from "@/components/dashboard/panels/EditorPanel";
import { DeletePanel } from "@/components/dashboard/panels/DeletePanel";
import { KeysPanel } from "@/components/dashboard/panels/KeysPanel";
import { ApiReferencePanel } from "@/components/dashboard/panels/ApiReferencePanel";
import { StatsPanel } from "@/components/dashboard/panels/StatsPanel";
import { AnalyticsPanel } from "@/components/dashboard/panels/AnalyticsPanel";
import * as api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function Dashboard() {
  const router = useRouter();
  const { isLoading: authLoading, needsSetup, isAuthenticated, legacyMode, apiUnreachable, refreshAuth } = useAuth();

  useEffect(() => {
    if (!authLoading && !apiUnreachable) {
      if (needsSetup) router.replace("/setup");
      else if (!isAuthenticated && !legacyMode) router.replace("/login");
    }
  }, [authLoading, needsSetup, isAuthenticated, legacyMode, apiUnreachable, router]);

  const [activePanel, setActivePanel] = useState<PanelId>("search");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Cross-panel edit flow: Site → Editor
  const [editorName, setEditorName] = useState("");
  const [editorContent, setEditorContent] = useState("");

  async function handleLogout() {
    await api.authLogout();
    await refreshAuth();
    router.replace("/login");
  }

  function handleCopyToken() {
    const token = api.getToken();
    if (token) {
      navigator.clipboard.writeText(token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  }

  async function handleEditContent(domain: string) {
    const res = await api.getContent(domain);
    setEditorName(res.domain);
    setEditorContent(res.content);
    setActivePanel("editor");
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

  if (authLoading || needsSetup || (!isAuthenticated && !legacyMode)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentToken = api.getToken();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Dot grid background */}
      <div
        className="fixed inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto lg:flex
        transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <Sidebar
          activePanel={activePanel}
          onSelect={(id) => { setActivePanel(id); setSidebarOpen(false); }}
          legacyMode={legacyMode}
          onLogout={handleLogout}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-border/40 shrink-0">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
          <span className="font-semibold text-sm tracking-tight">ProtoContext</span>
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono text-muted-foreground">beta</Badge>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

            {/* Admin token banner — hidden on editor panel */}
            {currentToken && !legacyMode && activePanel !== "editor" && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-4">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Key className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold">Admin Token</h3>
                        <button
                          onClick={handleCopyToken}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
                        >
                          {tokenCopied
                            ? <><Check className="w-3 h-3 text-primary" /><span className="text-primary">Copied</span></>
                            : <><Copy className="w-3 h-3" /><span>Copy</span></>
                          }
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        Use this token for API requests and MCP server connections.
                      </p>
                      <div className="bg-background/60 border border-border/40 rounded-md px-3 py-2 font-mono text-xs text-foreground/70 break-all leading-relaxed">
                        {currentToken}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Active panel */}
            {activePanel === "search" && <SearchPanel />}
            {activePanel === "site" && <SitePanel onEditContent={handleEditContent} />}
            {activePanel === "scraper" && <ScraperPanel />}
            {activePanel === "editor" && (
              <EditorPanel
                initialName={editorName}
                initialContent={editorContent}
              />
            )}
            {activePanel === "delete" && <DeletePanel />}
            {activePanel === "keys" && <KeysPanel />}
            {activePanel === "api" && <ApiReferencePanel />}
            {activePanel === "stats" && <StatsPanel />}
            {activePanel === "analytics" && <AnalyticsPanel />}
          </div>
        </div>
      </main>
    </div>
  );
}
