"use client";

import {
    Search, Globe, Scan, FileEdit, Trash2, Key, Code2, BarChart3, BarChart2,
    Terminal, BookOpen, Github, LogOut, ChevronRight, Sun, Moon,
} from "lucide-react";
import React from "react";
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
