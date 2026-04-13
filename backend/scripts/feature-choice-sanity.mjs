import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

function loadDotEnvIfNeeded() {
  if (process.env.DATABASE_URL) return;
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) return;
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let value = t.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function buildDatabaseUrlFromPostgresVars() {
  if (process.env.DATABASE_URL) return;
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const db = process.env.POSTGRES_DB;
  if (!user || !password || !db) return;
  const host = process.env.POSTGRES_HOST || "127.0.0.1";
  const port = process.env.POSTGRES_PORT || "55432";
  process.env.DATABASE_URL =
    `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${db}?schema=public`;
}

function extractFeatureOptions(description) {
  if (!description || !/one of the following|choose one/i.test(description)) return [];
  const options = [];
  const re = /\*\*([^*]+)\.\*\*\s*([\s\S]*?)(?=\n\s*\*\*|$)/g;
  let match = null;
  while ((match = re.exec(description)) != null) {
    const title = (match[1] ?? "").trim();
    const detail = (match[2] ?? "").replace(/\s+/g, " ").trim();
    if (!title) continue;
    options.push({ title, detail });
  }
  return options;
}

function requiresChoiceParse(description) {
  if (!description) return false;
  return /one of the following|choose one/i.test(description);
}

loadDotEnvIfNeeded();
buildDatabaseUrlFromPostgresVars();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set for feature-choice sanity.");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const classes = await prisma.class.findMany({
    include: {
      features: { select: { name: true, level: true, description: true } },
      subclasses: {
        include: { features: { select: { name: true, level: true, description: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  let scanned = 0;
  let choiceLike = 0;
  let failures = 0;

  for (const cls of classes) {
    for (const f of cls.features ?? []) {
      scanned++;
      if (!requiresChoiceParse(f.description)) continue;
      choiceLike++;
      const options = extractFeatureOptions(f.description);
      if (options.length < 2) {
        failures++;
        console.error(
          `[choice-parse-fail] class=${cls.slug} level=${f.level} feature="${f.name}" options=${options.length}`,
        );
      }
    }
    for (const sub of cls.subclasses ?? []) {
      for (const f of sub.features ?? []) {
        scanned++;
        if (!requiresChoiceParse(f.description)) continue;
        choiceLike++;
        const options = extractFeatureOptions(f.description);
        if (options.length < 2) {
          failures++;
          console.error(
            `[choice-parse-fail] class=${cls.slug} subclass=${sub.slug} level=${f.level} feature="${f.name}" options=${options.length}`,
          );
        }
      }
    }
  }

  console.log(
    `Feature choice sanity scanned=${scanned} choice_like=${choiceLike} parse_failures=${failures}`,
  );
  if (failures > 0) {
    throw new Error(`Feature choice sanity failed with ${failures} unparseable choice feature(s).`);
  }
  console.log("Feature choice sanity passed.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
