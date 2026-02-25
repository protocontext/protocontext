#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# ProtoContext — Cloudflare Quick Tunnel
# Exposes your local API to the internet via trycloudflare.com
#
# Usage:
#   ./tunnel.sh          → tunnel API  (port 8000)
#   ./tunnel.sh 3000     → tunnel any port
# ──────────────────────────────────────────────────────────

set -euo pipefail

PORT="${1:-8000}"

# Check cloudflared is installed
if ! command -v cloudflared &>/dev/null; then
  echo "❌ cloudflared is not installed."
  echo ""
  echo "Install it:"
  echo "  macOS:   brew install cloudflared"
  echo "  Linux:   curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null"
  echo "           sudo apt install cloudflared"
  echo "  Docker:  docker run --net=host cloudflare/cloudflared:latest tunnel --url http://localhost:$PORT"
  echo ""
  exit 1
fi

# Check if the API is running
if ! curl -sf "http://localhost:$PORT/health" &>/dev/null; then
  echo "⚠️  Nothing is running on port $PORT."
  echo "   Start the engine first: cd engine && docker compose up -d"
  exit 1
fi

echo "🚀 Starting Cloudflare Tunnel → localhost:$PORT"
echo ""

# ─── KEY FIX ───────────────────────────────────────────────
# --config /dev/null  prevents cloudflared from reading any
# existing ~/.cloudflared/config.yml (named tunnels, ingress
# rules, etc.) which would override the --url flag and cause
# the quick tunnel to return 404.
# ───────────────────────────────────────────────────────────
exec cloudflared tunnel \
  --config /dev/null \
  --no-autoupdate \
  --url "http://localhost:$PORT"
