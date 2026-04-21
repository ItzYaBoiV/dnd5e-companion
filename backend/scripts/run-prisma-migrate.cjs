const { spawnSync } = require("child_process");
const path = require("path");

const backendDir = path.join(__dirname, "..");
const prismaCli = path.join(backendDir, "node_modules", "prisma", "build", "index.js");

function run(args) {
  const r = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: backendDir,
    encoding: "utf8",
    shell: false,
    stdio: "pipe",
  });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  return r.status ?? 0;
}

let code = run(["migrate", "dev", "--name", "add_player_display"]);
if (code !== 0) process.exit(code);
code = run(["generate"]);
process.exit(code);
