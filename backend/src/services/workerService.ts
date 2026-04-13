/**
 * workerService.ts
 *
 * Manages the LiteLLM worker pool via HTTP — no SSH required.
 * Workers self-register by POSTing their IP + model to /api/workers/register.
 *
 * Writes directly to the mounted litellm-config.yaml and restarts
 * the LiteLLM container via the Docker socket.
 *
 * Optional: WORKER_RECONCILE_MS (default 300000) — server polls known worker IPs,
 * re-reads Ollama /api/tags, and updates LiteLLM when model tags change (no manual sync).
 * Set WORKER_RECONCILE_MS=0 to disable.
 */

import { LITELLM_UPSTREAM_TIMEOUT_SEC } from "../config/aiTimeouts";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync  = promisify(exec);
const CONFIG_PATH = process.env.LITELLM_CONFIG_PATH ?? "/app/litellm-config.yaml";
const REGISTRY_PATH =
  process.env.WORKER_REGISTRY_PATH ?? path.join(path.dirname(CONFIG_PATH), "worker-registry.json");

type Registry = Record<string, { hostname?: string }>;

function loadRegistry(): Registry {
  try {
    if (!fs.existsSync(REGISTRY_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8")) as unknown;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Registry) : {};
  } catch {
    return {};
  }
}

function saveRegistry(reg: Registry): void {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), "utf-8");
}

// ── Read current workers from config file ─────────────────────────
export function readWorkers(): { ip: string; model: string }[] {
  if (!fs.existsSync(CONFIG_PATH)) return [];

  const content = fs.readFileSync(CONFIG_PATH, "utf-8");
  const workers: { ip: string; model: string }[] = [];

  // Parse entries: lines like "api_base: http://IP:11434"
  const apiBaseRegex = /api_base:\s*http:\/\/([\d.]+):11434/g;
  const modelRegex   = /model:\s*ollama\/(\S+)/g;

  const ips:    string[] = [];
  const models: string[] = [];

  let m: RegExpExecArray | null;
  while ((m = apiBaseRegex.exec(content)) !== null) ips.push(m[1]);
  while ((m = modelRegex.exec(content))   !== null) models.push(m[1]);

  for (let i = 0; i < ips.length; i++) {
    workers.push({ ip: ips[i], model: models[i] ?? "llama3.1:8b" });
  }

  return workers;
}

// ── Write a fresh config with the given worker list ───────────────
function writeConfig(workers: { ip: string; model: string }[]): void {
  const t = LITELLM_UPSTREAM_TIMEOUT_SEC;
  const entries = workers
    .map(
      (w) =>
        `  - model_name: dnd-generator\n    litellm_params:\n      model: ollama/${w.model}\n      api_base: http://${w.ip}:11434\n      timeout: ${t}`
    )
    .join("\n\n");

  // Must be valid YAML: a comment-only model_list loads as empty → LiteLLM rejects model=dnd-generator.
  const modelBlock =
    entries.length > 0
      ? `model_list:\n${entries}`
      : "model_list: []";

  const config = [
    "# LiteLLM Load Balancer config — managed by D&D app",
    "# Edit via: POST http://192.168.5.7:56791/api/workers/register",
    "",
    modelBlock,
    "",
    "router_settings:",
    "  routing_strategy: least-busy",
    "  num_retries: 2",
    `  timeout: ${LITELLM_UPSTREAM_TIMEOUT_SEC}`,
    "",
    "litellm_settings:",
    "  max_tokens: 8192",
    `  request_timeout: ${LITELLM_UPSTREAM_TIMEOUT_SEC}`,
    "",
  ].join("\n");

  fs.writeFileSync(CONFIG_PATH, config, "utf-8");
}

