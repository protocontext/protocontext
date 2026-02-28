"use client";

import {
    Search, Globe, Scan, FileEdit, Trash2, Key, Code2, BarChart3, BarChart2,
    Terminal, BookOpen, Github, LogOut, ChevronRight, Sun, Moon,
    RefreshCw, Loader2, X,
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";

export type PanelId = "search" | "site" | "scraper" | "editor" | "delete" | "keys" | "api" | "stats" | "analytics";

interface NavItem {
    id: PanelId;
    label: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
    { id: "search", label: "Search", icon: <Search className="w-4 h-4" /> },
    { id: "site", label: "Sites", icon: <Globe className="w-4 h-4" /> },
    { id: "scraper", label: "Scraper", icon: <Scan className="w-4 h-4" /> },
    { id: "editor", label: "Editor", icon: <FileEdit className="w-4 h-4" /> },
    { id: "delete", label: "Delete", icon: <Trash2 className="w-4 h-4" /> },
    { id: "keys", label: "API Keys", icon: <Key className="w-4 h-4" />, adminOnly: true },
    { id: "api", label: "API Reference", icon: <Code2 className="w-4 h-4" /> },
    { id: "stats", label: "Stats", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart2 className="w-4 h-4" /> },
];

// ── UpdateButton ────────────────────────────────────────────────────────────
type UpdateStatus = 'idle' | 'pulling' | 'building' | 'restarting' | 'error' | 'offline';

function UpdateButton() {
    const [status, setStatus]     = useState<UpdateStatus>('offline');
    const [commit, setCommit]     = useState('');
    const [log, setLog]           = useState<string[]>([]);
    const [showLog, setShowLog]   = useState(false);
    const pollingRef              = useRef<ReturnType<typeof setInterval> | null>(null);
    const logEndRef               = useRef<HTMLDivElement>(null);

    async function fetchStatus(): Promise<UpdateStatus> {
        try {
            const res  = await fetch('http://localhost:3999/status', { signal: AbortSignal.timeout(2000) });
            const data = await res.json();
            setStatus(data.status);
            setCommit(data.commit ?? '');
            setLog(data.log ?? []);
            return data.status;
        } catch {
            setStatus('offline');
            return 'offline';
        }
    }

    useEffect(() => {
        fetchStatus();
        // Lightweight heartbeat — only poll actively while updating
    }, []);

    // Auto-scroll log to bottom
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [log]);

    function startPolling() {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
            const s = await fetchStatus();
            if (s === 'idle') {
                clearInterval(pollingRef.current!);
                pollingRef.current = null;
                // Server just restarted — wait a moment then reload
                setTimeout(() => window.location.reload(), 1500);
            }
        }, 1200);
    }

    async function handleUpdate() {
        setShowLog(true);
        try {
            await fetch('http://localhost:3999/update', { method: 'POST' });
            startPolling();
        } catch {
            setStatus('error');
        }
    }

    const isUpdating = status === 'pulling' || status === 'building' || status === 'restarting';

    const statusLabel: Record<UpdateStatus, string> = {
        idle       : 'Pull update',
        pulling    : 'Pulling…',
        building   : 'Building…',
        restarting : 'Restarting…',
        error      : 'Error — retry',
        offline    : 'Updater offline',
    };

    const statusColor: Partial<Record<UpdateStatus, string>> = {
        error   : 'text-destructive hover:text-destructive',
        offline : 'opacity-40 cursor-not-allowed',
    };

    if (status === 'offline') return null; // Hide button entirely when updater isn't running

    return (
        <>
            <button
                onClick={handleUpdate}
                disabled={isUpdating}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all disabled:opacity-60 ${statusColor[status] ?? ''}`}
            >
                {isUpdating
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    : <RefreshCw className="w-3.5 h-3.5 shrink-0" />}
                <span className="flex-1 text-left">{statusLabel[status]}</span>
                {commit && !isUpdating && (
                    <span className="font-mono text-[10px] opacity-40">{commit}</span>
                )}
            </button>

            {/* Progress overlay */}
            {showLog && (
                <div className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-end justify-start p-4 lg:items-center lg:justify-center">
                    <div className="w-full max-w-md bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/20">
                            <div className="flex items-center gap-2">
                                {isUpdating
                                    ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                    : status === 'error'
                                        ? <span className="text-destructive text-sm">✗</span>
                                        : <span className="text-primary text-sm">✓</span>}
                                <span className="text-sm font-medium">
                                    {isUpdating ? statusLabel[status] : status === 'error' ? 'Update failed' : 'Reloading…'}
                                </span>
                            </div>
                            {!isUpdating && (
                                <button
                                    onClick={() => setShowLog(false)}
                                    className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {/* Log */}
                        <div className="p-3 max-h-64 overflow-y-auto bg-black/30 font-mono text-[11px] space-y-0.5">
                            {log.map((line, i) => (
                                <div key={i} className="text-muted-foreground leading-relaxed">{line}</div>
                            ))}
                            {!isUpdating && status !== 'error' && (
                                <div className="text-primary mt-1">✓ Done — reloading page…</div>
                            )}
                            <div ref={logEndRef} />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ── Sidebar ─────────────────────────────────────────────────────────────────
interface SidebarProps {
    activePanel: PanelId;
    onSelect: (id: PanelId) => void;
    legacyMode: boolean;
    onLogout: () => void;
}

export function Sidebar({ activePanel, onSelect, legacyMode, onLogout }: SidebarProps) {
    const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || !legacyMode);
    const { theme, setTheme } = useTheme();

    return (
        <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col border-r border-border/40 bg-background/95 backdrop-blur-sm">
            {/* Logo */}
            <div className="px-4 h-14 flex items-center gap-2.5 border-b border-border/40">
                <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Terminal className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm tracking-tight">ProtoContext</span>
                </div>
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono text-muted-foreground border-border/50 shrink-0">
                    beta
                </Badge>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
                {visibleItems.map((item) => {
                    const isActive = activePanel === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onSelect(item.id)}
                            className={`
                w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all
                ${isActive
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                }
              `}
                        >
                            <span className={isActive ? "text-primary" : "text-muted-foreground/70"}>
                                {item.icon}
                            </span>
                            {item.label}
                            {isActive && <ChevronRight className="w-3 h-3 ml-auto text-primary/50" />}
                        </button>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="px-2 pb-3 pt-2 border-t border-border/40 space-y-0.5">
                {/* Dark/Light toggle */}
                <button
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                >
                    {theme === "dark" ? (
                        <Sun className="w-3.5 h-3.5" />
                    ) : (
                        <Moon className="w-3.5 h-3.5" />
                    )}
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>

                <a href="https://github.com/protocontext/protocontext" target="_blank" rel="noopener noreferrer">
                    <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                        <Github className="w-3.5 h-3.5" />
                        GitHub
                    </button>
                </a>
                <a href="https://github.com/protocontext/protocontext/blob/main/SPEC.md" target="_blank" rel="noopener noreferrer">
                    <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                        <BookOpen className="w-3.5 h-3.5" />
                        Spec v1.0
                    </button>
                </a>
                <UpdateButton />
                {!legacyMode && (
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        Logout
                    </button>
                )}
            </div>
        </aside>
    );
}
