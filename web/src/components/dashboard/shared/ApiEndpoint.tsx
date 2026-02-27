"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CodeBlock } from "./CodeBlock";

interface Param {
    name: string;
    type: string;
    required: boolean;
    desc: string;
}

interface ApiEndpointProps {
    method: string;
    path: string;
    description: string;
    params: Param[];
    curl: string;
    curlAi?: string;
}

export function ApiEndpoint({ method, path, description, params, curl, curlAi }: ApiEndpointProps) {
    return (
        <Card className="bg-card/50">
            <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center gap-2">
                    <Badge
                        variant={method === "GET" ? "outline" : "default"}
                        className={`text-[10px] h-4 px-1.5 font-mono ${method === "GET" ? "border-primary/30 text-primary" : ""}`}
                    >
                        {method}
                    </Badge>
                    <code className="text-sm font-mono font-medium">{path}</code>
                </div>
                <p className="text-xs text-muted-foreground">{description}</p>

                {params.length > 0 && (
                    <div className="space-y-1">
                        {params.map((p) => (
                            <div key={p.name} className="flex items-baseline gap-2 text-xs">
                                <code className="font-mono text-primary/80">{p.name}</code>
                                <span className="text-muted-foreground/40 font-mono text-[10px]">{p.type}</span>
                                {p.required && <span className="text-destructive/70 text-[10px]">required</span>}
                                <span className="text-muted-foreground/60">{p.desc}</span>
                            </div>
                        ))}
                    </div>
                )}

                <CodeBlock code={curl} />

                {curlAi && (
                    <div>
                        <p className="text-[10px] text-muted-foreground/50 mb-1.5">With AI provider:</p>
                        <CodeBlock code={curlAi} />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
