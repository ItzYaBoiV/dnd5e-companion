#!/bin/bash
# Append recent container logs into logs/litellm/ and logs/backend/ for debugging.
# Run from repo root on the Docker host.

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/logs/litellm" "$ROOT/logs/backend"

stamp="$(date -Is 2>/dev/null || date)"

{
  echo "======== $stamp  dnd5e_litellm ========"
  docker logs dnd5e_litellm --tail 800 2>&1 || echo "(container not found)"
} >> "$ROOT/logs/litellm/litellm-docker.log"

{
  echo "======== $stamp  dnd5e_backend ========"
  docker logs dnd5e_backend --tail 400 2>&1 || echo "(container not found)"
} >> "$ROOT/logs/backend/docker-recent.log"

echo "Wrote tails to:"
echo "  $ROOT/logs/litellm/litellm-docker.log"
echo "  $ROOT/logs/backend/docker-recent.log"