// ── Restart LiteLLM container via Docker socket ───────────────────
async function restartLitellm(): Promise<void> {
  try {
    await execAsync("docker restart dnd5e_litellm");
    console.log("[workers] LiteLLM restarted");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // LiteLLM might not be running yet — start it
    try {
      await execAsync("docker start dnd5e_litellm");
      console.log("[workers] LiteLLM started");
    } catch (err2) {
      const msg2 = err2 instanceof Error ? err2.message : String(err2);
      console.warn(
        "[workers] Could not restart LiteLLM from the backend container. " +
          "Mount /var/run/docker.sock or on the host run: docker restart dnd5e_litellm. " +
          `restart: ${msg}; start: ${msg2}`
      );
    }
  }
}

// ── Register a worker ─────────────────────────────────────────────
export async function registerWorker(ip: string, model: string, hostname?: string): Promise<void> {
  const workers = readWorkers().filter((w) => w.ip !== ip); // remove if exists
  workers.push({ ip, model });
  writeConfig(workers);
  const reg = loadRegistry();
  const h = hostname?.trim();
  if (h) reg[ip] = { ...reg[ip], hostname: h };
  else if (!reg[ip]) reg[ip] = {};
  saveRegistry(reg);
  await restartLitellm();
}

// ── Remove a worker ───────────────────────────────────────────────
export async function removeWorker(ip: string): Promise<void> {
  const workers = readWorkers().filter((w) => w.ip !== ip);
  writeConfig(workers);
  const reg = loadRegistry();
  delete reg[ip];
  saveRegistry(reg);
  await restartLitellm();
}

/** True if Ollama's /api/tags lists a model usable for the configured name (exact or extended tag). */
export function ollamaTagsHasModel(
  models: { name?: string }[] | undefined,
  configured: string
): boolean {
  const want = configured.trim();
  if (!want || !models?.length) return false;
  return models.some((m) => {
    const n = (m.name ?? "").trim();
    if (!n) return false;
    if (n === want) return true;
    // e.g. configured llama3.1:8b vs listed llama3.1:8b-instruct-q4_K_M
    if (n.startsWith(`${want}-`) || n.startsWith(`${want}:`)) return true;
    return false;
  });
}

