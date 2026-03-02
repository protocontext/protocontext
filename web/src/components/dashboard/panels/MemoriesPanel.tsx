"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Brain, Phone, Trash2, Loader2, AlertCircle, ChevronRight, Clock,
    RefreshCw, Plus, Pencil, Check, X, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import * as api from "@/lib/api";

export function MemoriesPanel() {
    const [callers, setCallers] = useState<api.CallerSummary[]>([]);
    const [selected, setSelected] = useState<api.MemoryRecord | null>(null);
    const [lookupId, setLookupId] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState("");

    // Add form
    const [showAddForm, setShowAddForm] = useState(false);
    const [addCallerId, setAddCallerId] = useState("");
    const [addContent, setAddContent] = useState("");
    const [isAdding, setIsAdding] = useState(false);

    // Profile editing
    const [editingProfile, setEditingProfile] = useState(false);
    const [profileDraft, setProfileDraft] = useState("");
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    const loadCallers = useCallback(async () => {
        try {
            const list = await api.listCallers();
            setCallers(list);
        } catch {
            // empty state is fine
        }
    }, []);

    useEffect(() => {
        loadCallers();
    }, [loadCallers]);

    async function handleLookup(id?: string) {
        const callerId = (id ?? lookupId).trim();
        if (!callerId) return;
        setIsLoading(true);
        setError("");
        setSelected(null);
        setEditingProfile(false);
        try {
            const data = await api.getMemories(callerId);
            setSelected(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Not found");
        } finally {
            setIsLoading(false);
        }
    }

    async function handleDelete(callerId: string) {
        if (!confirm(`Delete all memories for ${callerId}?`)) return;
        setIsDeleting(true);
        try {
            await api.deleteMemories(callerId);
            setSelected(null);
            setCallers((prev) => prev.filter((c) => c.caller_id !== callerId));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Delete failed");
        } finally {
            setIsDeleting(false);
        }
    }

    async function handleAdd() {
        const cid = addCallerId.trim();
        const content = addContent.trim();
        if (!cid || !content) return;
        setIsAdding(true);
        setError("");
        try {
            await api.appendMemory({ caller_id: cid, memories: content });
            setAddCallerId("");
            setAddContent("");
            setShowAddForm(false);
            await loadCallers();
            // Auto-select the newly added caller
            setLookupId(cid);
            await handleLookup(cid);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to add memory");
        } finally {
            setIsAdding(false);
        }
    }

    async function handleSaveProfile() {
        if (!selected) return;
        setIsSavingProfile(true);
        setError("");
        try {
            await api.updateProfile(selected.caller_id, profileDraft);
            setEditingProfile(false);
            // Reload data
            await handleLookup(selected.caller_id);
            await loadCallers();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save profile");
        } finally {
            setIsSavingProfile(false);
        }
    }

    function startEditProfile() {
        if (!selected) return;
        setProfileDraft(selected.profile);
        setEditingProfile(true);
    }

    function formatDate(iso: string) {
        if (!iso) return "";
        return new Date(iso).toLocaleDateString(undefined, {
            year: "numeric", month: "short", day: "numeric",
        });
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold tracking-tight mb-1">Memories</h2>
                    <p className="text-xs text-muted-foreground">
                        Per-caller memory for voice agents. Append summaries manually or via n8n.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs shrink-0"
                    onClick={() => setShowAddForm(!showAddForm)}
                >
                    {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {showAddForm ? "Cancel" : "Add Memory"}
                </Button>
            </div>

            {/* Add form */}
            {showAddForm && (
                <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="pt-4 pb-4 space-y-3">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Add new memory entry
                        </div>
                        <Input
                            placeholder="Caller ID (e.g. +393401234567)"
                            value={addCallerId}
                            onChange={(e) => setAddCallerId(e.target.value)}
                            className="font-mono text-sm"
                        />
                        <textarea
                            placeholder={"Call summary or notes...\ne.g. Nome: Rossi\nPreferenza: vista giardino"}
                            value={addContent}
                            onChange={(e) => setAddContent(e.target.value)}
                            rows={4}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y font-mono"
                        />
                        <div className="flex justify-end">
                            <Button
                                size="sm"
                                className="gap-1.5"
                                onClick={handleAdd}
                                disabled={isAdding || !addCallerId.trim() || !addContent.trim()}
                            >
                                {isAdding
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Send className="w-3.5 h-3.5" />
                                }
                                Append
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Lookup */}
            <div className="flex gap-2">
                <Input
                    placeholder="Caller ID (e.g. +393401234567)"
                    value={lookupId}
                    onChange={(e) => setLookupId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                    className="font-mono text-sm"
                />
                <Button
                    onClick={() => handleLookup()}
                    disabled={isLoading || !lookupId.trim()}
                    size="sm"
                    className="shrink-0"
                >
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Look up"}
                </Button>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Detail view */}
            {selected && (
                <Card className="border-border/60">
                    <CardContent className="pt-4 pb-4 space-y-4">
                        {/* Caller header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <Phone className="w-3.5 h-3.5 text-primary" />
                                </div>
                                <span className="font-mono text-sm font-semibold">{selected.caller_id}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">
                                    {selected.history.length} call{selected.history.length !== 1 ? "s" : ""}
                                </Badge>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDelete(selected.caller_id)}
                                    disabled={isDeleting}
                                >
                                    {isDeleting
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : <Trash2 className="w-3.5 h-3.5" />
                                    }
                                </Button>
                            </div>
                        </div>

                        {/* Profile — editable */}
                        <div>
                            <div className="flex items-center gap-1.5 mb-2">
                                <Brain className="w-3.5 h-3.5 text-primary" />
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</span>
                                {selected.profile_updated_at && !editingProfile && (
                                    <span className="text-[10px] text-muted-foreground/60 ml-auto mr-1">
                                        updated {formatDate(selected.profile_updated_at)}
                                    </span>
                                )}
                                {!editingProfile ? (
                                    <button
                                        onClick={startEditProfile}
                                        className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted/50"
                                    >
                                        <Pencil className="w-3 h-3" />
                                        Edit
                                    </button>
                                ) : (
                                    <div className="ml-auto flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            onClick={() => setEditingProfile(false)}
                                            disabled={isSavingProfile}
                                        >
                                            <X className="w-3 h-3 mr-1" />
                                            Cancel
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            onClick={handleSaveProfile}
                                            disabled={isSavingProfile}
                                        >
                                            {isSavingProfile
                                                ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                : <Check className="w-3 h-3 mr-1" />
                                            }
                                            Save
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {editingProfile ? (
                                <textarea
                                    value={profileDraft}
                                    onChange={(e) => setProfileDraft(e.target.value)}
                                    rows={6}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y font-mono leading-relaxed"
                                    placeholder="Enter profile facts, one per line..."
                                    autoFocus
                                />
                            ) : selected.profile ? (
                                <div className="bg-muted/40 rounded-md px-3 py-2.5 text-sm font-mono whitespace-pre-wrap leading-relaxed">
                                    {selected.profile}
                                </div>
                            ) : (
                                <div className="text-xs text-muted-foreground italic px-1">
                                    No profile yet. Click Edit to add facts manually, or wait for AI extraction.
                                </div>
                            )}
                        </div>

                        {/* Quick add memory for this caller */}
                        <QuickAppend
                            callerId={selected.caller_id}
                            onAppended={async () => {
                                await handleLookup(selected.caller_id);
                                await loadCallers();
                            }}
                        />

                        {/* History */}
                        {selected.history.length > 0 && (
                            <div>
                                <div className="flex items-center gap-1.5 mb-2">
                                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Call History</span>
                                </div>
                                <div className="space-y-2">
                                    {[...selected.history].reverse().map((entry, i) => (
                                        <div key={i} className="border border-border/40 rounded-md px-3 py-2.5">
                                            <div className="text-[10px] text-muted-foreground mb-1.5 font-mono">
                                                {formatDate(entry.created_at)}
                                            </div>
                                            <div className="text-xs whitespace-pre-wrap leading-relaxed text-foreground/80">
                                                {entry.content}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Caller list */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        All callers {callers.length > 0 && `(${callers.length})`}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground"
                        onClick={loadCallers}
                    >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Refresh
                    </Button>
                </div>

                {callers.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground/60">
                        No memories stored yet. Use "Add Memory" or connect n8n to populate.
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {callers.map((caller) => (
                            <button
                                key={caller.caller_id}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40 hover:border-border hover:bg-muted/30 transition-all text-left group"
                                onClick={() => {
                                    setLookupId(caller.caller_id);
                                    handleLookup(caller.caller_id);
                                }}
                            >
                                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                    <Phone className="w-3 h-3 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-mono text-sm font-medium truncate">{caller.caller_id}</div>
                                    {caller.profile_snippet && (
                                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                                            {caller.profile_snippet}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                                        {caller.call_count}
                                    </Badge>
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/** Inline form to quickly append a new memory for the currently selected caller */
function QuickAppend({ callerId, onAppended }: { callerId: string; onAppended: () => void }) {
    const [text, setText] = useState("");
    const [isSending, setIsSending] = useState(false);

    async function handleSend() {
        if (!text.trim()) return;
        setIsSending(true);
        try {
            await api.appendMemory({ caller_id: callerId, memories: text.trim() });
            setText("");
            onAppended();
        } catch {
            // silently fail — parent shows error
        } finally {
            setIsSending(false);
        }
    }

    return (
        <div className="flex gap-2">
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Append a new memory entry for this caller..."
                rows={2}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y font-mono"
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
                }}
            />
            <Button
                size="sm"
                variant="outline"
                className="h-auto shrink-0 self-end"
                onClick={handleSend}
                disabled={isSending || !text.trim()}
            >
                {isSending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />
                }
            </Button>
        </div>
    );
}
