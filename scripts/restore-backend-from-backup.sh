#!/usr/bin/env bash
# Restore backend TypeScript + Prisma from a full project copy (e.g. Desktop\dnd5e-src).
#
# Usage (from repo root, Linux / WSL / Git Bash):
#   chmod +x scripts/restore-backend-from-backup.sh
#   ./scripts/restore-backend-from-backup.sh /path/to/dnd5e-src
#
# WSL example (your PC):
#   ./scripts/restore-backend-from-backup.sh /mnt/c/Users/xjkzo/Desktop/dnd5e-src
#
# The backup root must contain: backend/src/ and ideally backend/prisma/
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_ROOT="${1:?Pass path to dnd5e-src (or repo root that contains backend/)}"

if [[ ! -d "$SRC_ROOT/backend/src" ]]; then
  echo "ERROR: $SRC_ROOT/backend/src not found."
  echo "Check the path — folder should look like: <backup>/backend/src/..."
  exit 1
fi

echo "Restoring from: $SRC_ROOT"
echo "Into:           $ROOT/backend"

rsync -a --delete \
  --exclude node_modules \
  "$SRC_ROOT/backend/src/" "$ROOT/backend/src/"

if [[ -d "$SRC_ROOT/backend/prisma" ]]; then
  read -r -p "Also overwrite backend/prisma/ from backup? [y/N] " ans
  if [[ "${ans,,}" == "y" ]]; then
    rsync -a --delete \
      "$SRC_ROOT/backend/prisma/" "$ROOT/backend/prisma/"
    echo "If encounter pools use location-tagged monsters, re-apply LocationMonster in schema.prisma"
    echo "(see scripts/snippet-location-monster.prisma) or run: git diff HEAD -- backend/prisma/schema.prisma"
  fi
else
  echo "No backend/prisma in backup — keeping current prisma/"
fi

echo "Running backend build..."
(cd "$ROOT/backend" && npm run build)

echo "Done. If build failed, paste the error output."
