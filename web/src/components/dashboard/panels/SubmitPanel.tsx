"use client";

import { useState, useEffect, useRef } from "react";
import {
    Globe, Send, Upload, FileText, Loader2, AlertCircle, CheckCircle2,
    Settings2, ChevronDown, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as api from "@/lib/api";
import { ContextEditor } from "@/components/dashboard/editor/ContextEditor";

const PROVIDERS = [
    { value: "none", label: "No AI (context.txt only)" },
    { value: "gemini", label: "Gemini", defaultModel: "gemini/gemini-3-flash-preview" },
    { value: "openai", label: "OpenAI", defaultModel: "openai/gpt-4o-mini" },
    { value: "openrouter", label: "OpenRouter", defaultModel: "openrouter/google/gemini-3-flash-preview" },
];

interface SubmitPanelProps {
    initialMode?: "url" | "upload";
    initialUploadName?: string;
    initialUploadContent?: string;
}

export function SubmitPanel({ initialMode = "url", initialUploadName = "", initialUploadContent = "" }: SubmitPanelProps) {
    const [mode, setMode] = useState<"url" | "upload">(initialMode);

    // AI provider state (self-contained, persisted server-side)
    const [provider, setProvider] = useState("none");
    const [aiKey, setAiKey] = useState("");
    const [aiModel, setAiModel] = useState("");
    const [showAiSettings, setShowAiSettings] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const settingsChangedRef = useRef(false);

    useEffect(() => {
        api.getSettings().then((s) => {
            if (s.ai_provider) setProvider(s.ai_provider);
            if (s.ai_key) setAiKey(s.ai_key);
            if (s.ai_model) setAiModel(s.ai_model);
            setSettingsLoaded(true);
        }).catch(() => setSettingsLoaded(true));
    }, []);

    useEffect(() => {
        if (!settingsLoaded) return;
        if (!settingsChangedRef.current) { settingsChangedRef.current = true; return; }
        api.saveSettings({ ai_provider: provider, ai_key: aiKey, ai_model: aiModel }).catch(() => { });
    }, [provider, aiKey, aiModel, settingsLoaded]);

    function getAiParams() {
        if (provider === "none" || !aiKey) return {};
        const p = PROVIDERS.find(pr => pr.value === provider);
        return { ai_key: aiKey, ai_model: aiModel || p?.defaultModel || "" };
    }

    // URL submit state
    const [submitDomain, setSubmitDomain] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState<api.SubmitResponse | null>(null);
    const [submitError, setSubmitError] = useState("");
    const [submitProgress, setSubmitProgress] = useState(0);
    const [submitMessage, setSubmitMessage] = useState("");

    // Upload state
    const [uploadName, setUploadName] = useState(initialUploadName);
    const [uploadContent, setUploadContent] = useState(initialUploadContent);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<api.UploadResponse | null>(null);
    const [uploadError, setUploadError] = useState("");

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
                    if (event.step === "checking") setSubmitProgress((p) => Math.min(p + 5, 20));
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

    async function handleUpload(e?: React.FormEvent) {
        e?.preventDefault();
        if (!uploadName.trim() || !uploadContent.trim()) return;
        setIsUploading(true);
        setUploadError("");
        setUploadResult(null);
        try {
            const res = await api.uploadContext({ name: uploadName, content: uploadContent });
            setUploadResult(res);
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setIsUploading(false);
        }
    }

    const currentProviderLabel = PROVIDERS.find(p => p.value === provider)?.label;

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold tracking-tight mb-1">Submit</h2>
                <p className="text-xs text-muted-foreground">
                    Register a domain or upload a context.txt directly.
                </p>
            </div>

            {/* AI Provider settings — inline, collapsible */}
            <div className="border border-border/40 rounded-lg overflow-hidden">
                <button
                    onClick={() => setShowAiSettings(!showAiSettings)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
                >
                    <Settings2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">AI Provider</span>
                        <span className="text-xs text-muted-foreground ml-2">
                            {provider === "none" ? "not configured — only sites with /context.txt will index" : currentProviderLabel}
                        </span>
                    </div>
                    {provider !== "none" && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-mono border-primary/30 text-primary shrink-0">
                            active
                        </Badge>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${showAiSettings ? "rotate-180" : ""}`} />
                </button>

                {showAiSettings && (
                    <div className="px-4 py-4 border-t border-border/40 space-y-3 bg-muted/10">
                        <p className="text-xs text-muted-foreground">
                            Required to index sites without <code className="font-mono bg-muted/60 px-1 rounded">/context.txt</code>. The engine will scrape the site and convert it to context.txt format using the selected AI model.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Provider</Label>
                                <Select value={provider} onValueChange={(v) => {
                                    setProvider(v);
                                    const p = PROVIDERS.find(pr => pr.value === v);
                                    if (p && "defaultModel" in p) setAiModel(p.defaultModel as string);
                                    else setAiModel("");
                                }}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PROVIDERS.map((p) => (
                                            <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
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
                                            placeholder={PROVIDERS.find(p => p.value === provider)?.defaultModel}
                                            className="h-8 text-xs font-mono"
                                            value={aiModel}
                                            onChange={(e) => setAiModel(e.target.value)}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                        {provider !== "none" && (
                            <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                                <Shield className="w-3 h-3" />
                                Key is saved server-side and sent per-request via secure headers. Never stored in browser.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                <button
                    onClick={() => setMode("url")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${mode === "url" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}
                >
                    <Globe className="w-3 h-3" />
                    From URL
                </button>
                <button
                    onClick={() => setMode("upload")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${mode === "upload" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}
                >
                    <Upload className="w-3 h-3" />
                    Upload context.txt
                </button>
            </div>

            {/* URL mode */}
            {mode === "url" && (
                <>
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
                        Sites with <code className="font-mono bg-muted/60 px-1 rounded">/context.txt</code> work directly without an AI key. Others need an AI provider configured above to scrape and convert content.
                    </p>

                    {isSubmitting && (
                        <div className="space-y-2 animate-fade-up">
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                                <span className="text-xs text-muted-foreground">{submitMessage}</span>
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all duration-500 ease-out" style={{ width: `${submitProgress}%` }} />
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
                                                <><span>·</span><span>{submitResult.sections_indexed} sections</span></>
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
                </>
            )}

            {/* Upload mode */}
            {mode === "upload" && (
                <>
                    <form onSubmit={handleUpload} className="space-y-3">
                        <div className="relative">
                            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Name (e.g. hotelRoma, my-notes, product-catalog)"
                                className="pl-9 h-10"
                                value={uploadName}
                                onChange={(e) => setUploadName(e.target.value)}
                                disabled={isUploading}
                            />
                        </div>
                        <ContextEditor
                            value={uploadContent}
                            onChange={setUploadContent}
                            disabled={isUploading}
                        />
                        <Button type="submit" disabled={isUploading || !uploadName.trim() || !uploadContent.trim()} className="h-10 px-5">
                            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                <span className="flex items-center gap-2"><Upload className="w-4 h-4" />Upload</span>
                            )}
                        </Button>
                    </form>

                    <p className="text-xs text-muted-foreground">
                        Upload raw context.txt content with a custom name. Same name = overwrite.
                    </p>

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
                                        <p className="text-sm font-medium">Content uploaded</p>
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
                </>
            )}
        </div>
    );
}
