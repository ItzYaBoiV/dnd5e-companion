#!/bin/bash
# Shared helpers for Mac / Linux GPU worker installers.
# Source from install-*.sh after setting _DND_LIB to this directory.

: "${DND_SERVER_IP:=192.168.5.7}"
: "${DND_SERVER_PORT:=56791}"
: "${OLLAMA_TAGS_URL:=http://127.0.0.1:11434/api/tags}"

pick_script() {
  echo "${_DND_LIB}/pick_ollama_model.py"
}

# Override in install-linux.sh after sourcing: ollama_pull() { docker exec ... pull "$1"; }
ollama_pull() {
  ollama pull "$1"
}

get_ollama_tags_json() {
  curl -sf "$OLLAMA_TAGS_URL"
}

# Args: hardware-recommended model (e.g. qwen2.5:14b). Prints resolved name on stdout.
# If Ollama already has models, picks best match or best installed (no unnecessary pull).
# Exit 3 = zero models installed but preferred given → caller should ollama pull preferred.
resolve_registration_model() {
  local preferred="$1"
  local tags py resolved ec
  py="$(pick_script)"
  tags="$(get_ollama_tags_json)" || return 1
  set +e
  resolved=$(echo "$tags" | python3 "$py" "$preferred")
  ec=$?
  set -e
  if [[ "$ec" -eq 0 ]]; then
    echo "$resolved"
    return 0
  fi
  if [[ "$ec" -eq 3 ]]; then
    return 3
  fi
  return 2
}

# After pull: must print one model name.
resolve_after_pull() {
  local preferred="$1"
  local tags py resolved ec
  py="$(pick_script)"
  tags="$(get_ollama_tags_json)" || return 1
  set +e
  resolved=$(echo "$tags" | python3 "$py" "$preferred")
  ec=$?
  set -e
  if [[ "$ec" -ne 0 || -z "$resolved" ]]; then
    return 1
  fi
  echo "$resolved"
}

dnd_register_worker() {
  local my_ip="$1"
  local model="$2"
  local worker_host="$3"
  local register_url payload esc status

  register_url="http://${DND_SERVER_IP}:${DND_SERVER_PORT}/api/workers/register"
  esc="${worker_host//\\/\\\\}"
  esc="${esc//\"/\\\"}"
  payload="$(printf '{"ip":"%s","model":"%s","hostname":"%s"}' "$my_ip" "$model" "$esc")"

  status="$(curl -s -o /tmp/dnd_register_response.json -w "%{http_code}" \
    -X POST "$register_url" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --connect-timeout 10 || echo "000")"

  echo "$status"
}
