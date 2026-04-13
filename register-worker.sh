#!/bin/bash
# register-worker.sh — Manually register an AI worker with the D&D server
# No SSH needed — talks to the server over HTTP.
#
# Usage:
#   ./register-worker.sh 192.168.5.10 llama3.1:8b
#   ./register-worker.sh 192.168.5.20 qwen2.5:14b
#   ./register-worker.sh --sync 192.168.5.20           # read Ollama /api/tags on worker, pick best name
#   ./register-worker.sh --sync 192.168.5.20 qwen2.5:14b [HOSTNAME]

SERVER_IP="${SERVER_IP:-192.168.5.7}"
SERVER_PORT="${SERVER_PORT:-56791}"
GREEN='\033[0;32m'; GOLD='\033[0;33m'; RED='\033[0;31m'; RESET='\033[0m'; BOLD='\033[1m'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PICK_PY="$ROOT/ai-workers/lib/pick_ollama_model.py"

WORKER_IP=""
MODEL=""
WORKER_HOST=""

if [ "${1:-}" = "--sync" ] || [ "${1:-}" = "-s" ]; then
  WORKER_IP="${2:-}"
  PREF="${3:-}"
  WORKER_HOST="${4:-}"
  if [ -z "$WORKER_IP" ]; then
    echo -e "${RED}Usage: ./register-worker.sh --sync <WORKER_IP> [PREFERRED_MODEL] [HOSTNAME]${RESET}"
    exit 1
  fi
  if [ ! -f "$PICK_PY" ]; then
    echo -e "${RED}Missing $PICK_PY${RESET}"
    exit 1
  fi
  echo -e "${GOLD}Fetching Ollama tags from http://${WORKER_IP}:11434 ...${RESET}"
  TAGS=$(curl -sf --connect-timeout 5 "http://${WORKER_IP}:11434/api/tags") || {
    echo -e "${RED}Could not reach Ollama on ${WORKER_IP}:11434${RESET}"
    exit 1
  }
  if ! MODEL=$(echo "$TAGS" | python3 "$PICK_PY" "$PREF"); then
    echo -e "${RED}No models on worker — run ollama pull on that machine first.${RESET}"
    exit 1
  fi
  echo -e "${GREEN}Resolved model from worker: ${MODEL}${RESET}"
else
  WORKER_IP="$1"
  MODEL="${2:-llama3.1:8b}"
  WORKER_HOST="${3:-$(hostname -s 2>/dev/null || hostname)}"
fi

: "${WORKER_HOST:=}"

if [ -z "$WORKER_IP" ] || [ -z "$MODEL" ]; then
  echo -e "${RED}Usage: ./register-worker.sh <WORKER_IP> [MODEL] [HOSTNAME]${RESET}"
  echo "  HOSTNAME defaults to this machine's hostname (override when registering a remote IP)."
  echo "  Or: ./register-worker.sh --sync <WORKER_IP> [PREFERRED_MODEL]"
  echo "  Examples:"
  echo "    ./register-worker.sh 192.168.5.10 llama3.1:8b"
  echo "    ./register-worker.sh 192.168.5.20 qwen2.5:14b gpu-rig"
  echo "    ./register-worker.sh --sync 192.168.5.20"
  exit 1
fi

WORKER_ESC="${WORKER_HOST//\\/\\\\}"
WORKER_ESC="${WORKER_ESC//\"/\\\"}"

echo -e "${GOLD}${BOLD}Registering worker: $WORKER_IP ($MODEL)${RESET}"

HTTP_STATUS=$(curl -s -o /tmp/register_response.json -w "%{http_code}" \
  -X POST "http://$SERVER_IP:$SERVER_PORT/api/workers/register" \
  -H "Content-Type: application/json" \
  -d "{\"ip\":\"$WORKER_IP\",\"model\":\"$MODEL\",\"hostname\":\"$WORKER_ESC\"}" \
  --connect-timeout 10 || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo -e "${GREEN}[OK] Registered!${RESET}"
  cat /tmp/register_response.json 2>/dev/null && echo ""
else
  echo -e "${RED}[X]  Failed (HTTP $HTTP_STATUS). Is the app running on $SERVER_IP:$SERVER_PORT?${RESET}"
  exit 1
fi

echo ""
echo "Check all workers: curl http://$SERVER_IP:$SERVER_PORT/api/workers"
