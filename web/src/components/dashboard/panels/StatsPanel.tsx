"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Globe, Zap, Clock, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/shared/StatCard";
import * as api from "@/lib/api";

export function StatsPanel() {
    const [stats, setStats] = useState<api.StatsResponse | null>(null);
    const [health, setHealth] = useState<api.HealthResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const loadStats = useCallback(async () => {
        setIsLoading(true);
        try {
            const [s, h] = await Promise.all([api.getStats(), api.getHealth()]);
            setStats(s);
            setHealth(h);
        } catch {
            // silently fail
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadStats(); }, [loadStats]);

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold tracking-tight mb-1">Stats</h2>
                    <p className="text-xs text-muted-foreground">Index statistics and engine health.</p>
                </div>
                <Button variant="outline" size="sm" onClick={loadStats} disabled={isLoading} className="text-xs gap-1.5">
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {isLoading && !stats ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            ) : stats ? (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatCard label="Documents" value={stats.total_documents} icon={<FileText className="w-4 h-4" />} />
                        <StatCard label="Domains" value={stats.registered_domains} icon={<Globe className="w-4 h-4" />} />
                        <StatCard label="Cached" value={stats.cached_domains} icon={<Zap className="w-4 h-4" />} />
                        <StatCard label="Cache TTL" value={`${stats.cache_ttl_days}d`} icon={<Clock className="w-4 h-4" />} />
                    </div>

                    {health && (
                        <Card>
                            <CardContent className="pt-4 pb-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${health.status === "ok" ? "bg-primary animate-pulse" : "bg-destructive"}`} />
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Card className="bg-card/50">
                            <CardContent className="pt-4 pb-4">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Index Detail</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Total documents</span>
                                        <span className="font-mono font-medium">{stats.total_documents}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Registered domains</span>
                                        <span className="font-mono font-medium">{stats.registered_domains}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Cached domains</span>
                                        <span className="font-mono font-medium">{stats.cached_domains}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Cache TTL</span>
                                        <span className="font-mono font-medium">{stats.cache_ttl_days} days</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Indexing now</span>
                                        <span className={`font-mono font-medium ${stats.is_indexing ? "text-primary" : "text-muted-foreground/50"}`}>
                                            {stats.is_indexing ? "yes" : "no"}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {health && (
                            <Card className="bg-card/50">
                                <CardContent className="pt-4 pb-4">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Health</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">API</span>
                                            <span className={`font-mono font-medium ${health.status === "ok" ? "text-primary" : "text-destructive"}`}>
                                                {health.status}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Typesense</span>
                                            <span className={`font-mono font-medium ${health.typesense === "connected" ? "text-primary" : "text-destructive"}`}>
                                                {health.typesense}
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </>
            ) : (
                <div className="text-center py-12 text-muted-foreground text-sm">
                    Could not connect to the API. Make sure the engine is running on{" "}
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">localhost:8000</code>
                </div>
            )}
        </div>
    );
}
