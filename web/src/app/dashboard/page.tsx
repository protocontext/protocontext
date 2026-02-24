"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Globe, Send, BarChart3, Zap, Clock, FileText, Loader2,
  AlertCircle, CheckCircle2, Settings2, Code2, Copy,
  Check, Trash2, Terminal, BookOpen, Github, Shield, LogOut, Key, Plus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import * as api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

// Provider presets
const PROVIDERS = [
  { value: "none", label: "No AI (context.txt only)" },
  { value: "gemini", label: "Gemini", defaultModel: "gemini/gemini-3-flash-preview" },
  { value: "openai", label: "OpenAI", defaultModel: "openai/gpt-4o-mini" },
  { value: "openrouter", label: "OpenRouter", defaultModel: "openrouter/google/gemini-3-flash-preview" },
];

// Supported languages for filtering
const LANGUAGES = [
  { value: "all", label: "All languages" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "de", label: "Deutsch" },
  { value: "pt", label: "Português" },
  { value: "pl", label: "Polski" },
  { value: "zh", label: "中文" },
  { value: "fi", label: "Suomi" },
  { value: "sv", label: "Svenska" },
  { value: "no", label: "Norsk" },
  { value: "da", label: "Dansk" },
  { value: "ja", label: "日本語" },
];

// PCE unified category filter — all map to content_type
const CATEGORIES = [
  { value: "all",         label: "All categories" },
  { value: "website",     label: "🌐 Website" },
  { value: "other",       label: "📁 Other" },
  { value: "hospitality", label: "🏨 Hospitality" },
  { value: "ecommerce",   label: "🛒 Ecommerce" },
  { value: "tours",       label: "🗺️ Tours" },
  { value: "room",        label: "🛏️ Rooms" },
  { value: "product",     label: "📦 Products" },
  { value: "tour",        label: "🎫 Experiences" },
  { value: "action",      label: "⚡ Actions" },
  { value: "policy",      label: "📋 Policies" },
];

// PCE content type badge colors
const CONTENT_TYPE_COLORS: Record<string, string> = {
  website: "border-border/40 text-muted-foreground",
  other: "border-border/40 text-muted-foreground",
  hospitality: "border-orange-500/30 text-orange-600 dark:text-orange-400",
  ecommerce: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  tours: "border-cyan-500/30 text-cyan-600 dark:text-cyan-400",
  product: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  room: "border-blue-500/30 text-blue-600 dark:text-blue-400",
  tour: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  action: "border-violet-500/30 text-violet-600 dark:text-violet-400",
  policy: "border-rose-500/30 text-rose-600 dark:text-rose-400",
};

