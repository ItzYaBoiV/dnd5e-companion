#!/bin/bash
# D&D 5e AI Worker - Mac Mini M4 Installer
# No SSH needed - registers with the server over HTTP.
# Inference runs on this Mac (Ollama). The D&D server only routes traffic via LiteLLM —
# it does not load model weights, so pick the best model this machine can run.
# Auto-detects unified RAM for a *recommended* pull, then syncs the exact tag from Ollama.
#
# Run: bash install-mac.sh
# Re-register only (Ollama already running): bash install-mac.sh --sync-only

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_DND_LIB="$(cd "$SCRIPT_DIR/../lib" && pwd)"
# shellcheck source=../lib/worker-common.sh
source "$_DND_LIB/worker-common.sh"

REGISTER_ONLY=false
[[ "${1:-}" == "--sync-only" ]] && REGISTER_ONLY=true

SERVER_IP="${SERVER_IP:-192.168.5.7}"
SERVER_PORT="${SERVER_PORT:-56791}"
export DND_SERVER_IP="$SERVER_IP"
export DND_SERVER_PORT="$SERVER_PORT"
GREEN='\033[0;32m'; GOLD='\033[0;33m'; RED='\033[0;31m'; RESET='\033[0m'; BOLD='\033[1m'
ok()   { echo -e "${GREEN}[OK] $1${RESET}"; }
warn() { echo -e "${GOLD}[!]  $1${RESET}"; }
step() { echo -e "\n${BOLD}> $1${RESET}"; }
fail() { echo -e "${RED}[X]  $1${RESET}"; exit 1; }

echo ""
echo -e "${GOLD}${BOLD}==========================================${RESET}"
echo -e "${GOLD}${BOLD}  D&D AI Worker - Mac Mini M4 Setup${RESET}"
echo -e "${GOLD}${BOLD}  Registering with: $SERVER_IP:$SERVER_PORT (model synced from Ollama)${RESET}"
echo -e "${GOLD}${BOLD}==========================================${RESET}"

# -- Detect RAM and pick model ------------------------------------
step "Detecting hardware"
MEM_GB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
ok "Unified memory: ${MEM_GB}GB"

# Favor larger Qwen/Llama tiers when unified memory allows (Apple Silicon).
if   [ "$MEM_GB" -ge 48 ]; then RECOMMENDED="qwen2.5:72b"; echo "  Recommended: qwen2.5:72b (48GB+ unified — best quality)"
elif [ "$MEM_GB" -ge 24 ]; then RECOMMENDED="qwen2.5:32b"; echo "  Recommended: qwen2.5:32b (24–47GB)"
elif [ "$MEM_GB" -ge 16 ]; then RECOMMENDED="qwen2.5:14b"; echo "  Recommended: qwen2.5:14b (16GB — strong default for M4)"
else                             RECOMMENDED="llama3.1:8b";  echo "  Recommended: llama3.1:8b (under 16GB)"
fi

# -- Detect local IP -----------------------------------------------
step "Detecting this Mac's IP"
MY_IP=$(route get "$SERVER_IP" 2>/dev/null | grep -i "interface:" | awk '{print $2}' | \
  xargs -I{} ipconfig getifaddr {} 2>/dev/null || \
  ifconfig | grep "inet " | grep -v "127.0.0.1" | awk '{print $2}' | head -1)
[ -z "$MY_IP" ] && MY_IP=$(ifconfig | grep "inet " | grep -v "127.0.0.1" | awk '{print $2}' | head -1)
ok "This Mac's IP: $MY_IP"

# -- Install Ollama -----------------------------------------------
if [[ "$REGISTER_ONLY" != "true" ]]; then
step "Checking Ollama"
if ! command -v ollama &>/dev/null; then
  echo "  Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
  ok "Ollama installed"
else
  ok "Ollama already installed"
fi

# -- Configure auto-start with OLLAMA_HOST=0.0.0.0 ----------------
step "Configuring Ollama to accept connections from $SERVER_IP"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.dnd5e.ollama.plist"
mkdir -p "$PLIST_DIR"

