"use client";

import { useCallback, useEffect, useState } from "react";
import { Key, Loader2, AlertCircle, CheckCircle2, Plus, X, Check, Copy, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import * as api from "@/lib/api";

export function KeysPanel() {
    const [apiKeys, setApiKeys] = useState<api.ApiKeyInfo[]>([]);
    const [newKeyName, setNewKeyName] = useState("");
    const [isCreatingKey, setIsCreatingKey] = useState(false);
    const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
    const [keyCopied, setKeyCopied] = useState(false);
    const [error, setError] = useState("");
    const [isLoadingKeys, setIsLoadingKeys] = useState(false);

    const loadKeys = useCallback(async () => {
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

    useEffect(() => { loadKeys(); }, [loadKeys]);

    async function handleCreateKey(e?: React.FormEvent) {
        e?.preventDefault();
        setIsCreatingKey(true);
        setError("");
        setNewlyCreatedKey(null);

        try {
            const result = await api.createApiKey(newKeyName.trim());
            setNewlyCreatedKey(result.key || null);
            setNewKeyName("");
            await loadKeys();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create key");
        } finally {
            setIsCreatingKey(false);
        }
    }

    async function handleRevoke(keyId: number) {
        setError("");
        try {
            await api.revokeApiKey(keyId);
            await loadKeys();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to revoke key");
        }
    }

    function handleCopyNewKey() {
        if (newlyCreatedKey) {
            navigator.clipboard.writeText(newlyCreatedKey);
            setKeyCopied(true);
            setTimeout(() => setKeyCopied(false), 2000);
        }
    }

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-bold tracking-tight mb-1">API Keys</h2>
                <p className="text-xs text-muted-foreground">
                    Generate keys for programmatic access (MCP servers, n8n, scripts). Keys can be individually revoked.
                </p>
            </div>

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
                    {isCreatingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" />Generate</>}
                </Button>
            </form>

            {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

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
                                        {keyCopied ? <><Check className="w-3 h-3 text-primary" /><span className="text-primary">Copied</span></> : <><Copy className="w-3 h-3" /><span>Copy</span></>}
                                    </button>
                                </div>
                                <div className="bg-background/60 border border-border/40 rounded-md px-3 py-2 font-mono text-xs text-foreground/70 break-all leading-relaxed">
                                    {newlyCreatedKey}
                                </div>
                                <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                                    <Shield className="w-3 h-3" />
                                    This key is shown only once. Store it securely.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {isLoadingKeys ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            ) : apiKeys.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                    No API keys yet. Generate one above to get started.
                </div>
            ) : (
                <div className="space-y-2">
                    {apiKeys.map((k) => (
                        <Card key={k.id} className={`bg-card/50 ${!k.is_active ? "opacity-50" : ""}`}>
                            <CardContent className="pt-3 pb-3">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-sm font-medium truncate">{k.name || "Unnamed key"}</span>
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] h-4 px-1.5 font-mono border-border/40 shrink-0 ${k.is_active ? "text-primary border-primary/30" : "text-muted-foreground"}`}
                                            >
                                                {k.is_active ? "active" : "revoked"}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
                                            <span>{k.key_prefix}•••</span>
                                            <span className="text-muted-foreground/40">created {new Date(k.created_at).toLocaleDateString()}</span>
                                            {k.last_used_at && (
                                                <span className="text-muted-foreground/40">used {new Date(k.last_used_at).toLocaleDateString()}</span>
                                            )}
                                        </div>
                                    </div>
                                    {k.is_active && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
                                            onClick={() => handleRevoke(k.id)}
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
        </div>
    );
}
