"use client";

import { useState, useEffect } from "react";
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import * as api from "@/lib/api";
import { AiSettingsSection, useAiSettings } from "@/components/dashboard/shared/AiSettingsSection";
import { ContextEditor } from "@/components/dashboard/editor/ContextEditor";

interface EditorPanelProps {
    /** Pre-fill domain + content (e.g. from "Edit" flow in SitePanel) */
    initialName?: string;
    initialContent?: string;
}

export function EditorPanel({ initialName = "", initialContent = "" }: EditorPanelProps) {
    const { provider, setProvider, aiKey, setAiKey, aiModel, setAiModel } = useAiSettings();

    // All indexed domains for the selector
    const [domains, setDomains] = useState<string[]>([]);
    const [domainSearch, setDomainSearch] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);

    // Editor state
    const [name, setName] = useState(initialName);
    const [content, setContent] = useState(initialContent);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState("");

    // Upload state
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<api.UploadResponse | null>(null);
    const [uploadError, setUploadError] = useState("");

    // Load domain list on mount
    useEffect(() => {
        api.listDomains().then(setDomains).catch(() => {});
    }, []);

    const filteredDomains = domainSearch
        ? domains.filter((d) => d.toLowerCase().includes(domainSearch.toLowerCase()))
        : domains;

    async function loadDomainContent(domain: string) {
        if (!domain.trim()) return;
        setIsLoading(true);
        setLoadError("");
        try {
            const res = await api.getContent(domain);
            setContent(res.content);
            setName(domain);
            setUploadResult(null);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "Failed to load content");
        } finally {
            setIsLoading(false);
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
            // Refresh domain list
            api.listDomains().then(setDomains).catch(() => {});
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
                description="AI key is used by the in-editor AI assistant (⌘+J). Set the key to enable AI-powered writing."
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
                        variant="outline"
                        size="sm"
                        className="h-9 px-3 gap-1.5 shrink-0"
                        onClick={() => loadDomainContent(name)}
                        disabled={!name.trim() || isLoading}
                    >
                        {isLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        Load
                    </Button>
                </div>

                {loadError && (
                    <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {loadError}
                    </div>
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

            {/* Plate.js Rich-text Editor */}
            <ContextEditor
                value={content}
                onChange={setContent}
                disabled={isUploading}
                apiKey={aiKey}
                model={aiModel}
            />

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
