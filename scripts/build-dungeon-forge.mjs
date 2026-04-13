import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcPath = path.join(root, "dungeon-generator.jsx");
const implPath = path.join(root, "frontend/src/components/dungeon-forge/DungeonForgeImpl.jsx");
const tsxPath = path.join(root, "frontend/src/components/dungeon-forge/DungeonForge.tsx");

let s = fs.readFileSync(srcPath, "utf8");
s =
  "/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */\n" +
  s;
s = s.replace(
  /minHeight:"100vh"/,
  'minHeight:0,flex:1,display:"flex",flexDirection:"column"',
);
s = s.replace(/useEffect\(\(\)=>\{generate\(\);\},\[\]\);/, "useEffect(() => { generate(); }, [generate]);");
s = s.replace(
  /maxHeight:"calc\(100vh - 36px\)"/,
  'maxHeight:"min(70vh, calc(100dvh - 200px))"',
);

fs.mkdirSync(path.dirname(implPath), { recursive: true });
fs.writeFileSync(implPath, s);
fs.writeFileSync(
  tsxPath,
  [
    "/** Procedural Dungeon Forge — synced from dungeon-generator.jsx (npm run sync-forge). */",
    'export { default } from "./DungeonForgeImpl.jsx";',
    "",
  ].join("\n"),
);
console.log("Wrote", implPath);
console.log("Wrote", tsxPath);
