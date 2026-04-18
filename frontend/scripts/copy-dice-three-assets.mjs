import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "node_modules", "@3d-dice", "dice-box-threejs", "public");
const dest = path.join(root, "public", "dice-three");

if (!fs.existsSync(src)) {
  console.warn("[copy-dice-three-assets] Skipping dice: @3d-dice/dice-box-threejs not installed yet.");
} else {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log("[copy-dice-three-assets] Copied to", dest);
}

/** WoTC official fillable sheet — personal / photocopy use per sheet license. Used by in-app PDF export. */
const WIZARDS_SHEET_URL =
  "https://media.wizards.com/2016/dnd/downloads/5E_CharacterSheet_Fillable.pdf";
const wizardsDest = path.join(root, "public", "wizards-5E_CharacterSheet_Fillable.pdf");

if (!fs.existsSync(wizardsDest)) {
  try {
    const res = await fetch(WIZARDS_SHEET_URL);
    if (!res.ok) {
      console.warn("[copy-dice-three-assets] Wizards sheet HTTP", res.status, "- skip");
    } else {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(wizardsDest), { recursive: true });
      fs.writeFileSync(wizardsDest, buf);
      console.log("[copy-dice-three-assets] Wrote", wizardsDest);
    }
  } catch (e) {
    console.warn("[copy-dice-three-assets] Could not download Wizards sheet:", e?.message ?? e);
    console.warn("[copy-dice-three-assets] Place 5E_CharacterSheet_Fillable.pdf manually at", wizardsDest);
  }
} else {
  console.log("[copy-dice-three-assets] Wizards sheet already present:", wizardsDest);
}
