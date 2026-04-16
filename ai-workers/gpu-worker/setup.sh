#!/bin/bash
# ══════════════════════════════════════════════════════
#  D&D 5e AI Worker Setup — RTX 3080 Ti GPU Machine
#  Server (192.168.5.7) will route requests here via
#  LiteLLM. This machine just needs to run Ollama.
# ══════════════════════════════════════════════════════
set -e

SERVER_IP="192.168.5.7"

echo "Starting Ollama GPU worker..."
echo "This machine will receive AI generation jobs from $SERVER_IP"
echo ""

# Start the container if not already running
if ! docker ps | grep -q dnd5e_ollama_gpu; then
  docker compose up -d
fi

echo "Pulling llama3.1:8b (optimised for 12GB VRAM on RTX 3080 Ti)..."
docker exec dnd5e_ollama_gpu ollama pull llama3.1:8b

echo ""
echo "Testing model..."
docker exec dnd5e_ollama_gpu ollama run llama3.1:8b \
  "Reply with exactly 5 words: this GPU worker is ready"

echo ""
echo "══════════════════════════════════════════════════════"
echo " GPU Worker ready!"
echo ""
echo " Ollama is listening on port 11434."
echo " Find this machine's LAN IP and add it to:"
echo "   $SERVER_IP:~/Docker/dnd5e-companion/ai-workers/load-balancer/litellm-config.yaml"
echo ""
echo " Find your LAN IP with:"
echo "   Linux:   ip addr | grep 'inet ' | grep -v 127"
echo "   Windows: ipconfig | findstr IPv4"
echo "══════════════════════════════════════════════════════"
