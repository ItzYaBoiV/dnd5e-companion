/**
 * Prisma entrypoint for `npm run db:seed`.
 * Delegates to the canonical seeder in `src/services/seedService.ts`.
 */

import fs from "fs";
import path from "path";

function loadDotEnvIfNeeded() {
  if (process.env.DATABASE_URL) return;
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(__dirname, "..", "..", ".env"),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) return;
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

function buildDatabaseUrlFromPostgresVars() {
  if (process.env.DATABASE_URL) return;
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const db = process.env.POSTGRES_DB;
  if (!user || !password || !db) return;

  // Host-side seed runs typically target the mapped postgres port.
  const host = process.env.POSTGRES_HOST || "127.0.0.1";
  const port = process.env.POSTGRES_PORT || "55432";
  const encodedPassword = encodeURIComponent(password);
  process.env.DATABASE_URL = `postgresql://${user}:${encodedPassword}@${host}:${port}/${db}?schema=public`;
}

loadDotEnvIfNeeded();
buildDatabaseUrlFromPostgresVars();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Checked existing env/local .env and POSTGRES_* fallback values.");
  process.exit(1);
}

async function main() {
  // Import after env setup so Prisma initializes with DATABASE_URL present.
  const { runSeed } = await import("../src/services/seedService");
  await runSeed();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
