"use client";

import { useState } from "react";
import { Trash2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import * as api from "@/lib/api";

export function DeletePanel() {
    const [domain, setDomain] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [result, setResult] = useState<api.DeleteResponse | null>(null);
    const [error, setError] = useState("");

    async function handleDelete(e?: React.FormEvent) {
        e?.preventDefault();
        if (!domain.trim()) return;

        setIsDeleting(true);
        setError("");
        setResult(null);

        try {
            const res = await api.deleteDomain({ domain });
            setResult(res);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed");
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold tracking-tight mb-1">Delete</h2>
                <p className="text-xs text-muted-foreground">
                    Remove a domain from the index and registry. This deletes all indexed sections permanently.
                </p>
            </div>

            <form onSubmit={handleDelete} className="flex gap-2">
                <div className="relative flex-1">
                    <Trash2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="domain-to-remove.com"
                        className="pl-9 h-10"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        disabled={isDeleting}
                    />
                </div>
                <Button
                    type="submit"
                    variant="destructive"
                    disabled={isDeleting || !domain.trim()}
                    className="h-10 px-5"
                >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                </Button>
            </form>

            {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {result && (
                <Card className="border-destructive/20 bg-destructive/5 animate-fade-up">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Domain deleted</p>
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                    <span className="font-mono">{result.domain}</span>
                                    <span>·</span>
                                    <span>{result.sections_deleted} sections removed</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {!result && !error && (
                <div className="mt-8 p-4 border border-destructive/20 bg-destructive/5 rounded-lg">
                    <p className="text-xs text-destructive/70 font-medium mb-1">⚠ Destructive action</p>
                    <p className="text-xs text-muted-foreground">
                        Deleting a domain removes all its indexed sections and unregisters it. You can re-submit it later.
                    </p>
                </div>
            )}
        </div>
    );
}
