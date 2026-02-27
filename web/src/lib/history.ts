// Client-side query history stored in localStorage
// Each entry is appended; max 200 entries kept.

export interface HistoryEntry {
    id: string;
    type: "search" | "site";
    query: string;
    domain?: string;
    results_count: number;
    latency_ms: number;
    created_at: string;
}

const KEY = "proto_query_history";
const MAX = 200;

export function logHistory(entry: Omit<HistoryEntry, "id" | "created_at">) {
    if (typeof window === "undefined") return;
    const existing = getHistory();
    const newEntry: HistoryEntry = {
        ...entry,
        id: Date.now().toString(),
        created_at: new Date().toISOString(),
    };
    const updated = [newEntry, ...existing].slice(0, MAX);
    try {
        localStorage.setItem(KEY, JSON.stringify(updated));
    } catch {
        // Storage full — ignore
    }
}

export function getHistory(): HistoryEntry[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function clearHistory() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(KEY);
}

export function getTopQueries(limit = 10): { query: string; count: number }[] {
    const history = getHistory();
    const counts: Record<string, number> = {};
    for (const e of history) {
        if (e.query) counts[e.query] = (counts[e.query] || 0) + 1;
    }
    return Object.entries(counts)
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

export function getTopDomains(limit = 10): { domain: string; count: number }[] {
    const history = getHistory();
    const counts: Record<string, number> = {};
    for (const e of history) {
        if (e.domain) counts[e.domain] = (counts[e.domain] || 0) + 1;
        else if (e.type === "site" && e.query) counts[e.query] = (counts[e.query] || 0) + 1;
    }
    return Object.entries(counts)
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

export function getAvgLatency(): number {
    const history = getHistory();
    if (!history.length) return 0;
    return Math.round(history.reduce((sum, e) => sum + e.latency_ms, 0) / history.length);
}