// ── Health check all registered workers ──────────────────────────
export async function getWorkerHealth(): Promise<{
  ip: string;
  model: string;
  hostname: string | null;
  online: boolean;
  responseMs: number | null;
}[]> {
  const workers = readWorkers();
  const reg = loadRegistry();

  return Promise.all(
    workers.map(async (w) => {
      const start = Date.now();
      const hostname = reg[w.ip]?.hostname?.trim() || null;
      try {
        const res = await fetch(`http://${w.ip}:11434/api/tags`, {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) {
          return { ...w, hostname, online: false, responseMs: Date.now() - start };
        }
        const body = (await res.json()) as { models?: { name?: string }[] };
        const hasModel = ollamaTagsHasModel(body.models, w.model);
        return {
          ...w,
          hostname,
          online: hasModel,
          responseMs: Date.now() - start,
        };
      } catch {
        return { ...w, hostname, online: false, responseMs: null };
      }
    })
  );
}

// ── Keep in sync with ai-workers/lib/pick_ollama_model.py ────────
const RANK_PREFIXES: string[] = [
  "qwen2.5:72b",
  "qwen2.5:32b",
  "deepseek-r1:32b",
  "llama3.3:70b",
  "llama3.1:70b",
  "mixtral:8x7b",
  "deepseek-r1:14b",
  "qwen2.5:14b",
  "qwen2.5:7b",
  "llama3.1:8b",
  "llama3.2",
  "llama3.1",
  "mistral",
  "phi3",
  "gemma2",
  "codellama",
];

function modelNamesFromTags(body: { models?: { name?: string }[] }): string[] {
  const models = body.models;
  if (!Array.isArray(models)) return [];
  const out: string[] = [];
  for (const m of models) {
    const n = (m?.name ?? "").trim();
    if (n) out.push(n);
  }
  return out;
}

function pickBestInstalledModel(names: string[]): string {
  for (const tier of RANK_PREFIXES) {
    for (const n of names) {
      if (n === tier || n.startsWith(`${tier}:`) || n.startsWith(`${tier}-`)) return n;
    }
  }
  return names[0];
}

/** Same rules as pick_ollama_model.py — pick exact tag LiteLLM should use for this Ollama host. */
export function pickRegistrationModelFromTags(
  body: { models?: { name?: string }[] },
  preferred: string
): string | null {
  const names = modelNamesFromTags(body);
  if (!names.length) return null;
  const p = preferred.trim();
  if (p) {
    if (names.includes(p)) return p;
    for (const n of names) {
      if (n.startsWith(`${p}-`) || n.startsWith(`${p}:`)) return n;
    }
  }
  return pickBestInstalledModel(names);
}

function workersSignature(workers: { ip: string; model: string }[]): string {
  return [...workers]
    .sort((a, b) => a.ip.localeCompare(b.ip))
    .map((w) => `${w.ip}:${w.model}`)
    .join("|");
}

async function fetchOllamaTagsForIp(ip: string): Promise<{ models?: { name?: string }[] } | null> {
  try {
    const res = await fetch(`http://${ip}:11434/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { models?: { name?: string }[] };
  } catch {
    return null;
  }
}

/**
 * Poll each known worker IP, resolve the live model name from Ollama, and rewrite
 * litellm-config when something changed. Restarts LiteLLM only on change.
 */
export async function reconcileWorkersFromOllama(): Promise<{
  ok: boolean;
  changed: boolean;
  workers: { ip: string; model: string }[];
  note?: string;
}> {
  const current = readWorkers();
  const reg = loadRegistry();
  const ipSet = new Set<string>();
  for (const w of current) ipSet.add(w.ip);
  for (const ip of Object.keys(reg)) ipSet.add(ip);

  if (ipSet.size === 0) {
    return { ok: true, changed: false, workers: [], note: "no workers configured" };
  }

  const resolved: { ip: string; model: string }[] = [];

  for (const ip of [...ipSet].sort((a, b) => a.localeCompare(b))) {
    const existing = current.find((w) => w.ip === ip);
    const tags = await fetchOllamaTagsForIp(ip);
    const names = tags ? modelNamesFromTags(tags) : [];

    if (!tags || names.length === 0) {
      if (existing) resolved.push({ ip, model: existing.model });
      continue;
    }

    const preferred = existing?.model ?? "";
    const model = pickRegistrationModelFromTags(tags, preferred);
    if (model) resolved.push({ ip, model });
    else if (existing) resolved.push({ ip, model: existing.model });
  }

  resolved.sort((a, b) => a.ip.localeCompare(b.ip));

  if (workersSignature(resolved) === workersSignature(current)) {
    return { ok: true, changed: false, workers: resolved };
  }

  writeConfig(resolved);
  const newReg: Registry = {};
  for (const w of resolved) {
    newReg[w.ip] = reg[w.ip] ?? {};
  }
  saveRegistry(newReg);
  await restartLitellm();
  console.log(
    "[workers] auto-reconcile updated LiteLLM:",
    resolved.map((w) => `${w.ip}→${w.model}`).join(", ")
  );

  return { ok: true, changed: true, workers: resolved };
}

/** Background poll so workers need not re-run install scripts after model/IP changes. */
export function scheduleWorkerReconcileLoop(): void {
  const raw = process.env.WORKER_RECONCILE_MS ?? "300000";
  const ms = parseInt(raw, 10);
  if (!Number.isFinite(ms) || ms <= 0) {
    console.log("[workers] auto-reconcile disabled (WORKER_RECONCILE_MS<=0)");
    return;
  }

  const run = () => {
    reconcileWorkersFromOllama().catch((err) =>
      console.warn("[workers] reconcile error:", err instanceof Error ? err.message : err)
    );
  };

  const firstDelay = parseInt(process.env.WORKER_RECONCILE_INITIAL_MS ?? "20000", 10);
  setTimeout(run, Number.isFinite(firstDelay) && firstDelay >= 0 ? firstDelay : 20_000);
  setInterval(run, ms);
  console.log(
    `[workers] auto-reconcile every ${ms}ms (first run in ${Number.isFinite(firstDelay) && firstDelay >= 0 ? firstDelay : 20_000}ms)`
  );
}
