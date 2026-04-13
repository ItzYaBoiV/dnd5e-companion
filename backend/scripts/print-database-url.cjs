#!/usr/bin/env node
/**
 * Prints DATABASE_URL for Prisma. Used by docker-entrypoint and `docker compose exec`.
 * - If DATABASE_URL is already set (non-empty), prints it unchanged.
 * - Otherwise builds postgresql:// from POSTGRES_* with URL-encoded user/password/db.
 */
const existing = process.env.DATABASE_URL;
if (existing != null && String(existing).trim() !== "") {
  process.stdout.write(String(existing).trim());
  process.exit(0);
}

const enc = (s) => encodeURIComponent(String(s ?? ""));
const u = process.env.POSTGRES_USER;
const p = process.env.POSTGRES_PASSWORD;
const d = process.env.POSTGRES_DB;
const h = process.env.POSTGRES_HOST || "dnd5e_postgres";

if (!u || !d) {
  console.error(
    "Either set DATABASE_URL, or set POSTGRES_USER + POSTGRES_DB (+ POSTGRES_PASSWORD) for the container."
  );
  process.exit(1);
}

process.stdout.write(`postgresql://${enc(u)}:${enc(p)}@${h}:5432/${enc(d)}`);
