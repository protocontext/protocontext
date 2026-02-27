"use client";

import { useState } from "react";
import { Send, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import * as api from "@/lib/api";
import { AiSettingsSection, useAiSettings } from "@/components/dashboard/shared/AiSettingsSection";

export function ScraperPanel() {
    const { provider, setProvider, aiKey, setAiKey, aiModel, setAiModel, getAiParams } = useAiSettings();

    const [submitDomain, setSubmitDomain] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState<api.SubmitResponse | null>(null);
    const [submitError, setSubmitError] = useState("");
    const [submitProgress, setSubmitProgress] = useState(0);
    const [submitMessage, setSubmitMessage] = useState("");

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

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold tracking-tight mb-1">Scraper</h2>
                <p className="text-xs text-muted-foreground">
                    Submit a domain URL to scrape and index its content automatically.
                </p>
            </div>

            <AiSettingsSection
                provider={provider}
                aiKey={aiKey}
                aiModel={aiModel}
                onProviderChange={setProvider}
                onAiKeyChange={setAiKey}
                onAiModelChange={setAiModel}
                description={`Required to index sites without /context.txt. The engine will scrape the site and convert it to context.txt format using the selected AI model.`}
            />

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
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Scrape"}
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
                                            <span>·</span>
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
        </div>
    );
}
