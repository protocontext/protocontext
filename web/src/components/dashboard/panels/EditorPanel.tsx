"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, Search, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import * as api from "@/lib/api";
import { AiSettingsSection, useAiSettings } from "@/components/dashboard/shared/AiSettingsSection";

interface EditorPanelProps {
    /** Pre-fill domain + content (e.g. from "Edit" flow in SitePanel) */
    initialName?: string;
    initialContent?: string;
}

const DEFAULT_TEMPLATE = `# My Site Title
> A brief description of what this content is about.

@lang: en
@version: 1.0

## section: Introduction
Write your introduction here. Explain what this site or document is about.

## section: Details
Add more detailed information here. You can use bullet lists:

- First important point
- Second important point
- Third important point

## section: Contact
Add any contact or closing information here.
`;

function normalizeDomainLike(input: string): string {
    return input.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function looksLikeDomain(input: string): boolean {
    return input.includes(".");
}

export function EditorPanel({ initialName = "", initialContent = "" }: EditorPanelProps) {
    const { provider, setProvider, aiKey, setAiKey, aiModel, setAiModel } = useAiSettings();

    // All indexed domains for the selector
    const [domains, setDomains] = useState<string[]>([]);
    const [isLoadingDomains, setIsLoadingDomains] = useState(false);
    const [domainsError, setDomainsError] = useState("");
    const [domainSearch, setDomainSearch] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);
    const [searchMatches, setSearchMatches] = useState<string[]>([]);
    const [isFindingSites, setIsFindingSites] = useState(false);

    // Editor state
    const [name, setName] = useState(initialName);
    const [content, setContent] = useState(initialContent || DEFAULT_TEMPLATE);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState("");

    // Upload state
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<api.UploadResponse | null>(null);
    const [uploadError, setUploadError] = useState("");

    // In-editor search
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchMatchIndex, setSearchMatchIndex] = useState(0);
    const [searchMatchCount, setSearchMatchCount] = useState(0);

    function getMatchOffsets(text: string, query: string): number[] {
        if (!query) return [];
        const offsets: number[] = [];
        const lower = text.toLowerCase();
        const q = query.toLowerCase();
        let idx = 0;
        while ((idx = lower.indexOf(q, idx)) !== -1) {
            offsets.push(idx);
            idx += q.length;
        }
        return offsets;
    }

    // Only scroll the textarea to the match — never steal focus from the search input.
    function scrollToMatch(index: number, offsets: number[]) {
        const ta = textareaRef.current;
        if (!ta || offsets.length === 0) return;
        const start = offsets[index];
        const linesBefore = content.substring(0, start).split("\n").length - 1;
        const lineHeight = 20;
        ta.scrollTop = Math.max(0, linesBefore * lineHeight - ta.clientHeight / 2);
    }

    function handleSearch(query: string) {
        setSearchQuery(query);
        setSearchMatchIndex(0);
        const offsets = getMatchOffsets(content, query);
        setSearchMatchCount(offsets.length);
        if (offsets.length > 0) scrollToMatch(0, offsets);
    }

    function navigateSearch(dir: 1 | -1) {
        const offsets = getMatchOffsets(content, searchQuery);
        if (offsets.length === 0) return;
        const next = (searchMatchIndex + dir + offsets.length) % offsets.length;
        setSearchMatchIndex(next);
        scrollToMatch(next, offsets);
        // Keep focus on the search input after clicking prev/next
        searchInputRef.current?.focus();
    }

    const loadDomains = useCallback(async () => {
        setIsLoadingDomains(true);
        setDomainsError("");
        try {
            const list = await api.listDomains();
            setDomains(list);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load indexed sites";
            if (message.toLowerCase().includes("not found")) {
                // Older engines may not expose /list; keep editor usable without noisy errors.
                setDomains([]);
                setDomainsError("");
                return;
            }
            setDomainsError(message);
        } finally {
            setIsLoadingDomains(false);
        }
    }, []);

    // Load domain list on mount
    useEffect(() => {
        loadDomains();
    }, [loadDomains]);

    const filteredDomains = domainSearch
        ? domains.filter((d) => d.toLowerCase().includes(domainSearch.toLowerCase()))
        : domains;

    async function findSitesByKeyword(term: string): Promise<string[]> {
        const query = term.trim();
        if (!query) return [];

        setIsFindingSites(true);
        setLoadError("");
        try {
            const res = await api.search({ q: query, limit: 30 });
            const counts: Record<string, number> = {};
            for (const hit of res.results) {
                const d = hit.domain?.trim();
                if (!d) continue;
                counts[d] = (counts[d] || 0) + 1;
            }
            const matches = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .map(([domain]) => domain);

            setSearchMatches(matches);
            if (matches.length > 0) {
                setDomains((prev) => Array.from(new Set([...matches, ...prev])));
                setShowDropdown(true);
            } else {
                setLoadError(`No sites found matching "${query}".`);
            }

            return matches;
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Failed to find sites");
            return [];
        } finally {
            setIsFindingSites(false);
        }
    }

    async function loadDomainContent(domain: string) {
        const normalized = normalizeDomainLike(domain);
        if (!normalized) return;
        setIsLoading(true);
        setLoadError("");
        try {
            const res = await api.getContent(normalized);
            setContent(res.content);
            setName(res.domain);
            setDomainSearch("");
            setSearchMatches([]);
            setUploadResult(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load content";

            // If the user typed a keyword (not a domain), discover matching domains and help them pick one.
            if (!looksLikeDomain(normalized) && message.toLowerCase().includes("no content found")) {
                const matches = await findSitesByKeyword(normalized);
                if (matches.length === 1 && matches[0] !== normalized) {
                    await loadDomainContent(matches[0]);
                    return;
                }
                if (matches.length > 1) {
                    setLoadError(`Found ${matches.length} matching sites. Pick one from the suggestions below.`);
                    return;
                }
            }

            setLoadError(message);
        } finally {
            setIsLoading(false);
        }
    }

    async function handleFind() {
        const term = (domainSearch || name).trim();
        if (!term) return;

        if (looksLikeDomain(term)) {
            await loadDomainContent(term);
            return;
        }

        const matches = await findSitesByKeyword(term);
        if (matches.length === 1) {
            await loadDomainContent(matches[0]);
        } else if (matches.length > 1) {
            setLoadError(`Found ${matches.length} matching sites. Pick one from the suggestions below.`);
        }
    }

    async function handleUpload(e?: React.FormEvent) {
        e?.preventDefault();
        if (!name.trim() || !content.trim()) return;
        setIsUploading(true);
        setUploadError("");
        setUploadResult(null);
        try {
            const res = await api.uploadContext({ name, content });
            setUploadResult(res);
            setName(res.name);
            setDomainSearch("");
            // Refresh domain list
            await loadDomains();
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setIsUploading(false);
        }
    }

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold tracking-tight mb-1">Editor</h2>
                <p className="text-xs text-muted-foreground">
                    Write or edit context.txt content with AI assistance. Load an existing site or create a new one.
                </p>
            </div>

            {/* AI Settings */}
            <AiSettingsSection
                provider={provider}
                aiKey={aiKey}
                aiModel={aiModel}
                onProviderChange={setProvider}
                onAiKeyChange={setAiKey}
                onAiModelChange={setAiModel}
                description="AI key used for scraping sites without /context.txt (same key as Scraper panel)."
            />

            {/* Site selector */}
            <div className="space-y-2">
                <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Load existing site or type new name..."
                            className="pl-9 h-9 text-sm"
                            value={domainSearch || name}
                            onChange={(e) => {
                                setDomainSearch(e.target.value);
                                setName(e.target.value);
                                setSearchMatches([]);
                                setShowDropdown(true);
                            }}
                            onFocus={() => setShowDropdown(true)}
                            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                        />
                        {showDropdown && filteredDomains.length > 0 && (
                            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {filteredDomains.slice(0, 20).map((d) => (
                                    <button
                                        key={d}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors font-mono"
                                        onMouseDown={() => {
                                            setName(d);
                                            setDomainSearch("");
                                            setShowDropdown(false);
                                            loadDomainContent(d);
                                        }}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 px-3 gap-1.5 shrink-0"
                        onClick={handleFind}
                        disabled={isFindingSites || isLoading || !(domainSearch || name).trim()}
                        title="Find site and load content"
                    >
                        {(isFindingSites || isLoading) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Search className="w-3.5 h-3.5" />
                        )}
                        Find
                    </Button>
                </div>

                {domainsError && (
                    <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {domainsError}
                    </div>
                )}

                {loadError && (
                    <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {loadError}
                    </div>
                )}

                {searchMatches.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {searchMatches.slice(0, 12).map((d) => (
                            <button
                                key={d}
                                type="button"
                                className="text-[11px] font-mono px-2 py-1 rounded-md border border-border/50 hover:bg-muted/50 transition-colors"
                                onClick={() => {
                                    setName(d);
                                    setDomainSearch("");
                                    loadDomainContent(d);
                                }}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                )}

                {!isLoadingDomains && !domainsError && domains.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                        No indexed sites yet. Submit or upload one first.
                    </p>
                )}
            </div>

            {/* Name field */}
            <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Name (e.g. hotelRoma, my-notes, product-catalog)"
                    className="pl-9 h-10"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isUploading}
                />
            </div>

            {/* Textarea with inline search bar — always visible */}
            <div className="rounded-lg border border-input overflow-hidden">
                <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/60 bg-muted/30">
                    <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <Input
                        ref={searchInputRef}
                        placeholder="Search in content..."
                        className="h-6 text-xs border-0 bg-transparent focus-visible:ring-0 px-1 flex-1"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); navigateSearch(e.shiftKey ? -1 : 1); }
                            if (e.key === "Escape") { setSearchQuery(""); setSearchMatchCount(0); }
                        }}
                    />
                    <span className="text-[10px] text-muted-foreground shrink-0 font-mono w-16 text-right">
                        {searchQuery
                            ? (searchMatchCount === 0 ? "no matches" : `${searchMatchIndex + 1}/${searchMatchCount}`)
                            : ""}
                    </span>
                    <button onClick={() => navigateSearch(-1)} disabled={searchMatchCount === 0} className="p-0.5 rounded hover:bg-muted/60 disabled:opacity-30">
                        <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => navigateSearch(1)} disabled={searchMatchCount === 0} className="p-0.5 rounded hover:bg-muted/60 disabled:opacity-30">
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                </div>
                <textarea
                    ref={textareaRef}
                    className="w-full h-[480px] resize-none bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="# Title&#10;> Description&#10;&#10;## section: Introduction&#10;Write your content here..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    disabled={isUploading}
                    spellCheck={false}
                    onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "f") {
                            e.preventDefault();
                            searchInputRef.current?.focus();
                        }
                    }}
                />
            </div>

            <div className="flex items-center gap-3">
                <Button
                    onClick={handleUpload}
                    disabled={isUploading || !name.trim() || !content.trim()}
                    className="h-10 px-5"
                >
                    {isUploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <span className="flex items-center gap-2">
                            <Upload className="w-4 h-4" />
                            Save
                        </span>
                    )}
                </Button>
                <p className="text-xs text-muted-foreground">
                    Same name = overwrite existing content.
                </p>
            </div>

            {uploadError && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {uploadError}
                </div>
            )}

            {uploadResult && (
                <Card className="border-primary/20 bg-primary/5 animate-fade-up">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Content saved</p>
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                    <span className="font-mono">{uploadResult.name}</span>
                                    <span>·</span>
                                    <span>{uploadResult.sections_indexed} sections indexed</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