OLLAMA_BIN=$(which ollama)

cat > "$PLIST_FILE" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dnd5e.ollama</string>
  <key>ProgramArguments</key>
  <array>
    <string>${OLLAMA_BIN}</string>
    <string>serve</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OLLAMA_HOST</key>
    <string>0.0.0.0</string>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/ollama-dnd5e.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/ollama-dnd5e-error.log</string>
</dict>
</plist>
PLIST

pkill -x ollama 2>/dev/null || true
sleep 2
launchctl unload "$PLIST_FILE" 2>/dev/null || true
launchctl load -w "$PLIST_FILE"
ok "Ollama configured to auto-start with OLLAMA_HOST=0.0.0.0"

echo "  Waiting for Ollama to start..."
for i in {1..20}; do
  curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1 && break
  sleep 3
done
curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1 || fail "Ollama didn't start. Check: cat /tmp/ollama-dnd5e-error.log"
ok "Ollama running"
else
  step "Sync-only: checking Ollama"
  command -v ollama &>/dev/null || fail "Ollama not found. Run without --sync-only for full install."
  curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1 || fail "Ollama not responding on :11434"
  ok "Ollama running"
fi

# -- Resolve model from Ollama + optional pull --------------------
step "Syncing model name with server (from Ollama on this Mac)"
MODEL=""
set +e
MODEL="$(resolve_registration_model "$RECOMMENDED")"
rc=$?
set -e
if [[ "$rc" -eq 0 ]]; then
  ok "Will register: $MODEL (matches Ollama; recommended was $RECOMMENDED)"
elif [[ "$rc" -eq 3 ]]; then
  step "Pulling $RECOMMENDED (no models installed yet)"
  ollama pull "$RECOMMENDED"
  MODEL="$(resolve_after_pull "$RECOMMENDED")" || fail "Could not resolve model after pull"
  ok "Model ready: $MODEL"
else
  fail "Could not read Ollama tags at $OLLAMA_TAGS_URL (is Ollama running?)"
fi

# -- Test ---------------------------------------------------------
step "Testing model"
RESPONSE=$(ollama run "$MODEL" \
  "Reply in exactly 5 words: this mac mini is ready" 2>/dev/null || echo "test skipped")
ok "Test: $RESPONSE"

# -- Register with server over HTTP (no SSH!) --------------------
step "Registering with D&D server at http://$SERVER_IP:$SERVER_PORT"

WORKER_HOST="$(hostname -s 2>/dev/null || hostname)"
HTTP_STATUS="$(dnd_register_worker "$MY_IP" "$MODEL" "$WORKER_HOST")"

if [ "$HTTP_STATUS" = "200" ]; then
  ok "Registered successfully! LiteLLM config updated on server."
  cat /tmp/dnd_register_response.json 2>/dev/null || true
else
  warn "Could not reach server (HTTP $HTTP_STATUS)."
  warn "Make sure the D&D app is running on $SERVER_IP."
  warn "Register manually later:"
  WORKER_ESC="${WORKER_HOST//\\/\\\\}"
  WORKER_ESC="${WORKER_ESC//\"/\\\"}"
  PAYLOAD="{\"ip\":\"$MY_IP\",\"model\":\"$MODEL\",\"hostname\":\"$WORKER_ESC\"}"
  echo "  curl -X POST http://$SERVER_IP:$SERVER_PORT/api/workers/register \\"
  echo "    -H 'Content-Type: application/json' \\"
  echo "    -d '$PAYLOAD'"
fi

echo ""
echo -e "${GREEN}${BOLD}==========================================${RESET}"
echo -e "${GREEN}${BOLD}  Mac Mini M4 Worker ready!${RESET}"
echo "  This Mac:    $MY_IP"
echo "  Model:       $MODEL (synced from Ollama → LiteLLM)"
echo "  Ollama port: 11434"
echo "  Auto-start:  yes (launchd, starts on login)"
echo ""
echo "  Verify: curl http://$SERVER_IP:$SERVER_PORT/api/workers"
echo -e "${GREEN}${BOLD}==========================================${RESET}"
