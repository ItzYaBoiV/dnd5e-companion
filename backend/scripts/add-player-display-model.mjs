import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");

let s = fs.readFileSync(schemaPath, "utf8");
if (s.includes("model PlayerDisplay")) {
  console.log("PlayerDisplay already present; skipping.");
  process.exit(0);
}

const marker = "model SessionCharacter {";
const idx = s.indexOf(marker);
if (idx === -1) {
  console.error("Could not find SessionCharacter model marker.");
  process.exit(1);
}

const block = `model PlayerDisplay {
  tvId      String   @id
  label     String   @default("")
  mapState  String?
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())
}

`;

s = s.slice(0, idx) + block + s.slice(idx);
fs.writeFileSync(schemaPath, s);
console.log("Inserted PlayerDisplay model.");
