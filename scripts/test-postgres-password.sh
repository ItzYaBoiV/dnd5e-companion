#!/usr/bin/env bash
# From repo root: see whether a password works against the running postgres container.
# Does not print passwords.
#
#   ./scripts/test-postgres-password.sh
#   ./scripts/test-postgres-password.sh 'maybe-old-password'
#
# Requires: stack up (docker compose up -d), .env with POSTGRES_USER / POSTGRES_DB set.
set -e
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  echo "No .env in repo root — create one (see .env.example)." >&2
  exit 1
fi

PGU="${POSTGRES_USER:-dnd5e_user}"
PGD="${POSTGRES_DB:-dnd5e_db}"

try_pw() {
  local pw="$1"
  docker compose exec -T -e PGPASSWORD="$pw" postgres \
    psql -U "$PGU" -d "$PGD" -tAc 'SELECT 1' >/dev/null 2>&1
}

echo "Checking postgres container is running..."
docker compose exec -T postgres true >/dev/null 2>&1 || {
  echo "Postgres container not available. Run: docker compose up -d" >&2
  exit 1
}

echo "Testing POSTGRES_PASSWORD from .env..."
if try_pw "$POSTGRES_PASSWORD"; then
  echo "OK — the password in .env matches the database user."
  exit 0
fi
echo "  (failed)"

if [ -n "${1:-}" ]; then
  echo "Testing alternate password (from first argument)..."
  if try_pw "$1"; then
    echo "OK — the alternate password works, but .env does NOT match the DB."
    echo "    Either set POSTGRES_PASSWORD in .env to that value, or recreate the volume:"
    echo "    docker compose down && docker volume rm <project>_postgres_data && docker compose up -d"
    exit 2
  fi
  echo "  (failed)"
fi

echo "No working password found. If the DB volume was created with different credentials,"
echo "use the original password or remove the postgres volume (data loss) and redeploy."
exit 1
