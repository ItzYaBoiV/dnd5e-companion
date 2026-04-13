#!/bin/bash
# D&D 5e AI Worker - Linux GPU Installer (RTX / CUDA)
# Inference runs on this GPU (Ollama). The server only proxies via LiteLLM — use the best
# model VRAM allows (e.g. qwen2.5:14b on 12GB cards like RTX 3080 Ti with Ollama quants).
#
# Run: bash install-linux.sh
# Re-register only: bash install-linux.sh --sync-only

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

ollama_pull() { docker exec dnd5e_ollama_gpu ollama pull "$1"; }

recommend_gpu_model() {
  local mib
  mib=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -dc '0-9')
  mib="${mib:-0}"
  # 12GB class (3080 Ti, etc.) → qwen2.5:14b (Ollama quants). 32B only when VRAM is ample.
  if [ "$mib" -ge 24000 ]; then echo "qwen2.5:32b"
  elif [ "$mib" -ge 11000 ]; then echo "qwen2.5:14b"
  elif [ "$mib" -ge 8000 ];  then echo "llama3.1:8b"
  else echo "llama3.2:3b"
  fi
}

GREEN='\033[0;32m'; GOLD='\033[0;33m'; RED='\033[0;31m'; RESET='\033[0m'; BOLD='\033[1m'
ok()   { echo -e "${GREEN}[OK] $1${RESET}"; }
warn() { echo -e "${GOLD}[!]  $1${RESET}"; }
step() { echo -e "\n${BOLD}> $1${RESET}"; }
fail() { echo -e "${RED}[X]  $1${RESET}"; exit 1; }

echo ""
echo -e "${GOLD}${BOLD}==========================================${RESET}"
echo -e "${GOLD}${BOLD}  D&D AI Worker - Linux GPU Setup${RESET}"
echo -e "${GOLD}${BOLD}  Registering with: $SERVER_IP:$SERVER_PORT (model synced from Ollama)${RESET}"
echo -e "${GOLD}${BOLD}==========================================${RESET}"

# -- Detect local IP -----------------------------------------------
step "Detecting this machine's IP"
MY_IP=$(ip route get "$SERVER_IP" 2>/dev/null | grep -oP 'src \K\S+' | head -1)
[ -z "$MY_IP" ] && MY_IP=$(hostname -I | awk '{print $1}')
ok "This machine's IP: $MY_IP"

# -- GPU check + VRAM-based recommendation --------------------------
step "Checking NVIDIA GPU"
if [[ "$REGISTER_ONLY" != "true" ]]; then
  nvidia-smi >/dev/null 2>&1 || fail "nvidia-smi not found. Install NVIDIA drivers first."
fi
GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader 2>/dev/null | head -1)
ok "GPU: ${GPU_NAME:-unknown} (${VRAM:-?})"
RECOMMENDED="$(recommend_gpu_model)"
ok "VRAM-based default model: $RECOMMENDED"

# -- Docker + NVIDIA container toolkit ----------------------------
if [[ "$REGISTER_ONLY" != "true" ]]; then
step "Checking Docker and NVIDIA Container Toolkit"
command -v docker >/dev/null 2>&1 || fail "Docker not found. Install: curl -fsSL https://get.docker.com | sh"
if ! docker info 2>/dev/null | grep -q "nvidia"; then
  echo "Installing NVIDIA Container Toolkit..."
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq nvidia-container-toolkit
  sudo nvidia-ctk runtime configure --runtime=docker
  sudo systemctl restart docker
  ok "NVIDIA Container Toolkit installed"
else
  ok "NVIDIA Container Toolkit already configured"
fi
fi

# -- Start Ollama container ----------------------------------------
step "Starting Ollama GPU container"
cd "$SCRIPT_DIR"
docker compose up -d
echo "Waiting for Ollama..."
for i in {1..20}; do
  curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1 && break
  sleep 3
done
curl -sf "http://localhost:11434/api/tags" >/dev/null 2>&1 || fail "Ollama didn't start. Check: docker compose logs"
ok "Ollama running"

# -- Resolve model from Ollama + optional pull --------------------
step "Syncing model name with server (from Ollama in container)"
MODEL=""
set +e
MODEL="$(resolve_registration_model "$RECOMMENDED")"
rc=$?
set -e
if [[ "$rc" -eq 0 ]]; then
  ok "Will register: $MODEL (recommended for this GPU: $RECOMMENDED)"
elif [[ "$rc" -eq 3 ]]; then
  step "Pulling $RECOMMENDED (no models in container yet)"
  ollama_pull "$RECOMMENDED"
  MODEL="$(resolve_after_pull "$RECOMMENDED")" || fail "Could not resolve model after pull"
  ok "Model ready: $MODEL"
else
  fail "Could not read Ollama tags at $OLLAMA_TAGS_URL"
fi

# -- Test ----------------------------------------------------------
step "Testing model"
RESPONSE=$(docker exec dnd5e_ollama_gpu ollama run "$MODEL" \
  "Reply in exactly 5 words: this GPU worker is ready" 2>/dev/null || echo "test skipped")
ok "Test: $RESPONSE"

# -- Register with server over HTTP (no SSH!) ----------------------
step "Registering with D&D server at http://$SERVER_IP:$SERVER_PORT"

WORKER_HOST="$(hostname -s 2>/dev/null || hostname)"
HTTP_STATUS="$(dnd_register_worker "$MY_IP" "$MODEL" "$WORKER_HOST")"

if [ "$HTTP_STATUS" = "200" ]; then
  ok "Registered successfully! LiteLLM config updated on server."
  cat /tmp/dnd_register_response.json 2>/dev/null || true
else
  warn "Could not reach server (HTTP $HTTP_STATUS)."
  warn "Make sure the D&D app is running on $SERVER_IP."
  WORKER_ESC="${WORKER_HOST//\\/\\\\}"
  WORKER_ESC="${WORKER_ESC//\"/\\\"}"
  PAYLOAD="{\"ip\":\"$MY_IP\",\"model\":\"$MODEL\",\"hostname\":\"$WORKER_ESC\"}"
  warn "Register manually later: curl -X POST http://$SERVER_IP:$SERVER_PORT/api/workers/register -H 'Content-Type: application/json' -d '$PAYLOAD'"
fi

echo ""
echo -e "${GREEN}${BOLD}==========================================${RESET}"
echo -e "${GREEN}${BOLD}  GPU Worker ready!${RESET}"
echo "  This machine: $MY_IP"
echo "  Model:        $MODEL (synced from Ollama → LiteLLM)"
echo "  Ollama port:  11434"
echo ""
echo "  Verify: curl http://$SERVER_IP:$SERVER_PORT/api/workers"
echo -e "${GREEN}${BOLD}==========================================${RESET}"
