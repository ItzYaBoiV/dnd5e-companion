#!/bin/bash
# Run from the dnd5e-companion directory (same place as docker-compose.yml).
# Helps debug backend → PostgreSQL (P1001 / connection refused / DNS).
set -e
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════════════"
echo " 1) Stack status"
echo "═══════════════════════════════════════════════════════════"
docker compose ps -a 2>/dev/null || docker-compose ps -a

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " 2) Postgres container (last 40 lines)"
echo "═══════════════════════════════════════════════════════════"
docker compose logs postgres --tail 40 2>/dev/null || docker-compose logs postgres --tail 40

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " 3) Backend container (last 60 lines)"
echo "═══════════════════════════════════════════════════════════"
docker compose logs backend --tail 60 2>/dev/null || docker-compose logs backend --tail 60

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " 4) From INSIDE backend: DNS for hostnames postgres / dnd5e_postgres"
echo "═══════════════════════════════════════════════════════════"
docker compose exec -T backend getent hosts postgres 2>/dev/null || echo "  (getent missing or no result)"
docker compose exec -T backend getent hosts dnd5e_postgres 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " 5) From INSIDE backend: TCP to POSTGRES_HOST:5432 (3s timeout)"
echo "═══════════════════════════════════════════════════════════"
docker compose exec -T backend node -e "
const h = process.env.POSTGRES_HOST || 'dnd5e_postgres';
const n = require('net');
const s = n.connect(5432, h, () => { console.log('OK connected to', h + ':5432'); s.end(); process.exit(0); });
s.setTimeout(3000);
s.on('error', (e) => { console.error('FAIL', h + ':5432', e.message); process.exit(1); });
s.on('timeout', () => { console.error('FAIL timeout', h + ':5432'); s.destroy(); process.exit(1); });
" || echo "  TCP check failed"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " 6) Built DATABASE_URL (password hidden — host + db only)"
echo "═══════════════════════════════════════════════════════════"
docker compose exec -T backend node -e "
const u = require('url');
let raw = process.env.DATABASE_URL;
if (!raw || !String(raw).trim()) {
  try { raw = require('child_process').execSync('node /app/scripts/print-database-url.cjs', { encoding: 'utf8' }); } catch (e) { console.error('Could not build URL:', e.message); process.exit(1); }
}
const p = u.parse(raw);
console.log('  protocol:', p.protocol);
console.log('  hostname:', p.hostname);
console.log('  port:', p.port || '5432');
console.log('  pathname:', p.pathname);
console.log('  user (login):', p.auth ? p.auth.split(':')[0] : '(none)');
"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " 7) Prisma db execute (SELECT 1) — uses print-database-url.cjs"
echo "═══════════════════════════════════════════════════════════"
if printf 'SELECT 1 AS ok;\n' | docker compose exec -T backend sh -c 'export DATABASE_URL="$(node /app/scripts/print-database-url.cjs)" && npx prisma db execute --stdin --schema=./prisma/schema.prisma'; then
  echo "  Prisma reached the database."
else
  echo "  Prisma db execute failed — see error above; compare with TCP/DNS sections."
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " 8) API health (host must map 56791 → backend)"
echo "═══════════════════════════════════════════════════════════"
curl -sS -m 3 "http://127.0.0.1:56791/health" 2>/dev/null || echo "  curl failed (is backend up and port 56791 published?)"

echo ""
echo "Done."
echo " • If Postgres logs show 'password authentication failed': your .env password does not match the"
echo "   existing Docker volume. Use the original password, or reset data: docker compose down -v (wipes DB)."
echo " • If TCP (5) fails: wrong POSTGRES_HOST or containers not on the same network."
echo " • P1001 with wrong host was fixed by defaulting POSTGRES_HOST to dnd5e_postgres + postgres network alias."
