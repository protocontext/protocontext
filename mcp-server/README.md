# ProtoContext MCP Server

MCP server that connects any AI agent to the [ProtoContext](https://protocontext.org) search engine — search structured, AI-readable web content in real time.

## Tools

| Tool | Description |
|---|---|
| `protocontext_search` | Full-text search across all indexed websites |
| `protocontext_site` | Get all context sections for a specific domain |
| `protocontext_submit` | Register a new domain to the index |
| `protocontext_delete` | Remove a domain from the index |
| `protocontext_stats` | Index statistics and health status |

## Quick Start

### Claude Code

```bash
claude mcp add protocontext -- uv --directory /path/to/mcp-server run server.py
```

### Claude Desktop

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "protocontext": {
      "command": "uv",
      "args": ["--directory", "/path/to/mcp-server", "run", "server.py"]
    }
  }
}
```

### Cursor / Windsurf

Add to your MCP config:

```json
{
  "protocontext": {
    "command": "uv",
    "args": ["--directory", "/path/to/mcp-server", "run", "server.py"]
  }
}
```

## Examples

Once connected, your AI agent can:

- *"Search for payment processing documentation"* → calls `protocontext_search`
- *"Get all context for stripe.com"* → calls `protocontext_site`
- *"Register docs.example.com in ProtoContext"* → calls `protocontext_submit`
- *"Show me ProtoContext stats"* → calls `protocontext_stats`

## API

The MCP server connects to the public ProtoContext API at `https://api.protocontext.org`. No API key required for searching indexed sites.

For submitting sites without `/context.txt`, an AI provider key is needed (Gemini, OpenAI, or OpenRouter).

## Environment Variables

- `PROTOCONTEXT_API_BASE` (optional): Base URL of your ProtoContext API.
- `PROTOCONTEXT_API_TOKEN` (optional): Token sent as `x-proto-token` for protected instances.
  - Backward compatible: `PROTO_API_TOKEN` is also supported.
