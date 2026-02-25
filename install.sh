#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# ProtoContext — One-click installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/protocontext/protocontext/main/install.sh | bash
#
# With a custom domain (auto HTTPS via Let's Encrypt):
#   curl -fsSL https://raw.githubusercontent.com/protocontext/protocontext/main/install.sh | DOMAIN=protocontext.example.com bash
# ──────────────────────────────────────────────────────────

set -euo pipefail

REPO="https://github.com/protocontext/protocontext.git"
DIR="protocontext"
DOMAIN="${DOMAIN:-localhost}"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     ProtoContext — Installer         ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Check Docker
if ! command -v docker &>/dev/null; then
  echo "❌ Docker is not installed."
  echo "   Install it: https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "❌ Docker Compose v2 is not installed."
  echo "   Install it: https://docs.docker.com/compose/install/"
  exit 1
fi

# Clone
if [ -d "$DIR" ]; then
  echo "→ Updating existing installation..."
  cd "$DIR" && git pull --ff-only
else
  echo "→ Cloning ProtoContext..."
  git clone --depth 1 "$REPO" "$DIR"
  cd "$DIR"
fi

# Generate a random Typesense key if not set
if [ ! -f .env ]; then
  TSKEY=$(openssl rand -hex 16)
  cat > .env <<ENVEOF
TYPESENSE_API_KEY=$TSKEY
DOMAIN=$DOMAIN
API_URL=http://localhost:8000
ENVEOF
  echo "→ Generated .env with random Typesense key"
else
  echo "→ Using existing .env"
fi

# If domain is set, update API_URL
if [ "$DOMAIN" != "localhost" ]; then
  sed -i.bak "s|API_URL=.*|API_URL=https://$DOMAIN|" .env && rm -f .env.bak
  echo "→ Domain: $DOMAIN (HTTPS via Let's Encrypt)"
else
  echo "→ No domain set — running on http://localhost"
  echo "  Tip: DOMAIN=yourdomain.com to enable HTTPS"
fi

# Build and start
echo ""
echo "→ Building and starting services..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "  ✅ ProtoContext is running!"
echo ""
if [ "$DOMAIN" != "localhost" ]; then
  echo "  Dashboard:  https://$DOMAIN"
  echo "  API:        https://$DOMAIN/search?q=hello"
else
  echo "  Dashboard:  http://localhost:3000"
  echo "  API:        http://localhost:8000"
fi
echo ""
echo "  Next: open the dashboard and complete setup."
echo ""
