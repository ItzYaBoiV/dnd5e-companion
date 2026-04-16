#!/usr/bin/env bash
# Compare this workspace's backend against another checkout (e.g. fresh git clone).
#
#   git clone https://github.com/ItzYaBoiV/dnd5e-companion.git /tmp/dnd5e-upstream
#   cd /path/to/this/workspace
#   ./scripts/compare-backend.sh /tmp/dnd5e-upstream
#
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OTHER="${1:?Usage: $0 /path/to/other/dnd5e-companion}"

if [[ ! -d "$OTHER/backend/src" ]]; then
  echo "ERROR: $OTHER/backend/src not found."
  exit 1
fi

echo "=== File count ==="
echo -n "This workspace: "; find "$HERE/backend/src" -name '*.ts' | wc -l
echo -n "Other tree:     "; find "$OTHER/backend/src" -name '*.ts' | wc -l

echo ""
echo "=== Only in this workspace (not in other) ==="
comm -23 \
  <(cd "$HERE/backend/src" && find . -name '*.ts' | sort) \
  <(cd "$OTHER/backend/src" && find . -name '*.ts' | sort) || true

echo ""
echo "=== Only in other (not here) ==="
comm -13 \
  <(cd "$HERE/backend/src" && find . -name '*.ts' | sort) \
  <(cd "$OTHER/backend/src" && find . -name '*.ts' | sort) || true

echo ""
echo "=== diff -rq (first 200 lines; full diff may be large) ==="
diff -rq "$HERE/backend/src" "$OTHER/backend/src" 2>/dev/null | head -200 || true

echo ""
echo "=== prisma/schema.prisma line counts ==="
wc -l "$HERE/backend/prisma/schema.prisma" "$OTHER/backend/prisma/schema.prisma" 2>/dev/null || true
