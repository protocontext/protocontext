"use client";

import { useEffect, useState } from "react";
import {
    Search, Globe, Zap, TrendingUp, BarChart3, Activity,
    FileText, Trash2, RefreshCw
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getHistory, getTopQueries, getTopDomains, getAvgLatency, clearHistory, type HistoryEntry } from "@/lib/history";
import * as api from "@/lib/api";

function timeAgo(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export function AnalyticsPanel() {
    const [history, setHistory] = useState<HistoryEntry[]>(() => getHistory().slice(0, 50));
    const [topQueries, setTopQueries] = useState<{ query: string; count: number }[]>(() => getTopQueries(8));
    const [topDomains, setTopDomains] = useState<{ domain: string; count: number }[]>(() => getTopDomains(6));
    const [avgLatency, setAvgLatency] = useState(() => getAvgLatency());
    const [stats, setStats] = useState<api.StatsResponse | null>(null);
    const [health, setHealth] = useState<api.HealthResponse | null>(null);

    function refresh() {
        setHistory(getHistory().slice(0, 50));
        setTopQueries(getTopQueries(8));
        setTopDomains(getTopDomains(6));
        setAvgLatency(getAvgLatency());
    }

    useEffect(() => {
        api.getStats().then(setStats).catch(() => { });
        api.getHealth().then(setHealth).catch(() => { });
    }, []);

    const totalSearches = history.filter(h => h.type === "search").length;
    const totalSiteFetches = history.filter(h => h.type === "site").length;
    const maxQueryCount = topQueries[0]?.count || 1;
    const maxDomainCount = topDomains[0]?.count || 1;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold tracking-tight mb-1">Analytics</h2>
                    <p className="text-xs text-muted-foreground">Query history and index insights from this session.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground" onClick={refresh}>
                        <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    {history.length > 0 && (
                        <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground hover:text-destructive"
                            onClick={() => { clearHistory(); refresh(); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                            Clear
                        </Button>
                    )}
                </div>
            </div>

            {/* Top stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-card/50">
                    <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 mb-2 text-muted-foreground/60">
                            <Search className="w-4 h-4" />
                        </div>
                        <p className="text-2xl font-bold font-mono tracking-tight">{totalSearches}</p>
                        <p className="text-xs text-muted-foreground">Searches</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 mb-2 text-muted-foreground/60">
                            <Globe className="w-4 h-4" />
                        </div>
                        <p className="text-2xl font-bold font-mono tracking-tight">{totalSiteFetches}</p>
                        <p className="text-xs text-muted-foreground">Site Fetches</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 mb-2 text-muted-foreground/60">
                            <Zap className="w-4 h-4" />
                        </div>
                        <p className="text-2xl font-bold font-mono tracking-tight">{avgLatency || "—"}{avgLatency ? "ms" : ""}</p>
                        <p className="text-xs text-muted-foreground">Avg Latency</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/50">
                    <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 mb-2 text-muted-foreground/60">
                            <FileText className="w-4 h-4" />
                        </div>
                        <p className="text-2xl font-bold font-mono tracking-tight">{stats?.total_documents ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">Indexed Docs</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left column */}
                <div className="space-y-5">
                    {/* Recent history */}
                    <Card className="bg-card/50">
                        <CardContent className="pt-4 pb-4">
                            <div className="flex items-center gap-2 mb-4">
                                <Activity className="w-4 h-4 text-muted-foreground" />
                                <h3 className="text-sm font-semibold">Recent Queries</h3>
                                <span className="text-xs text-muted-foreground ml-auto">{history.length} entries</span>
                            </div>

                            {history.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground/40 text-sm">
                                    No queries yet. Start searching to see history here.
                                </div>
                            ) : (
                                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                                    {history.map((entry) => (
                                        <div
                                            key={entry.id}
                                            className="flex items-start gap-2.5 py-2 px-3 rounded-md hover:bg-muted/30 transition-colors group"
                                        >
                                            <div className="shrink-0 mt-0.5">
                                                {entry.type === "search"
                                                    ? <Search className="w-3 h-3 text-primary/60" />
                                                    : <Globe className="w-3 h-3 text-cyan-500/60" />
                                                }
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium truncate text-foreground/80">{entry.query}</p>
                                                {entry.domain && (
                                                    <p className="text-[10px] text-muted-foreground/50 font-mono truncate">{entry.domain}</p>
                                                )}
                                            </div>
                                            <div className="shrink-0 text-right space-y-0.5">
                                                <p className="text-[10px] text-muted-foreground/50 font-mono">{entry.results_count} res</p>
                                                <p className="text-[10px] text-muted-foreground/40 font-mono">{entry.latency_ms}ms</p>
                                            </div>
                                            <div className="shrink-0">
                                                <span className="text-[10px] text-muted-foreground/40 font-mono whitespace-nowrap">
                                                    {timeAgo(entry.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Top queries bar chart */}
                    {topQueries.length > 0 && (
                        <Card className="bg-card/50">
                            <CardContent className="pt-4 pb-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                                    <h3 className="text-sm font-semibold">Top Queries</h3>
                                </div>
                                <div className="space-y-2">
                                    {topQueries.map(({ query, count }) => (
                                        <div key={query} className="space-y-1">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs text-foreground/80 truncate max-w-[200px]">{query}</span>
                                                <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">{count}×</span>
                                            </div>
                                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary/60 rounded-full transition-all duration-500"
                                                    style={{ width: `${(count / maxQueryCount) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Right column */}
                <div className="space-y-5">
                    {/* Index overview */}
                    <Card className="bg-card/50">
                        <CardContent className="pt-4 pb-4">
                            <div className="flex items-center gap-2 mb-4">
                                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                                <h3 className="text-sm font-semibold">Index Overview</h3>
                                {health && (
                                    <div className="ml-auto flex items-center gap-1.5">
                                        <div className={`w-1.5 h-1.5 rounded-full ${health.status === "ok" ? "bg-primary animate-pulse" : "bg-destructive"}`} />
                                        <span className="text-[10px] font-mono text-muted-foreground">{health.status}</span>
                                    </div>
                                )}
                            </div>
                            {stats ? (
                                <div className="space-y-3">
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-muted-foreground">Indexed Documents</span>
                                            <span className="font-mono font-medium">{stats.total_documents}</span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-primary rounded-full" style={{ width: "100%" }} />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-muted-foreground">Registered Domains</span>
                                            <span className="font-mono font-medium">{stats.registered_domains}</span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary/70 rounded-full"
                                                style={{ width: stats.registered_domains > 0 ? "100%" : "0%" }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-muted-foreground">Cache Hit Rate</span>
                                            <span className="font-mono font-medium">
                                                {stats.registered_domains > 0
                                                    ? `${Math.round((stats.cached_domains / stats.registered_domains) * 100)}%`
                                                    : "—"
                                                }
                                            </span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500/60 rounded-full transition-all"
                                                style={{
                                                    width: stats.registered_domains > 0
                                                        ? `${(stats.cached_domains / stats.registered_domains) * 100}%`
                                                        : "0%"
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">Engine not connected.</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Top domains */}
                    {topDomains.length > 0 && (
                        <Card className="bg-card/50">
                            <CardContent className="pt-4 pb-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <Globe className="w-4 h-4 text-muted-foreground" />
                                    <h3 className="text-sm font-semibold">Most Accessed Domains</h3>
                                </div>
                                <div className="space-y-2">
                                    {topDomains.map(({ domain, count }) => (
                                        <div key={domain} className="space-y-1">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-mono text-foreground/80 truncate max-w-[200px]">{domain}</span>
                                                <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">{count}×</span>
                                            </div>
                                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-cyan-500/50 rounded-full transition-all duration-500"
                                                    style={{ width: `${(count / maxDomainCount) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Session summary */}
                    <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="pt-4 pb-4">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Session Summary</h3>
                            <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Total queries</span>
                                    <span className="font-mono font-medium">{history.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Avg latency</span>
                                    <span className="font-mono font-medium">{avgLatency ? `${avgLatency}ms` : "—"}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Unique queries</span>
                                    <span className="font-mono font-medium">{topQueries.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Unique domains</span>
                                    <span className="font-mono font-medium">{topDomains.length}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
