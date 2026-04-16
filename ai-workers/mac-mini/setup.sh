#!/bin/bash
# ══════════════════════════════════════════════════════
#  D&D 5e AI Worker Setup — Mac Mini M4
#  Server (192.168.5.7) will route requests here via
#  LiteLLM. Ollama runs natively with Neural Engine.
# ══════════════════════════════════════════════════════
set -e

SERVER_IP="192.168.5.7"

echo "Setting up Mac Mini M4 as AI worker for $SERVER_IP..."
echo ""

# Install Ollama if not present
if ! command -v ollama &> /dev/null; then
  echo "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
fi

# Confirm the model
echo "Pulling qwen2.5:14b (best quality for M4 Neural Engine, fits in 16GB)..."
OLLAMA_HOST=0.0.0.0 ollama pull qwen2.5:14b

echo ""
echo "Testing model..."
OLLAMA_HOST=0.0.0.0 ollama run qwen2.5:14b \
  "Reply with exactly 5 words: this mac mini is ready"

echo ""
echo "══════════════════════════════════════════════════════"
echo " Mac Mini M4 Worker ready!"
echo ""
echo " To START the worker (run this in a terminal):"
echo "   OLLAMA_HOST=0.0.0.0 ollama serve"
echo ""
echo " To START automatically on login, add to ~/.zprofile:"
echo "   echo 'OLLAMA_HOST=0.0.0.0 ollama serve > /tmp/ollama.log 2>&1 &' >> ~/.zprofile"
echo ""
echo " Find this Mac's LAN IP and add it to:"
echo "   $SERVER_IP:~/Docker/dnd5e-companion/ai-workers/load-balancer/litellm-config.yaml"
echo ""
echo " Find your LAN IP with:"
echo "   ifconfig | grep 'inet ' | grep -v 127"
echo "══════════════════════════════════════════════════════"
