"use client";

import { Key } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ApiEndpoint } from "@/components/dashboard/shared/ApiEndpoint";
import { CodeBlock } from "@/components/dashboard/shared/CodeBlock";

export function ApiReferencePanel() {
    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-lg font-bold tracking-tight mb-1">API Reference</h2>
                <p className="text-xs text-muted-foreground">
                    All endpoints available at your engine URL. Protected endpoints require your token via the{" "}
                    <code className="font-mono text-foreground/70 bg-muted/40 px-1 py-0.5 rounded">x-proto-token</code> header.
                </p>
            </div>

            {/* Auth info */}
            <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-4 pb-4">
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <Key className="w-3.5 h-3.5 text-primary" />
                        Authentication
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                        All protected endpoints require a token sent via the{" "}
                        <code className="font-mono text-foreground/70 bg-muted/40 px-1 py-0.5 rounded">x-proto-token</code> header.
                        Use your <strong>admin session token</strong> or an <strong>API key</strong> from the Keys panel.
                    </p>
                    <CodeBlock code={`curl "http://localhost:8000/stats" \\\n  -H "x-proto-token: YOUR_TOKEN_HERE"`} />
                </CardContent>
            </Card>

            {/* Search & Data */}
            <div>
                <h3 className="text-sm font-semibold mb-3">Search & Data</h3>
                <div className="space-y-3">
                    <ApiEndpoint
                        method="GET" path="/search" description="Full-text search across all indexed sites"
                        params={[
                            { name: "q", type: "string", required: true, desc: "Search query" },
                            { name: "domain", type: "string", required: false, desc: "Filter by domain" },
                            { name: "limit", type: "int", required: false, desc: "Max results (default 10)" },
                        ]}
                        curl={`curl "http://localhost:8000/search?q=payments&limit=5" \\\n  -H "x-proto-token: YOUR_TOKEN"`}
                        curlAi={`curl "http://localhost:8000/search?q=payments" \\\n  -H "x-proto-token: YOUR_TOKEN" \\\n  -H "x-ai-key: YOUR_KEY" -H "x-ai-model: gemini/gemini-3-flash-preview"`}
                    />
                    <ApiEndpoint
                        method="GET" path="/site" description="Get all context sections for a domain"
                        params={[{ name: "domain", type: "string", required: true, desc: "Domain to retrieve" }]}
                        curl={`curl "http://localhost:8000/site?domain=stripe.com" \\\n  -H "x-proto-token: YOUR_TOKEN"`}
                    />
                    <ApiEndpoint
                        method="POST" path="/submit" description="Submit a new domain to the index"
                        params={[
                            { name: "domain", type: "string", required: true, desc: "Domain to register" },
                            { name: "ai_key", type: "string", required: false, desc: "AI provider key" },
                            { name: "ai_model", type: "string", required: false, desc: "Model in provider/name format" },
                        ]}
                        curl={`curl -X POST http://localhost:8000/submit \\\n  -H "Content-Type: application/json" \\\n  -H "x-proto-token: YOUR_TOKEN" \\\n  -d '{"domain": "example.com"}'`}
                    />
                    <ApiEndpoint
                        method="POST" path="/delete" description="Remove a domain from the index"
                        params={[{ name: "domain", type: "string", required: true, desc: "Domain to delete" }]}
                        curl={`curl -X POST http://localhost:8000/delete \\\n  -H "Content-Type: application/json" \\\n  -H "x-proto-token: YOUR_TOKEN" \\\n  -d '{"domain": "example.com"}'`}
                    />
                    <ApiEndpoint
                        method="POST" path="/batch" description="Multiple search queries in one request"
                        params={[{ name: "queries", type: "array", required: true, desc: "Array of {q, domain?, limit?}" }]}
                        curl={`curl -X POST http://localhost:8000/batch \\\n  -H "Content-Type: application/json" \\\n  -H "x-proto-token: YOUR_TOKEN" \\\n  -d '{"queries": [{"q": "payments"}, {"q": "docs", "domain": "stripe.com"}]}'`}
                    />
                    <ApiEndpoint method="GET" path="/stats" description="Index statistics (protected)" params={[]}
                        curl={`curl http://localhost:8000/stats \\\n  -H "x-proto-token: YOUR_TOKEN"`}
                    />
                    <ApiEndpoint method="GET" path="/health" description="Health check (public)" params={[]} curl={`curl http://localhost:8000/health`} />
                </div>
            </div>

            {/* Auth endpoints */}
            <div>
                <h3 className="text-sm font-semibold mb-3">Authentication</h3>
                <div className="space-y-3">
                    <ApiEndpoint method="GET" path="/auth/status" description="Check auth state (public)" params={[]} curl={`curl http://localhost:8000/auth/status`} />
                    <ApiEndpoint
                        method="POST" path="/auth/login" description="Login with email + password. Returns a session token."
                        params={[
                            { name: "email", type: "string", required: true, desc: "Admin email" },
                            { name: "password", type: "string", required: true, desc: "Admin password" },
                        ]}
                        curl={`curl -X POST http://localhost:8000/auth/login \\\n  -H "Content-Type: application/json" \\\n  -d '{"email": "admin@example.com", "password": "mypassword"}'`}
                    />
                    <ApiEndpoint method="POST" path="/auth/logout" description="Invalidate the current session token" params={[]}
                        curl={`curl -X POST http://localhost:8000/auth/logout \\\n  -H "x-proto-token: YOUR_TOKEN"`}
                    />
                </div>
            </div>

            {/* API Keys endpoints */}
            <div>
                <h3 className="text-sm font-semibold mb-3">API Keys (Admin only)</h3>
                <div className="space-y-3">
                    <ApiEndpoint
                        method="POST" path="/api-keys" description="Generate a new API key (shown only once)"
                        params={[{ name: "name", type: "string", required: false, desc: "Label for the key" }]}
                        curl={`curl -X POST http://localhost:8000/api-keys \\\n  -H "Content-Type: application/json" \\\n  -H "x-proto-token: YOUR_TOKEN" \\\n  -d '{"name": "my-mcp-server"}'`}
                    />
                    <ApiEndpoint method="GET" path="/api-keys" description="List all API keys" params={[]}
                        curl={`curl http://localhost:8000/api-keys \\\n  -H "x-proto-token: YOUR_TOKEN"`}
                    />
                    <ApiEndpoint method="DELETE" path="/api-keys/{id}" description="Revoke an API key by ID"
                        params={[{ name: "id", type: "int", required: true, desc: "Key ID from list endpoint" }]}
                        curl={`curl -X DELETE http://localhost:8000/api-keys/1 \\\n  -H "x-proto-token: YOUR_TOKEN"`}
                    />
                </div>
            </div>

            {/* AI Providers */}
            <div>
                <h3 className="text-sm font-semibold mb-3">Supported AI Providers</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                        { name: "Gemini", model: "gemini/gemini-3-flash-preview" },
                        { name: "OpenAI", model: "openai/gpt-4o-mini" },
                        { name: "OpenRouter", model: "openrouter/google/gemini-3-flash-preview" },
                    ].map((p) => (
                        <div key={p.name} className="bg-card/50 border border-border/40 rounded-lg p-3">
                            <p className="text-sm font-medium mb-1">{p.name}</p>
                            <code className="text-[10px] text-muted-foreground font-mono">{p.model}</code>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