export default function Dashboard() {
  const router = useRouter();
  const { isLoading: authLoading, needsSetup, isAuthenticated, legacyMode, apiUnreachable, refreshAuth } = useAuth();

  // Redirect to setup or login if not authenticated (but NOT if API is down)
  useEffect(() => {
    if (!authLoading && !apiUnreachable) {
      if (needsSetup) router.replace("/setup");
      else if (!isAuthenticated && !legacyMode) router.replace("/login");
    }
  }, [authLoading, needsSetup, isAuthenticated, legacyMode, apiUnreachable, router]);

  const [activeTab, setActiveTab] = useState("search");

  // Token copy state
  const [tokenCopied, setTokenCopied] = useState(false);

  // Search state
  const [query, setQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [langFilter, setLangFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchResults, setSearchResults] = useState<api.SearchResult[]>([]);
  const [searchLatency, setSearchLatency] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Site state
  const [siteDomain, setSiteDomain] = useState("");
  const [siteResults, setSiteResults] = useState<api.SearchResult[]>([]);
  const [siteTotalSections, setSiteTotalSections] = useState(0);
  const [siteLatency, setSiteLatency] = useState<number | null>(null);
  const [isFetchingSite, setIsFetchingSite] = useState(false);
  const [siteError, setSiteError] = useState("");

  // Submit state
  const [submitDomain, setSubmitDomain] = useState("");
  const [submitResult, setSubmitResult] = useState<api.SubmitResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitMessage, setSubmitMessage] = useState("");

  // Delete state
  const [deleteDomainInput, setDeleteDomainInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<api.DeleteResponse | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // API Keys state
  const [apiKeys, setApiKeys] = useState<api.ApiKeyInfo[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);

  // AI provider settings (persisted server-side in SQLite)
  const [provider, setProvider] = useState("none");
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load saved AI config from server on mount
  useEffect(() => {
    api.getSettings().then((s) => {
      if (s.ai_provider) setProvider(s.ai_provider);
      if (s.ai_key) setAiKey(s.ai_key);
      if (s.ai_model) setAiModel(s.ai_model);
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, []);

  // Persist AI config to server on change (skip initial load)
  const settingsChangedRef = useRef(false);
  useEffect(() => {
    if (!settingsLoaded) return;
    if (!settingsChangedRef.current) {
      settingsChangedRef.current = true;
      return; // skip first run after load
    }
    api.saveSettings({ ai_provider: provider, ai_key: aiKey, ai_model: aiModel }).catch(() => {});
  }, [provider, aiKey, aiModel, settingsLoaded]);

  // Stats state
  const [stats, setStats] = useState<api.StatsResponse | null>(null);
  const [health, setHealth] = useState<api.HealthResponse | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const [s, h] = await Promise.all([api.getStats(), api.getHealth()]);
      setStats(s);
      setHealth(h);
    } catch {
      // silently fail - API might not be running
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // Fetch stats on mount
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Also reload stats when stats tab opens
  useEffect(() => {
    if (activeTab === "stats") {
      loadStats();
    }
  }, [activeTab, loadStats]);

  const getAiParams = useCallback(() => {
    if (provider === "none" || !aiKey) return {};
    const selectedProvider = PROVIDERS.find((p) => p.value === provider);
    return {
      ai_key: aiKey,
      ai_model: aiModel || selectedProvider?.defaultModel || "",
    };
  }, [provider, aiKey, aiModel]);

  // Resolve category filter → { content_type? }
  const getCategoryParams = useCallback(() => {
    if (categoryFilter === "all") return {};
    return { content_type: categoryFilter };
  }, [categoryFilter]);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setSearchError("");
    setSearchResults([]);
    setSearchLatency(null);

    try {
      const res = await api.search({
        q: query,
        domain: domainFilter || undefined,
        lang: langFilter !== "all" ? langFilter : undefined,
        ...getCategoryParams(),
        ...getAiParams(),
      });
      setSearchResults(res.results);
      setSearchLatency(res.latency_ms);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSiteFetch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!siteDomain.trim()) return;

    setIsFetchingSite(true);
    setSiteError("");
    setSiteResults([]);
    setSiteTotalSections(0);
    setSiteLatency(null);

    try {
      const res = await api.getSite({
        domain: siteDomain,
        lang: langFilter !== "all" ? langFilter : undefined,
        ...getCategoryParams(),
        ...getAiParams(),
      });
      setSiteResults(res.sections);
      setSiteTotalSections(res.total_sections);
      setSiteLatency(res.latency_ms);
    } catch (err) {
      setSiteError(err instanceof Error ? err.message : "Site fetch failed");
    } finally {
      setIsFetchingSite(false);
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!submitDomain.trim()) return;

    setIsSubmitting(true);
    setSubmitError("");
    setSubmitResult(null);
    setSubmitProgress(0);
    setSubmitMessage("Starting...");

    try {
      const res = await api.submitDomainStream(
        { domain: submitDomain, ...getAiParams() },
        (event) => {
          if (event.message) setSubmitMessage(event.message);
          if (event.progress !== undefined) setSubmitProgress(event.progress);
          if (event.step === "checking") setSubmitProgress((prev) => Math.min(prev + 5, 20));
          if (event.step === "found") setSubmitProgress(50);
          if (event.step === "indexing") setSubmitProgress(95);
        },
      );
      setSubmitResult(res);
      setSubmitProgress(100);
      setSubmitMessage("Done!");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(e?: React.FormEvent) {
    e?.preventDefault();
    if (!deleteDomainInput.trim()) return;

    setIsDeleting(true);
    setDeleteError("");
    setDeleteResult(null);

    try {
      const res = await api.deleteDomain({ domain: deleteDomainInput });
      setDeleteResult(res);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  }

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

  // --- API Key management ---

  const loadApiKeys = useCallback(async () => {
    setIsLoadingKeys(true);
    try {
      const keys = await api.listApiKeys();
      setApiKeys(keys);
    } catch {
      // silently fail
    } finally {
      setIsLoadingKeys(false);
    }
  }, []);

  // Load keys when the keys tab opens
  useEffect(() => {
    if (activeTab === "keys") {
      loadApiKeys();
    }
  }, [activeTab, loadApiKeys]);

  async function handleCreateKey(e?: React.FormEvent) {
    e?.preventDefault();
    setIsCreatingKey(true);
    setKeyError("");
    setNewlyCreatedKey(null);

    try {
      const result = await api.createApiKey(newKeyName.trim());
      setNewlyCreatedKey(result.key || null);
      setNewKeyName("");
      await loadApiKeys();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setIsCreatingKey(false);
    }
  }

  async function handleRevokeKey(keyId: number) {
    setKeyError("");
    try {
      await api.revokeApiKey(keyId);
      await loadApiKeys();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Failed to revoke key");
    }
  }

  function handleCopyNewKey() {
    if (newlyCreatedKey) {
      navigator.clipboard.writeText(newlyCreatedKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  }

  // API unreachable — show error with retry
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

  // Show loading while checking auth
  if (authLoading || needsSetup || (!isAuthenticated && !legacyMode)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentToken = api.getToken();

  return (
    <div className="min-h-screen bg-background relative">
      {/* Dot grid background */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Navigation */}
      <nav className="border-b border-border/40 backdrop-blur-md sticky top-0 z-50 bg-background/70">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Terminal className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-semibold text-sm tracking-tight">ProtoContext</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono text-muted-foreground border-border/60">
              v0.1.1 beta
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <a href="https://github.com/protocontext/protocontext/blob/main/SPEC.md" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Spec</span>
              </Button>
            </a>
            <a href="https://github.com/protocontext/protocontext" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                <Github className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">GitHub</span>
              </Button>
            </a>
            {!legacyMode && (
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground" onClick={handleLogout}>
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* ======================== */}
        {/* ADMIN TOKEN CARD         */}
        {/* ======================== */}
        {currentToken && !legacyMode && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-5 pb-5">
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
                      {tokenCopied ? (
                        <>
                          <Check className="w-3 h-3 text-primary" />
                          <span className="text-primary">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
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

        {/* ======================== */}
        {/* QUICK STATS              */}
        {/* ======================== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Documents" value={stats?.total_documents ?? "—"} icon={<FileText className="w-4 h-4" />} />
          <StatCard label="Domains" value={stats?.registered_domains ?? "—"} icon={<Globe className="w-4 h-4" />} />
          <StatCard label="Cached" value={stats?.cached_domains ?? "—"} icon={<Zap className="w-4 h-4" />} />
          <StatCard
            label="Engine"
            value={health?.status === "ok" ? "Online" : "—"}
            icon={
              <div className={`w-2 h-2 rounded-full ${health?.status === "ok" ? "bg-primary animate-pulse-glow" : "bg-muted-foreground/30"}`} />
            }
          />
        </div>

        {/* ======================== */}
        {/* TOOLS TABS               */}
        {/* ======================== */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold tracking-tight">Tools</h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground gap-1.5"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings2 className="w-3.5 h-3.5" />
              {provider === "none" ? "Configure AI" : `${PROVIDERS.find(p => p.value === provider)?.label}`}
            </Button>
          </div>

          {showSettings && (
            <div className="mb-6 p-4 bg-card/30 border border-border/40 rounded-lg animate-fade-up">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Provider</Label>
                  <Select value={provider} onValueChange={(v) => {
                    setProvider(v);
                    const p = PROVIDERS.find((pr) => pr.value === v);
                    if (p && "defaultModel" in p) setAiModel(p.defaultModel as string);
                    else setAiModel("");
                  }}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((p) => (
                        <SelectItem key={p.value} value={p.value} className="text-xs">
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {provider !== "none" && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">API Key</Label>
                      <Input
                        type="password"
                        placeholder="Your API key..."
                        className="h-8 text-xs font-mono"
                        value={aiKey}
                        onChange={(e) => setAiKey(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Model</Label>
                      <Input
                        placeholder={PROVIDERS.find((p) => p.value === provider)?.defaultModel}
                        className="h-8 text-xs font-mono"
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
              {provider !== "none" && (
                <p className="text-[10px] text-muted-foreground/60 mt-2 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Your key is saved on the server and sent per-request via secure headers.
                </p>
              )}
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList variant="line" className="mb-6">
              <TabsTrigger value="search" className="text-xs gap-1.5 px-3">
                <Search className="w-3.5 h-3.5" />
                Search
              </TabsTrigger>
              <TabsTrigger value="site" className="text-xs gap-1.5 px-3">
                <Globe className="w-3.5 h-3.5" />
                Site
              </TabsTrigger>
              <TabsTrigger value="submit" className="text-xs gap-1.5 px-3">
                <Send className="w-3.5 h-3.5" />
                Submit
              </TabsTrigger>
              <TabsTrigger value="delete" className="text-xs gap-1.5 px-3">
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </TabsTrigger>
              {!legacyMode && (
                <TabsTrigger value="keys" className="text-xs gap-1.5 px-3">
                  <Key className="w-3.5 h-3.5" />
                  Keys
                </TabsTrigger>
              )}
              <TabsTrigger value="api" className="text-xs gap-1.5 px-3">
                <Code2 className="w-3.5 h-3.5" />
                API
              </TabsTrigger>
              <TabsTrigger value="stats" className="text-xs gap-1.5 px-3">
                <BarChart3 className="w-3.5 h-3.5" />
                Stats
              </TabsTrigger>
            </TabsList>

            {/* Search Tab */}
            <TabsContent value="search" className="space-y-4">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search across all indexed sites..."
                    className="pl-9 h-10"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <Input
                  placeholder="Filter domain"
                  className="w-48 h-10 hidden sm:block"
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value)}
                />
                <Select value={langFilter} onValueChange={setLangFilter}>
                  <SelectTrigger className="w-36 h-10 text-xs hidden sm:flex">
                    <SelectValue placeholder="All languages" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value} className="text-xs">
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-40 h-10 text-xs hidden sm:flex">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value} className="text-xs">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={isSearching || !query.trim()} className="h-10 px-5">
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                </Button>
              </form>

              <div className="sm:hidden space-y-2">
                <Input
                  placeholder="Filter by domain (optional)"
                  className="h-9"
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value)}
                />
                <div className="flex gap-2">
                  <Select value={langFilter} onValueChange={setLangFilter}>
                    <SelectTrigger className="h-9 text-xs flex-1">
                      <SelectValue placeholder="All languages" />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={`m-${l.value}`} value={l.value} className="text-xs">
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-9 text-xs flex-1">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={`m-${c.value}`} value={c.value} className="text-xs">
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {searchError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {searchError}
                </div>
              )}

              {searchLatency !== null && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-mono">
                    <Zap className="w-3 h-3 text-primary" />
                    {searchLatency}ms
                  </span>
                  <span>{searchResults.length} results</span>
                </div>
              )}

              <div className="space-y-2">
                {searchResults.map((r, i) => (
                  <ResultCard key={`${r.domain}-${r.section}-${i}`} result={r} index={i} />
                ))}
              </div>

              {searchLatency !== null && searchResults.length === 0 && !searchError && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No results found. Try a different query or submit the domain first.
                </div>
              )}
            </TabsContent>

            {/* Site Tab */}
            <TabsContent value="site" className="space-y-4">
              <form onSubmit={handleSiteFetch} className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="www.example.com"
                    className="pl-9 h-10"
                    value={siteDomain}
                    onChange={(e) => setSiteDomain(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={isFetchingSite || !siteDomain.trim()} className="h-10 px-5">
                  {isFetchingSite ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fetch"}
                </Button>
              </form>

              <p className="text-xs text-muted-foreground">
                Retrieve all context sections for a domain. With an AI key, unindexed sites are fetched in real-time.
              </p>

              {siteError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {siteError}
                </div>
              )}

              {siteLatency !== null && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-mono">
                    <Zap className="w-3 h-3 text-primary" />
                    {siteLatency}ms
                  </span>
                  <span>{siteTotalSections} sections</span>
                </div>
              )}

              <div className="space-y-2">
                {siteResults.map((r, i) => (
                  <ResultCard key={`${r.domain}-${r.section}-${i}`} result={r} index={i} />
                ))}
              </div>
            </TabsContent>

            {/* Submit Tab */}
            <TabsContent value="submit" className="space-y-4">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Send className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="yourdomain.com"
                    className="pl-9 h-10"
                    value={submitDomain}
                    onChange={(e) => setSubmitDomain(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <Button type="submit" disabled={isSubmitting || !submitDomain.trim()} className="h-10 px-5">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
                </Button>
              </form>

              <p className="text-xs text-muted-foreground">
                Register a domain to the index. Sites with /context.txt work directly. Others need an AI provider to convert content.
              </p>

              {isSubmitting && (
                <div className="space-y-2 animate-fade-up">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                    <span className="text-xs text-muted-foreground">{submitMessage}</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${submitProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground/60 font-mono">
                    <span>
                      {submitProgress < 20 && "checking sources..."}
                      {submitProgress >= 20 && submitProgress < 50 && "fetching content..."}
                      {submitProgress >= 50 && submitProgress < 75 && "scraping pages..."}
                      {submitProgress >= 75 && submitProgress < 95 && "converting with AI..."}
                      {submitProgress >= 95 && "indexing..."}
                    </span>
                    <span>{submitProgress}%</span>
                  </div>
                </div>
              )}

              {submitError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {submitError}
                </div>
              )}

              {submitResult && (
                <Card className="border-primary/20 bg-primary/5 animate-fade-up">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {submitResult.status === "registered" ? "Domain registered" : "Already registered"}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{submitResult.domain}</span>
                          {submitResult.sections_indexed && (
                            <>
                              <span>&middot;</span>
                              <span>{submitResult.sections_indexed} sections</span>
                            </>
                          )}
                          {submitResult.source_format && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono border-border/40">
                              {submitResult.source_format}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Delete Tab */}
            <TabsContent value="delete" className="space-y-4">
              <form onSubmit={handleDelete} className="flex gap-2">
                <div className="relative flex-1">
                  <Trash2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="domain-to-remove.com"
                    className="pl-9 h-10"
                    value={deleteDomainInput}
                    onChange={(e) => setDeleteDomainInput(e.target.value)}
                    disabled={isDeleting}
                  />
                </div>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isDeleting || !deleteDomainInput.trim()}
                  className="h-10 px-5"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                </Button>
              </form>

              <p className="text-xs text-muted-foreground">
                Remove a domain from the index and registry. This deletes all indexed sections permanently.
              </p>

              {deleteError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {deleteError}
                </div>
              )}

              {deleteResult && (
                <Card className="border-destructive/20 bg-destructive/5 animate-fade-up">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Domain deleted</p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{deleteResult.domain}</span>
                          <span>&middot;</span>
                          <span>{deleteResult.sections_deleted} sections removed</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Keys Tab */}
            <TabsContent value="keys" className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold mb-1">API Keys</h2>
                <p className="text-xs text-muted-foreground">
                  Generate API keys for programmatic access (MCP servers, n8n, scripts). Keys authenticate like your admin token but can be individually revoked.
                </p>
              </div>

              {/* Create new key */}
              <form onSubmit={handleCreateKey} className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Key label (e.g. mcp-server, n8n)..."
                    className="pl-9 h-10"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    disabled={isCreatingKey}
                  />
                </div>
                <Button type="submit" disabled={isCreatingKey} className="h-10 px-5 gap-1.5">
                  {isCreatingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Generate</>}
                </Button>
              </form>

              {keyError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {keyError}
                </div>
              )}

              {/* Newly created key (shown once) */}
              {newlyCreatedKey && (
                <Card className="border-primary/20 bg-primary/5 animate-fade-up">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Key created — copy it now!</p>
                          <button
                            onClick={handleCopyNewKey}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
                          >
                            {keyCopied ? (
                              <><Check className="w-3 h-3 text-primary" /><span className="text-primary">Copied</span></>
                            ) : (
                              <><Copy className="w-3 h-3" /><span>Copy</span></>
                            )}
                          </button>
                        </div>
                        <div className="bg-background/60 border border-border/40 rounded-md px-3 py-2 font-mono text-xs text-foreground/70 break-all leading-relaxed">
                          {newlyCreatedKey}
                        </div>
                        <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          This key is shown only once. Store it securely — it cannot be retrieved later.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Key list */}
              {isLoadingKeys ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No API keys yet. Generate one above to get started.
                </div>
              ) : (
                <div className="space-y-2">
                  {apiKeys.map((k) => (
                    <Card
                      key={k.id}
                      className={`bg-card/50 ${!k.is_active ? "opacity-50" : ""}`}
                    >
                      <CardContent className="pt-3 pb-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium truncate">
                                {k.name || "Unnamed key"}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] h-4 px-1.5 font-mono border-border/40 shrink-0 ${
                                  k.is_active ? "text-primary border-primary/30" : "text-muted-foreground"
                                }`}
                              >
                                {k.is_active ? "active" : "revoked"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
                              <span>{k.key_prefix}•••</span>
                              <span className="text-muted-foreground/40">
                                created {new Date(k.created_at).toLocaleDateString()}
                              </span>
                              {k.last_used_at && (
                                <span className="text-muted-foreground/40">
                                  used {new Date(k.last_used_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          {k.is_active && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
                              onClick={() => handleRevokeKey(k.id)}
                            >
                              <X className="w-3 h-3" />
                              Revoke
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* API Tab */}
            <TabsContent value="api" className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">API Reference</h2>
                <p className="text-xs text-muted-foreground">
                  All endpoints available at your engine URL. Protected endpoints require your token via the <code className="font-mono text-foreground/70 bg-muted/40 px-1 py-0.5 rounded">x-proto-token</code> header.
                </p>
              </div>

              {/* Authentication info */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-4 pb-4">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-primary" />
                    Authentication
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    All protected endpoints require a token sent via the <code className="font-mono text-foreground/70 bg-muted/40 px-1 py-0.5 rounded">x-proto-token</code> header. You can use your <strong>admin session token</strong> (shown above) or an <strong>API key</strong> generated via <code className="font-mono text-foreground/70 bg-muted/40 px-1 py-0.5 rounded">POST /api-keys</code>.
                  </p>
                  <CodeBlock code={`# Example: authenticated request
curl "http://localhost:8000/stats" \\
  -H "x-proto-token: YOUR_TOKEN_HERE"`} />
                </CardContent>
              </Card>

              {/* Search & Data endpoints */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Search & Data</h3>
                <div className="space-y-3">
                  <ApiEndpoint
                    method="GET" path="/search" description="Full-text search across all indexed sites"
                    params={[
                      { name: "q", type: "string", required: true, desc: "Search query" },
                      { name: "domain", type: "string", required: false, desc: "Filter by domain" },
                      { name: "limit", type: "int", required: false, desc: "Max results (default 10)" },
                    ]}
                    curl={`curl "http://localhost:8000/search?q=payments&limit=5" \\
  -H "x-proto-token: YOUR_TOKEN"`}
                    curlAi={`curl "http://localhost:8000/search?q=payments" \\
  -H "x-proto-token: YOUR_TOKEN" \\
  -H "x-ai-key: YOUR_KEY" -H "x-ai-model: gemini/gemini-3-flash-preview"`}
                  />
                  <ApiEndpoint
                    method="GET" path="/site" description="Get all context sections for a domain"
                    params={[{ name: "domain", type: "string", required: true, desc: "Domain to retrieve" }]}
                    curl={`curl "http://localhost:8000/site?domain=stripe.com" \\
  -H "x-proto-token: YOUR_TOKEN"`}
                  />
                  <ApiEndpoint
                    method="POST" path="/submit" description="Submit a new domain to the index"
                    params={[
                      { name: "domain", type: "string", required: true, desc: "Domain to register" },
                      { name: "ai_key", type: "string", required: false, desc: "AI provider key" },
                      { name: "ai_model", type: "string", required: false, desc: "Model in provider/name format" },
                    ]}
                    curl={`curl -X POST http://localhost:8000/submit \\
  -H "Content-Type: application/json" \\
  -H "x-proto-token: YOUR_TOKEN" \\
  -d '{"domain": "example.com"}'`}
                  />
                  <ApiEndpoint
                    method="POST" path="/delete" description="Remove a domain from the index"
                    params={[{ name: "domain", type: "string", required: true, desc: "Domain to delete" }]}
                    curl={`curl -X POST http://localhost:8000/delete \\
  -H "Content-Type: application/json" \\
  -H "x-proto-token: YOUR_TOKEN" \\
  -d '{"domain": "example.com"}'`}
                  />
                  <ApiEndpoint
                    method="POST" path="/batch" description="Multiple search queries in one request"
                    params={[{ name: "queries", type: "array", required: true, desc: "Array of {q, domain?, limit?}" }]}
                    curl={`curl -X POST http://localhost:8000/batch \\
  -H "Content-Type: application/json" \\
  -H "x-proto-token: YOUR_TOKEN" \\
  -d '{"queries": [{"q": "payments"}, {"q": "docs", "domain": "stripe.com"}]}'`}
                  />
                  <ApiEndpoint method="GET" path="/stats" description="Index statistics (protected)" params={[]}
                    curl={`curl http://localhost:8000/stats \\
  -H "x-proto-token: YOUR_TOKEN"`}
                  />
                  <ApiEndpoint method="GET" path="/health" description="Health check (public, no token needed)" params={[]} curl={`curl http://localhost:8000/health`} />
                </div>
              </div>

              <Separator />

              {/* Auth endpoints */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Authentication</h3>
                <div className="space-y-3">
                  <ApiEndpoint
                    method="GET" path="/auth/status" description="Check auth state of this installation (public)"
                    params={[]}
                    curl={`curl http://localhost:8000/auth/status`}
                  />
                  <ApiEndpoint
                    method="POST" path="/auth/setup" description="First-run setup: create admin account and get session token. Only works once."
                    params={[
                      { name: "name", type: "string", required: true, desc: "Admin name" },
                      { name: "email", type: "string", required: true, desc: "Admin email" },
                      { name: "password", type: "string", required: true, desc: "Password (min 8 chars)" },
                    ]}
                    curl={`curl -X POST http://localhost:8000/auth/setup \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Admin", "email": "admin@example.com", "password": "mypassword"}'`}
                  />
                  <ApiEndpoint
                    method="POST" path="/auth/login" description="Login with email + password. Returns a session token."
                    params={[
                      { name: "email", type: "string", required: true, desc: "Admin email" },
                      { name: "password", type: "string", required: true, desc: "Admin password" },
                    ]}
                    curl={`curl -X POST http://localhost:8000/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email": "admin@example.com", "password": "mypassword"}'`}
                  />
                  <ApiEndpoint
                    method="POST" path="/auth/logout" description="Invalidate the current session token"
                    params={[]}
                    curl={`curl -X POST http://localhost:8000/auth/logout \\
  -H "x-proto-token: YOUR_TOKEN"`}
                  />
                </div>
              </div>

              <Separator />

              {/* API Keys endpoints */}
              <div>
                <h3 className="text-sm font-semibold mb-3">API Keys (Admin only)</h3>
                <div className="space-y-3">
                  <ApiEndpoint
                    method="POST" path="/api-keys" description="Generate a new API key. The full key is returned only once — store it securely."
                    params={[
                      { name: "name", type: "string", required: false, desc: "Label for the key (e.g. 'n8n', 'mcp-server')" },
                    ]}
                    curl={`curl -X POST http://localhost:8000/api-keys \\
  -H "Content-Type: application/json" \\
  -H "x-proto-token: YOUR_TOKEN" \\
  -d '{"name": "my-mcp-server"}'`}
                  />
                  <ApiEndpoint
                    method="GET" path="/api-keys" description="List all API keys with metadata. Hashes are never exposed."
                    params={[]}
                    curl={`curl http://localhost:8000/api-keys \\
  -H "x-proto-token: YOUR_TOKEN"`}
                  />
                  <ApiEndpoint
                    method="DELETE" path="/api-keys/{id}" description="Revoke an API key by ID"
                    params={[
                      { name: "id", type: "int", required: true, desc: "Key ID to revoke (from list endpoint)" },
                    ]}
                    curl={`curl -X DELETE http://localhost:8000/api-keys/1 \\
  -H "x-proto-token: YOUR_TOKEN"`}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3">Supported AI Providers</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { name: "Gemini", model: "gemini/gemini-3-flash-preview" },
                    { name: "OpenAI", model: "openai/gpt-4o-mini" },
                    { name: "OpenRouter", model: "openrouter/google/gemini-3-flash-preview" },
                  ].map((p) => (
                    <div key={p.name} className="bg-card/50 border border-border/40 rounded-lg p-3">
                      <p className="text-sm font-medium mb-1">{p.name}</p>
                      <code className="text-[10px] text-muted-foreground font-mono">{p.model}</code>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Stats Tab */}
            <TabsContent value="stats" className="space-y-4">
              {isLoadingStats ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : stats ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Documents" value={stats.total_documents} icon={<FileText className="w-4 h-4" />} />
                  <StatCard label="Domains" value={stats.registered_domains} icon={<Globe className="w-4 h-4" />} />
                  <StatCard label="Cached" value={stats.cached_domains} icon={<Zap className="w-4 h-4" />} />
                  <StatCard label="Cache TTL" value={`${stats.cache_ttl_days}d`} icon={<Clock className="w-4 h-4" />} />
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Could not connect to the API. Make sure the engine is running on{" "}
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">localhost:8000</code>
                </div>
              )}

              {health && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${health.status === "ok" ? "bg-primary animate-pulse-glow" : "bg-destructive"}`} />
                        <span className="text-sm">Engine Status</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                        <span>api: {health.status}</span>
                        <span>typesense: {health.typesense}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Button variant="outline" size="sm" onClick={loadStats} disabled={isLoadingStats} className="text-xs">
                Refresh
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

/* ================ */
/* SUB-COMPONENTS   */
/* ================ */

function ResultCard({ result, index }: { result: api.SearchResult; index: number }) {
  const showTypeBadge = result.content_type && result.content_type !== "website";
  const typeColor = CONTENT_TYPE_COLORS[result.content_type] || CONTENT_TYPE_COLORS.website;

  return (
    <Card
      className="animate-fade-up hover:border-primary/20 transition-colors bg-card/50"
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: "backwards" }}
    >
      <CardContent className="pt-3 pb-3">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h3 className="text-sm font-medium truncate">{result.section}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {showTypeBadge && (
              <Badge variant="outline" className={`text-[10px] h-4 px-1.5 font-mono shrink-0 ${typeColor}`}>
                {result.content_type}
              </Badge>
            )}
            {result.lang && result.lang !== "en" && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono border-primary/30 text-primary shrink-0">
                {result.lang}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono border-border/40 shrink-0">
              {result.domain}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{result.body}</p>
        <div className="flex items-center gap-3 mt-1.5">
          {result.location && (
            <span className="text-[10px] text-muted-foreground/60 font-mono flex items-center gap-1">
              <Globe className="w-2.5 h-2.5" />
              {result.location}
            </span>
          )}
          {result.action_url && (
            <a
              href={result.action_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary/70 hover:text-primary font-mono flex items-center gap-1 transition-colors"
            >
              <Zap className="w-2.5 h-2.5" />
              Action URL
            </a>
          )}
          {result.updated && (
            <span className="text-[10px] text-muted-foreground/40 font-mono flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {result.updated}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <Card className="bg-card/50">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-muted-foreground/60">{icon}</span>
        </div>
        <p className="text-2xl font-bold tracking-tight font-mono">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative group">
      <pre className="bg-muted/30 border border-border/30 rounded-lg p-3 text-[11px] font-mono text-muted-foreground overflow-x-auto leading-relaxed">
        {code}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
      >
        {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
      </button>
    </div>
  );
}

function ApiEndpoint({ method, path, description, params, curl, curlAi }: {
  method: string; path: string; description: string;
  params: { name: string; type: string; required: boolean; desc: string }[];
  curl: string; curlAi?: string;
}) {
  return (
    <Card className="bg-card/50">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Badge
            variant={method === "GET" ? "outline" : "default"}
            className={`text-[10px] h-4 px-1.5 font-mono ${method === "GET" ? "border-primary/30 text-primary" : ""}`}
          >
            {method}
          </Badge>
          <code className="text-sm font-mono font-medium">{path}</code>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>

        {params.length > 0 && (
          <div className="space-y-1">
            {params.map((p) => (
              <div key={p.name} className="flex items-baseline gap-2 text-xs">
                <code className="font-mono text-primary/80">{p.name}</code>
                <span className="text-muted-foreground/40 font-mono text-[10px]">{p.type}</span>
                {p.required && <span className="text-destructive/70 text-[10px]">required</span>}
                <span className="text-muted-foreground/60">{p.desc}</span>
              </div>
            ))}
          </div>
        )}

        <CodeBlock code={curl} />

        {curlAi && (
          <div>
            <p className="text-[10px] text-muted-foreground/50 mb-1.5">With AI provider:</p>
            <CodeBlock code={curlAi} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
