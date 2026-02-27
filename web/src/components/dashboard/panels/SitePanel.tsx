"use client";

import { useState } from "react";
import { Globe, Loader2, AlertCircle, Zap, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResultCard } from "@/components/dashboard/shared/ResultCard";
import * as api from "@/lib/api";
import { logHistory } from "@/lib/history";

interface SitePanelProps {
    onEditContent: (domain: string) => void;
}

export function SitePanel({ onEditContent }: SitePanelProps) {
    const [domain, setDomain] = useState("");
    const [results, setResults] = useState<api.SearchResult[]>([]);
    const [totalSections, setTotalSections] = useState(0);
    const [latency, setLatency] = useState<number | null>(null);
    const [isFetching, setIsFetching] = useState(false);
    const [isLoadingEdit, setIsLoadingEdit] = useState(false);
    const [error, setError] = useState("");

    async function handleFetch(e?: React.FormEvent) {
        e?.preventDefault();
        if (!domain.trim()) return;

        setIsFetching(true);
        setError("");
        setResults([]);
        setTotalSections(0);
        setLatency(null);

        try {
            const res = await api.getSite({ domain });
            setResults(res.sections);
            setTotalSections(res.total_sections);
            setLatency(res.latency_ms);
            logHistory({ type: "site", query: domain, domain, results_count: res.total_sections, latency_ms: res.latency_ms });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Site fetch failed");
        } finally {
            setIsFetching(false);
        }
    }

    async function handleEdit() {
        setIsLoadingEdit(true);
        setError("");
        try {
            await onEditContent(domain);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load content for editing");
        } finally {
            setIsLoadingEdit(false);
        }
    }

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold tracking-tight mb-1">Site</h2>
                <p className="text-xs text-muted-foreground">
                    Retrieve all indexed context sections for a domain.
                </p>
            </div>

            <form onSubmit={handleFetch} className="flex gap-2">
                <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="www.example.com"
                        className="pl-9 h-10"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                    />
                </div>
                <Button type="submit" disabled={isFetching || !domain.trim()} className="h-10 px-5">
                    {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fetch"}
                </Button>
            </form>

            {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {latency !== null && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-mono">
                            <Zap className="w-3 h-3 text-primary" />
                            {latency}ms
                        </span>
                        <span>{totalSections} sections</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        disabled={isLoadingEdit}
                        onClick={handleEdit}
                    >
                        {isLoadingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />}
                        Edit
                    </Button>
                </div>
            )}

            <div className="space-y-2">
                {results.map((r, i) => (
                    <ResultCard key={`${r.domain}-${r.section}-${i}`} result={r} index={i} />
                ))}
            </div>

            {latency === null && results.length === 0 && !isFetching && (
                <div className="text-center py-16 text-muted-foreground/40 text-sm">
                    Enter a domain to fetch its indexed context sections.
                </div>
            )}
        </div>
    );
}
