#!/bin/bash
# Run this ONCE on first deployment to populate SRD data.
# Safe to re-run — uses upsert.
set -e

echo "Rebuilding backend so seed matches current Open5e API shape..."
docker compose build backend
docker compose up -d backend

echo "Starting SRD seed (this may take 3-5 minutes)..."
docker compose exec -T backend sh -c 'export DATABASE_URL="$(node /app/scripts/print-database-url.cjs)" && node dist/services/seedService.js'
echo "Seed complete!"
