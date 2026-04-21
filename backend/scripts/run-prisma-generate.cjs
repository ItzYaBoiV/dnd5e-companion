const { spawnSync } = require("child_process");
const path = require("path");

const backendDir = path.join(__dirname, "..");
const prismaCli = path.join(backendDir, "node_modules", "prisma", "build", "index.js");

const r = spawnSync(process.execPath, [prismaCli, "generate"], {
  cwd: backendDir,
  encoding: "utf8",
  shell: false,
  stdio: "pipe",
});
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
process.exit(r.status ?? 0);
