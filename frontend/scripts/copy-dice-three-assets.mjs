import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "node_modules", "@3d-dice", "dice-box-threejs", "public");
const dest = path.join(root, "public", "dice-three");

if (!fs.existsSync(src)) {
  console.warn("[copy-dice-three-assets] Skipping: @3d-dice/dice-box-threejs not installed yet.");
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log("[copy-dice-three-assets] Copied to", dest);
