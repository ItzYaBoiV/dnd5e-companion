#!/bin/bash
# ══════════════════════════════════════════════════════════════════
#  D&D 5e Companion — Server Setup Wizard
#  Run this on 192.168.5.7 to configure and launch everything.
# ══════════════════════════════════════════════════════════════════
set -e
set +H # do not expand ! in messages (e.g. "Seed complete!") — can break following lines

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GOLD='\033[0;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

banner() {
  echo ""
  echo -e "${GOLD}${BOLD}══════════════════════════════════════════════════${RESET}"
  echo -e "${GOLD}${BOLD}   D&D 5e Companion — Deploy Wizard${RESET}"
  echo -e "${GOLD}${BOLD}   Server: 192.168.5.7${RESET}"
  echo -e "${GOLD}${BOLD}══════════════════════════════════════════════════${RESET}"
  echo ""
}

step()  { echo -e "\n${CYAN}${BOLD}▶ $1${RESET}"; }
ok()    { echo -e "${GREEN}✓ $1${RESET}"; }
warn()  { echo -e "${GOLD}⚠ $1${RESET}"; }
fail()  { echo -e "${RED}✗ $1${RESET}"; exit 1; }
ask()   { echo -e "${BOLD}$1${RESET}"; }

# Compose does not set DATABASE_URL (passwords with @ : # break YAML interpolation).
# Backend image sets it in the entrypoint; `docker compose exec` needs the same URL — use this helper.
# Usage: backend_with_db 'npx prisma db push --accept-data-loss'
backend_with_db() {
  docker compose exec -T backend sh -c 'export DATABASE_URL="$(node /app/scripts/print-database-url.cjs)" && '"$1"
}

# Shown when user skips seed — heredoc avoids bash misparsing a long echo as a command.
print_manual_seed_command() {
  cat << 'HELP'
  docker compose exec -T backend sh -c 'export DATABASE_URL="$(node /app/scripts/print-database-url.cjs)" && node dist/services/seedService.js'
HELP
}

banner

# LiteLLM / GPU worker stack (optional). Default: skip — app does not require AI.
# To deploy the load balancer on this host:  DEPLOY_LITELLM=1 ./deploy.sh
DEPLOY_LITELLM="${DEPLOY_LITELLM:-0}"

# ── Prereqs ───────────────────────────────────────────────────────
step "Checking prerequisites"
command -v docker  >/dev/null 2>&1 || fail "Docker not found. Install: curl -fsSL https://get.docker.com | sh"
command -v curl    >/dev/null 2>&1 || fail "curl not found. Install: sudo apt install curl"
command -v python3 >/dev/null 2>&1 || warn "python3 not found — some output formatting will be skipped"
ok "Docker: $(docker --version | cut -d' ' -f3 | tr -d ',')"

# ── Subnet detection (integrated) ─────────────────────────────────
# Main compose needs an explicit /24. Optional LiteLLM project needs another /24
# when DEPLOY_LITELLM=1 — otherwise Docker's default pools can exhaust subnets.
step "Finding free Docker subnet(s)"
USED=$(docker network ls -q | xargs docker network inspect \
  --format '{{range .IPAM.Config}}{{.Subnet}}{{"\n"}}{{end}}' 2>/dev/null \
  | grep -v '^$' | sort -u)

