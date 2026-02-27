"use client";

import { useCallback, useState } from "react";
import { Search, Loader2, AlertCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResultCard } from "@/components/dashboard/shared/ResultCard";
import * as api from "@/lib/api";
import { logHistory } from "@/lib/history";

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

const CATEGORIES = [
    { value: "all", label: "All categories" },
    { value: "website", label: "🌐 Website" },
    { value: "other", label: "📁 Other" },
    { value: "hospitality", label: "🏨 Hospitality" },
    { value: "ecommerce", label: "🛒 Ecommerce" },
    { value: "tours", label: "🗺️ Tours" },
    { value: "room", label: "🛏️ Rooms" },
    { value: "product", label: "📦 Products" },
    { value: "tour", label: "🎫 Experiences" },
    { value: "action", label: "⚡ Actions" },
    { value: "policy", label: "📋 Policies" },
];

export function SearchPanel() {
    const [query, setQuery] = useState("");
    const [domainFilter, setDomainFilter] = useState("");
    const [langFilter, setLangFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [results, setResults] = useState<api.SearchResult[]>([]);
    const [latency, setLatency] = useState<number | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState("");

    const getCategoryParams = useCallback(() => {
        if (categoryFilter === "all") return {};
        return { content_type: categoryFilter };
    }, [categoryFilter]);

    async function handleSearch(e?: React.FormEvent) {
        e?.preventDefault();
        if (!query.trim()) return;

        setIsSearching(true);
        setError("");
        setResults([]);
        setLatency(null);

        try {
            const res = await api.search({
                q: query,
                domain: domainFilter || undefined,
                lang: langFilter !== "all" ? langFilter : undefined,
                ...getCategoryParams(),
            });
            setResults(res.results);
            setLatency(res.latency_ms);
            logHistory({ type: "search", query, domain: domainFilter || undefined, results_count: res.results.length, latency_ms: res.latency_ms });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Search failed");
        } finally {
            setIsSearching(false);
        }
    }

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold tracking-tight mb-1">Search</h2>
                <p className="text-xs text-muted-foreground">Full-text search across all indexed sites.</p>
            </div>

            <form onSubmit={handleSearch} className="space-y-2">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search across all indexed sites..."
                            className="pl-9 h-10"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>
                    <Button type="submit" disabled={isSearching || !query.trim()} className="h-10 px-5">
                        {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                    </Button>
                </div>

                <div className="flex gap-2 flex-wrap">
                    <Input
                        placeholder="Filter domain (optional)"
                        className="h-9 w-48 text-xs"
                        value={domainFilter}
                        onChange={(e) => setDomainFilter(e.target.value)}
                    />
                    <Select value={langFilter} onValueChange={setLangFilter}>
                        <SelectTrigger className="w-36 h-9 text-xs">
                            <SelectValue placeholder="All languages" />
                        </SelectTrigger>
                        <SelectContent>
                            {LANGUAGES.map((l) => (
                                <SelectItem key={l.value} value={l.value} className="text-xs">{l.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger className="w-40 h-9 text-xs">
                            <SelectValue placeholder="All categories" />
                        </SelectTrigger>
                        <SelectContent>
                            {CATEGORIES.map((c) => (
                                <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </form>

            {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {latency !== null && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-mono">
                        <Zap className="w-3 h-3 text-primary" />
                        {latency}ms
                    </span>
                    <span>{results.length} results</span>
                </div>
            )}

            <div className="space-y-2">
                {results.map((r, i) => (
                    <ResultCard key={`${r.domain}-${r.section}-${i}`} result={r} index={i} />
                ))}
            </div>

            {latency !== null && results.length === 0 && !error && (
                <div className="text-center py-16 text-muted-foreground text-sm">
                    No results found. Try a different query or submit the domain first.
                </div>
            )}

            {latency === null && results.length === 0 && !isSearching && (
                <div className="text-center py-16 text-muted-foreground/40 text-sm">
                    Enter a query to search across indexed sites.
                </div>
            )}
        </div>
    );
}
