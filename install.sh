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
DOMAIN="${DOMAIN:-}"

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

# Ensure enough memory for building (Next.js needs ~1.5GB)
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
SWAP_SIZE_KB=$(grep SwapTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
TOTAL_KB=$((TOTAL_MEM_KB + SWAP_SIZE_KB))

if [ "$TOTAL_KB" -lt 2000000 ] && [ ! -f /swapfile ]; then
  echo "→ Low memory detected ($(( TOTAL_MEM_KB / 1024 ))MB). Adding 2GB swap for build..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "  Swap enabled (2GB)"
fi

# Open firewall ports (if UFW is active)
if command -v ufw &>/dev/null && ufw status | grep -q "active"; then
  echo "→ Opening firewall ports (80, 443)..."
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
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

# Generate .env if not present
if [ ! -f .env ]; then
  TSKEY=$(openssl rand -hex 16)
  if [ -n "$DOMAIN" ]; then
    cat > .env <<ENVEOF
TYPESENSE_API_KEY=$TSKEY
DOMAIN=$DOMAIN
ENVEOF
  else
    cat > .env <<ENVEOF
TYPESENSE_API_KEY=$TSKEY
ENVEOF
  fi
  echo "→ Generated .env with random Typesense key"
else
  echo "→ Using existing .env"
fi

if [ -n "$DOMAIN" ]; then
  echo "→ Domain: $DOMAIN (HTTPS via Let's Encrypt)"
else
  echo "→ No domain set — running on http://<your-ip>"
  echo "  Tip: DOMAIN=yourdomain.com to enable HTTPS"
fi

# Build and start
echo ""
echo "→ Building and starting services..."
docker compose -f docker-compose.prod.yml up -d --build

# Detect server IP for display
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_IP")

echo ""
echo "  ✅ ProtoContext is running!"
echo ""
if [ -n "$DOMAIN" ]; then
  echo "  Dashboard:  https://$DOMAIN"
  echo "  API:        https://$DOMAIN/search?q=hello"
else
  echo "  Dashboard:  http://$SERVER_IP"
  echo "  API:        http://$SERVER_IP/search?q=hello"
fi
echo ""
echo "  Next: open the dashboard and complete setup."
echo ""