find_free_subnet_in_pool() {
  local pool="$1"
  local i candidate
  for i in $(seq 20 29); do
    candidate="172.${i}.0.0/24"
    if ! echo "$pool" | grep -qE "172\.${i}\."; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  for i in $(seq 200 220); do
    candidate="10.0.${i}.0/24"
    if ! echo "$pool" | grep -qE "10\.0\.${i}\."; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

FREE=$(find_free_subnet_in_pool "$USED") || fail "No free subnet for app network. Try: docker network prune -f  OR  sudo bash fix-docker-address-pools.sh && sudo systemctl restart docker"

sed -i "s|subnet:.*|subnet: $FREE|" docker-compose.yml

if [ "$DEPLOY_LITELLM" = "1" ]; then
  FREE_LITELLM=$(find_free_subnet_in_pool "$USED"$'\n'"$FREE") || fail "No free subnet for LiteLLM network. Try: docker network prune -f  OR  sudo bash fix-docker-address-pools.sh && sudo systemctl restart docker"
  LITELLM_COMPOSE_NET="$SCRIPT_DIR/ai-workers/load-balancer/docker-compose.yml"
  [ -f "$LITELLM_COMPOSE_NET" ] || fail "Missing $LITELLM_COMPOSE_NET"
  sed -i "s|subnet:.*|subnet: $FREE_LITELLM|" "$LITELLM_COMPOSE_NET"
  ok "Using subnets: app $FREE, LiteLLM $FREE_LITELLM"
else
  ok "Using subnet: app $FREE (LiteLLM skipped — set DEPLOY_LITELLM=1 to deploy AI load balancer)"
fi

# ── Database config ───────────────────────────────────────────────
step "Database Configuration"

if [ -f .env ]; then
  ok "Using existing .env (docker compose loads it automatically from this directory; we will also source it for shell/psql)"
else
  ask "No .env found — create one now (first-time setup)."
  ask "PostgreSQL username [dnd5e_user]:"
  read -r PG_USER; PG_USER="${PG_USER:-dnd5e_user}"

  while true; do
    ask "PostgreSQL password (min 12 chars):"
    read -rs PG_PASS; echo ""
    [ ${#PG_PASS} -ge 12 ] && break || warn "Password must be at least 12 characters."
  done

  ask "PostgreSQL database name [dnd5e_db]:"
  read -r PG_DB; PG_DB="${PG_DB:-dnd5e_db}"

  if [ "$DEPLOY_LITELLM" = "1" ]; then
    AI_ENV_BLOCK="# LiteLLM on the Docker host — must NOT be localhost (that is the backend container itself)
AI_BASE_URL=http://host.docker.internal:4000
AI_MODEL=dnd-generator"
  else
    AI_ENV_BLOCK="# Optional AI (LiteLLM): deploy with DEPLOY_LITELLM=1, start load balancer, then e.g.
# AI_BASE_URL=http://host.docker.internal:4000
# AI_MODEL=dnd-generator"
  fi

  cat > .env << EOF
# Generated by deploy.sh on $(date)
POSTGRES_USER=${PG_USER}
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=${PG_DB}
# Optional override (default in compose is dnd5e_postgres — matches container_name / always resolves)
# POSTGRES_HOST=dnd5e_postgres
NODE_ENV=production
${AI_ENV_BLOCK}
SEED_ON_START=false
# Optional: full URL if you manage encoding yourself (otherwise omit — entrypoint builds from POSTGRES_*)
# DATABASE_URL=
EOF
  ok ".env created"
fi

# Compose reads .env; we also need POSTGRES_* in this shell for psql seed checks.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
# Same values docker compose will inject into postgres/backend — must be non-empty.
if [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_DB:-}" ] || [ -z "${POSTGRES_PASSWORD:-}" ]; then
  fail "Set non-empty POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB in .env. Deploy never hardcodes DB passwords."
fi

# ── Dungeon Forge (source: frontend/src/components/dungeon-forge/DungeonForgeImpl.jsx) ──
step "Dungeon Forge build hook"
if [ -f scripts/build-dungeon-forge.mjs ]; then
  node scripts/build-dungeon-forge.mjs || fail "Dungeon Forge hook failed (scripts/build-dungeon-forge.mjs)"
  ok "Dungeon Forge hook OK (impl is DungeonForgeImpl.jsx in-repo)"
else
  warn "scripts/build-dungeon-forge.mjs not found — skipping"
fi

# ── Build containers ──────────────────────────────────────────────
step "Building Docker containers (first build takes 5–10 minutes)"
docker compose build --no-cache
ok "Build complete"

# ── Start app services ────────────────────────────────────────────
step "Starting PostgreSQL, backend, and frontend"
docker compose up -d

echo "Waiting for database to be ready..."
for i in {1..30}; do
  docker compose exec -T postgres pg_isready -q 2>/dev/null && break
  sleep 2
done
ok "Database ready"

# Backend must accept exec; Docker DNS for hostname `postgres` can lag right after up -d
echo "Waiting for backend container..."
for i in $(seq 1 45); do
  docker compose exec -T backend true 2>/dev/null && break
  sleep 1
done
sleep 2

# ── Apply schema ──────────────────────────────────────────────────
step "Applying database schema"
SCHEMA_OK=0
for i in $(seq 1 60); do
  if backend_with_db 'npx prisma db push --accept-data-loss'; then
    SCHEMA_OK=1
    break
  fi
  echo "  Prisma could not reach postgres yet ($i/60) — retrying in 2s..."
  sleep 2
done
[[ "$SCHEMA_OK" -eq 1 ]] || fail "Schema push failed after retries. Check: docker compose ps && docker compose logs backend postgres"
ok "Schema applied — all tables created"

# ── AI / LiteLLM (optional) ───────────────────────────────────────
if [ "$DEPLOY_LITELLM" = "1" ]; then
  step "AI Worker Configuration"
  echo "Workers are not scanned from the network. Each machine runs an install script that"
  echo "detects its own LAN IP and POSTs to the API (POST /api/workers/register) — no SSH."
  echo "The backend then refreshes LiteLLM. It also periodically re-syncs model names from"
  echo "known IPs (WORKER_RECONCILE_MS, default 5 min) — that is not LAN discovery."
  echo ""
  echo "Optional pre-seed (only if LiteLLM must route before any worker script runs):"
  echo "  export DEPLOY_LITELLM_WORKERS='192.168.5.10:qwen2.5:14b 192.168.5.20'"
  echo "  (use ip:model per entry; model defaults to qwen2.5:14b if omitted)"
  echo ""

  mkdir -p ai-workers/load-balancer

  WORKER_ENTRIES=""
  if [ -n "${DEPLOY_LITELLM_WORKERS:-}" ]; then
    for entry in $DEPLOY_LITELLM_WORKERS; do
      [ -z "$entry" ] && continue
      W_IP=""
      W_MODEL="qwen2.5:14b"
      case "$entry" in
        *:*)
          W_IP="${entry%%:*}"
          W_MODEL="${entry#*:}"
          [ -z "$W_MODEL" ] && W_MODEL="qwen2.5:14b"
          ;;
        *)
          W_IP="$entry"
          ;;
      esac
      [ -z "$W_IP" ] && continue
      entry_block=$(cat <<EOF
  - model_name: dnd-generator
    litellm_params:
      model: ollama/${W_MODEL}
      api_base: http://${W_IP}:11434
      timeout: 1800
EOF
)
      WORKER_ENTRIES="${WORKER_ENTRIES}
${entry_block}"
      ok "Pre-seed entry: ${W_IP} / ${W_MODEL}"
    done
  fi

  if [ -z "$WORKER_ENTRIES" ]; then
    ok "No DEPLOY_LITELLM_WORKERS — LiteLLM routes will appear when workers self-register."
  fi

  step "Writing LiteLLM load balancer config"

  LITELLM_YAML="$SCRIPT_DIR/ai-workers/load-balancer/litellm-config.yaml"
  SKIP_LITELLM_REWRITE=0

  # If the operator skips entering IPs, DO NOT wipe an existing config — that removes workers
  # registered earlier via POST /api/workers/register and leaves LiteLLM with model_list: [].
  if [ -z "$WORKER_ENTRIES" ]; then
    if [ -f "$LITELLM_YAML" ] && grep -qE 'api_base:[[:space:]]*http://' "$LITELLM_YAML"; then
      warn "Keeping existing worker routes in $LITELLM_YAML (you skipped entering IPs)."
      SKIP_LITELLM_REWRITE=1
    else
      MODEL_LIST_BLOCK="model_list: []"
    fi
  else
    MODEL_LIST_BLOCK="model_list:
${WORKER_ENTRIES}"
  fi

  if [ "$SKIP_LITELLM_REWRITE" -eq 0 ]; then
    # Comment-only under model_list: is invalid YAML → LiteLLM sees no routes.
    cat > "$LITELLM_YAML" << EOF
# LiteLLM Load Balancer — managed by D&D app
# Workers auto-update this file when they register via HTTP.

${MODEL_LIST_BLOCK}
router_settings:
  routing_strategy: least-busy
  num_retries: 2
  timeout: 1800

litellm_settings:
  max_tokens: 8192
  request_timeout: 1800
EOF
    ok "LiteLLM config written"
  else
    ok "LiteLLM config file not overwritten (existing routes preserved)"
  fi

  LITELLM_COMPOSE="$SCRIPT_DIR/ai-workers/load-balancer/docker-compose.yml"
  [ -f "$LITELLM_COMPOSE" ] || fail "Missing $LITELLM_COMPOSE — restore it from the project."
  if [ "$(grep -c '^    image:' "$LITELLM_COMPOSE" 2>/dev/null || echo 0)" -ne 1 ]; then
    fail "Invalid $LITELLM_COMPOSE: expected exactly one '    image:' line (fix duplicates manually)."
  fi

  step "Starting LiteLLM AI load balancer"

  litellm_registry_dns_hint() {
    echo ""
    echo -e "${RED}Docker could not reach the image registry (host DNS problem).${RESET}"
    echo "  Typical error: lookup registry-1.docker.io on 127.0.0.53:53: server misbehaving"
    echo "  daemon.json \"dns\" fixes containers — pulls use host DNS."
    echo -e "    ${CYAN}./fix-docker-dns.sh${RESET}  (try: sudo resolvectl dns enp2s0 8.8.8.8 1.1.1.1)"
    echo "  Until  getent hosts registry-1.docker.io  prints an IP, pulls will fail."
    echo ""
  }

  if command -v getent >/dev/null 2>&1; then
    if ! getent hosts registry-1.docker.io >/dev/null 2>&1; then
      warn "This host cannot resolve registry-1.docker.io — LiteLLM image pull will likely fail."
      litellm_registry_dns_hint
    fi
  fi

  cd ai-workers/load-balancer
  if ! docker compose pull; then
    litellm_registry_dns_hint
    cd "$SCRIPT_DIR"
    fail "LiteLLM image pull failed — fix host DNS for Docker, then: cd ai-workers/load-balancer && docker compose pull && docker compose up -d"
  fi
  if ! docker compose up -d; then
    cd "$SCRIPT_DIR"
    fail "docker compose up failed in ai-workers/load-balancer"
  fi
  # compose up does not reload config from disk if the container was already running
  docker compose restart litellm 2>/dev/null || true
  cd "$SCRIPT_DIR"

  sleep 5
  if curl -sf http://localhost:4000/health >/dev/null 2>&1; then
    ok "LiteLLM is running on port 4000"
  else
    warn "LiteLLM may still be starting — check: docker logs dnd5e_litellm"
  fi
else
  step "Skipping LiteLLM / AI load balancer"
  ok "Not deploying LiteLLM (default). To enable: DEPLOY_LITELLM=1 ./deploy.sh"
fi

# ── Seed SRD data ─────────────────────────────────────────────────
step "SRD Data"

PGU="${POSTGRES_USER:-dnd5e_user}"
PGD="${POSTGRES_DB:-dnd5e_db}"
SEED_LOOKS_DONE=0
SPELL_N=0
MON_N=0
RACE_N=0
CLASS_FEAT_N=0
CURRENT_SEED_SIG=""
SEED_STATE_FILE="$SCRIPT_DIR/.deploy-state/last_srd_seed_signature.txt"

read_seed_signature() {
  if ! docker compose exec -T postgres pg_isready -q 2>/dev/null; then
    return 1
  fi
  docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres psql -U "$PGU" -d "$PGD" -tAc \
    "SELECT concat_ws(',', (SELECT COUNT(*)::text FROM \"Spell\"), (SELECT COUNT(*)::text FROM \"Monster\"), (SELECT COUNT(*)::text FROM \"Race\"), (SELECT COUNT(*)::text FROM \"ClassFeature\"));" \
    2>/dev/null | tr -d ' \r'
}

hydrate_seed_counts() {
  local raw="$1"
  if [[ -z "$raw" || "$raw" != *","*","*","* ]]; then
    return 1
  fi
  IFS=',' read -r SPELL_N MON_N RACE_N CLASS_FEAT_N <<< "$raw"
  SPELL_N="${SPELL_N:-0}"
  MON_N="${MON_N:-0}"
  RACE_N="${RACE_N:-0}"
  CLASS_FEAT_N="${CLASS_FEAT_N:-0}"
  CURRENT_SEED_SIG="${SPELL_N},${MON_N},${RACE_N},${CLASS_FEAT_N}"
  return 0
}

SEED_RAW="$(read_seed_signature || true)"
if hydrate_seed_counts "$SEED_RAW"; then
  # Class features come from Open5e class tables; older seeds left this table empty.
  if [[ "$SPELL_N" =~ ^[0-9]+$ && "$MON_N" =~ ^[0-9]+$ && "$RACE_N" =~ ^[0-9]+$ && "$CLASS_FEAT_N" =~ ^[0-9]+$ \
    && "$SPELL_N" -ge 80 && "$MON_N" -ge 80 && "$RACE_N" -ge 8 && "$CLASS_FEAT_N" -ge 80 ]]; then
    SEED_LOOKS_DONE=1
  fi
fi

run_full_seed() {
  echo ""
  echo -e "${CYAN}Seeding SRD data — you'll see each section as it completes:${RESET}"
  echo ""
  backend_with_db 'node dist/services/seedService.js'
  mkdir -p "$(dirname "$SEED_STATE_FILE")"
  local new_raw
  new_raw="$(read_seed_signature || true)"
  if hydrate_seed_counts "$new_raw" && [[ -n "$CURRENT_SEED_SIG" ]]; then
    printf '%s\n' "$CURRENT_SEED_SIG" > "$SEED_STATE_FILE"
  fi
  ok "Seed complete!"
}

if [[ "$SEED_LOOKS_DONE" -eq 1 ]]; then
  echo "Reference tables already look populated (SRD-scale): Spell=$SPELL_N, Monster=$MON_N, Race=$RACE_N, ClassFeature=$CLASS_FEAT_N."
  echo "Re-seeding replaces/updates data and usually takes ~5–15 minutes."
  LAST_SEED_SIG=""
  if [[ -f "$SEED_STATE_FILE" ]]; then
    LAST_SEED_SIG="$(tr -d ' \r\n' < "$SEED_STATE_FILE" || true)"
  fi
  if [[ -n "$CURRENT_SEED_SIG" && "$CURRENT_SEED_SIG" == "$LAST_SEED_SIG" && "${FORCE_SEED:-0}" != "1" ]]; then
    ok "Seed data signature unchanged from last deploy ($CURRENT_SEED_SIG) — auto-skipping seed."
  else
    ask 'Skip seed and keep existing data? (Y/n):'
    read -r DO_SEED
    if [[ "$DO_SEED" =~ ^[Nn]$ ]]; then
      run_full_seed
    else
      mkdir -p "$(dirname "$SEED_STATE_FILE")"
      if [[ -n "$CURRENT_SEED_SIG" ]]; then
        printf '%s\n' "$CURRENT_SEED_SIG" > "$SEED_STATE_FILE"
      fi
      ok "Skipped seed — existing reference data kept."
    fi
  fi
else
  echo "Seed all D&D 5e SRD data? Races, classes, spells, monsters, items, etc."
  echo "Takes ~5–15 minutes. Progress shown per section."
  ask 'Seed now? (Y/n):'
  read -r DO_SEED
  if [[ ! "$DO_SEED" =~ ^[Nn]$ ]]; then
    run_full_seed
  else
    warn "Skipped. Seed later with:"
    print_manual_seed_command
  fi
fi

# ── Done ──────────────────────────────────────────────────────────
echo ""
echo -e "${GOLD}${BOLD}══════════════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  All done!${RESET}"
echo ""
echo -e "  App:     ${CYAN}http://192.168.5.7:56790${RESET}"
echo -e "  API:     ${CYAN}http://192.168.5.7:56791${RESET}"
echo -e "  Domain:  ${CYAN}https://dnd5e.d20madjd.quest${RESET}"
echo ""
echo -e "  ${BOLD}Quick status check:${RESET}"
echo "  curl http://localhost:56791/api/workers | python3 -m json.tool"
echo ""
echo -e "  ${BOLD}Optional AI (LiteLLM + workers) — not started by default:${RESET}"
echo "    DEPLOY_LITELLM=1 ./deploy.sh"
echo ""
echo -e "  ${BOLD}Worker setup (if using AI):${RESET}"
echo "    GPU (Linux):   bash ai-workers/gpu-worker/install-linux.sh"
echo "    GPU (Windows): .\\install-windows.ps1"
echo "    Mac Mini:      bash ai-workers/mac-mini/install-mac.sh"
echo ""
echo -e "${GOLD}${BOLD}══════════════════════════════════════════════════${RESET}"
