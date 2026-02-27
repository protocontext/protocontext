"use client";

import { useState, useEffect, useRef } from "react";
import { Settings2, ChevronDown, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as api from "@/lib/api";

export const PROVIDERS = [
    { value: "none", label: "No AI (context.txt only)" },
    { value: "gemini", label: "Gemini", defaultModel: "gemini/gemini-3-flash-preview" },
    { value: "openai", label: "OpenAI", defaultModel: "openai/gpt-4o-mini" },
    { value: "openrouter", label: "OpenRouter", defaultModel: "openrouter/google/gemini-3-flash-preview" },
];

interface AiSettingsSectionProps {
    provider: string;
    aiKey: string;
    aiModel: string;
    onProviderChange: (v: string) => void;
    onAiKeyChange: (v: string) => void;
    onAiModelChange: (v: string) => void;
    description?: string;
}

export function AiSettingsSection({
    provider,
    aiKey,
    aiModel,
    onProviderChange,
    onAiKeyChange,
    onAiModelChange,
    description,
}: AiSettingsSectionProps) {
    const [showAiSettings, setShowAiSettings] = useState(false);
    const currentProviderLabel = PROVIDERS.find((p) => p.value === provider)?.label;

    return (
        <div className="border border-border/40 rounded-lg overflow-hidden">
            <button
                onClick={() => setShowAiSettings(!showAiSettings)}
                className="w-full flex items-center gap-2.5 px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
            >
                <Settings2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">AI Provider</span>
                    <span className="text-xs text-muted-foreground ml-2">
                        {provider === "none"
                            ? "not configured"
                            : currentProviderLabel}
                    </span>
                </div>
                {provider !== "none" && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-mono border-primary/30 text-primary shrink-0">
                        active
                    </Badge>
                )}
                <ChevronDown
                    className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${showAiSettings ? "rotate-180" : ""}`}
                />
            </button>

            {showAiSettings && (
                <div className="px-4 py-4 border-t border-border/40 space-y-3 bg-muted/10">
                    {description && (
                        <p className="text-xs text-muted-foreground">{description}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Provider</Label>
                            <Select
                                value={provider}
                                onValueChange={(v) => {
                                    onProviderChange(v);
                                    const p = PROVIDERS.find((pr) => pr.value === v);
                                    if (p && "defaultModel" in p) onAiModelChange(p.defaultModel as string);
                                    else onAiModelChange("");
                                }}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PROVIDERS.map((p) => (
                                        <SelectItem key={p.value} value={p.value} className="text-xs">
                                            {p.label}
                                        </SelectItem>
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
                                        onChange={(e) => onAiKeyChange(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Model</Label>
                                    <Input
                                        placeholder={PROVIDERS.find((p) => p.value === provider)?.defaultModel}
                                        className="h-8 text-xs font-mono"
                                        value={aiModel}
                                        onChange={(e) => onAiModelChange(e.target.value)}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                    {provider !== "none" && (
                        <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            Key is saved server-side and sent per-request via secure headers.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

/** Shared hook — loads AI settings from server, auto-saves on change. */
export function useAiSettings() {
    const [provider, setProvider] = useState("none");
    const [aiKey, setAiKey] = useState("");
    const [aiModel, setAiModel] = useState("");
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const settingsChangedRef = useRef(false);

    useEffect(() => {
        api.getSettings()
            .then((s) => {
                if (s.ai_provider) setProvider(s.ai_provider);
                if (s.ai_key) setAiKey(s.ai_key);
                if (s.ai_model) setAiModel(s.ai_model);
                setSettingsLoaded(true);
            })
            .catch(() => setSettingsLoaded(true));
    }, []);

    useEffect(() => {
        if (!settingsLoaded) return;
        if (!settingsChangedRef.current) {
            settingsChangedRef.current = true;
            return;
        }
        api.saveSettings({ ai_provider: provider, ai_key: aiKey, ai_model: aiModel }).catch(() => {});
    }, [provider, aiKey, aiModel, settingsLoaded]);

    function getAiParams() {
        if (provider === "none" || !aiKey) return {};
        const p = PROVIDERS.find((pr) => pr.value === provider);
        return { ai_key: aiKey, ai_model: aiModel || p?.defaultModel || "" };
    }

    return { provider, setProvider, aiKey, setAiKey, aiModel, setAiModel, getAiParams };
}
