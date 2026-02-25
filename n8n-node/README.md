# n8n-nodes-protocontext

n8n community node for [ProtoContext](https://github.com/protocontext/protocontext) — search and manage AI-readable content.

Works as a **regular workflow node** and as an **AI Agent tool**.

## Installation

### Community Node (recommended)

1. Go to **Settings > Community Nodes** in n8n
2. Install: `n8n-nodes-protocontext`

### Manual

```bash
cd ~/.n8n/nodes
npm install n8n-nodes-protocontext
```

## Setup

1. Add a **ProtoContext API** credential with:
   - **API URL**: Your ProtoContext instance URL
   - **API Token**: Your API token

2. Add the **ProtoContext** node to your workflow

## Operations

| Operation | Description |
|---|---|
| **Search** | Search across all indexed content (1-3 keywords work best) |
| **Get Site** | Get all sections for a specific domain |
| **Submit Domain** | Submit a domain for indexing |
| **Upload Content** | Upload raw context.txt content |
| **Delete Domain** | Remove a domain from the index |
| **Stats** | Get index statistics |

## Use as AI Agent Tool

1. Add an **AI Agent** node to your workflow
2. Connect the **ProtoContext** node to the Agent's **tools** input
3. The agent will automatically use ProtoContext to search for information

### Tips for AI Agent prompts

Add this to your agent's system prompt for best results:

```
When searching the knowledge base, use 1-3 keywords, never full sentences.
✅ "pricing" "rooms" "menu" "contact"
❌ "What are the prices for the rooms at the hotel?"
If no results, simplify the query.
```

## License

Apache 2.0
