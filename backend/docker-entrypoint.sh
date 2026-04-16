#!/bin/sh
set -e

# Compose cannot safely interpolate passwords into DATABASE_URL (@ : # / break the URL).
if [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="$(node /app/scripts/print-database-url.cjs)"
fi

echo "Applying database schema..."
attempt=0
max=60
while ! npx prisma db push --accept-data-loss; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max" ]; then
    echo "Error: could not reach PostgreSQL after $max attempts (host: ${POSTGRES_HOST:-dnd5e_postgres}:5432)."
    echo "Run on the host: docker compose ps"
    echo "  postgres should be Up (healthy). Start stack with: docker compose up -d"
    exit 1
  fi
  echo "Waiting for PostgreSQL... ($attempt/$max)"
  sleep 2
done

if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding SRD data (this takes 3-5 minutes on first run)..."
  node dist/services/seedService.js
fi

echo "Starting server..."
exec node dist/index.js
