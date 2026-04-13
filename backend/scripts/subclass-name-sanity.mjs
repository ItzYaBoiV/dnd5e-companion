import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const classes = await prisma.class.findMany({
    select: { slug: true, name: true, subclasses: { select: { slug: true, name: true } } },
    orderBy: { name: "asc" },
  });

  let dupCount = 0;
  for (const c of classes) {
    const byName = new Map();
    for (const s of c.subclasses) {
      const k = s.name.trim().toLowerCase();
      const list = byName.get(k) ?? [];
      list.push(s);
      byName.set(k, list);
    }
    for (const [k, list] of byName.entries()) {
      if (list.length > 1) {
        dupCount++;
        console.error(
          `[dup] class=${c.slug} name="${k}" slugs=${list.map((x) => x.slug).join(", ")}`,
        );
      }
    }
  }

  if (dupCount > 0) {
    throw new Error(`Subclass sanity failed: ${dupCount} duplicate subclass name group(s) found.`);
  }
  console.log("Subclass name sanity passed.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
