import { AppError } from "../middleware/errorHandler";
import { AI_CHAT_TIMEOUT_MS_DEFAULT } from "../config/aiTimeouts";
import { appendLogFile } from "../util/fileLogger";

/**
 * aiService.ts
 *
 * Production (Docker): set AI_BASE_URL to LiteLLM (e.g. http://host.docker.internal:4000)
 * and AI_MODEL to the router name (e.g. dnd-generator). Requests use OpenAI-compatible
 * POST /v1/chat/completions.
 *
 * Direct Ollama (dev / no LiteLLM): leave AI_BASE_URL unset; use AI_WORKER_URLS and AI_MODEL
 * as the Ollama model id (e.g. llama3.1:8b).
 *
 * AI_WORKER_URLS=http://192.168.1.10:11434,http://192.168.1.11:11434
 *
 * AI_CHAT_TIMEOUT_MS / AI_CHAT_STREAM_TIMEOUT_MS — optional; default 1_800_000 (30 min), see config/aiTimeouts.ts.
 *
 * LiteLLM auth: use LITELLM_API_KEY only. Do not reuse OPENAI_API_KEY unless you set
 * LITELLM_USE_OPENAI_API_KEY=1 — otherwise /v1/models can return an empty list (virtual-key mismatch).
 */

const MODEL = process.env.AI_MODEL ?? "llama3.1:8b";
const AI_GEN_LOG = "ai-generation.log";
const AI_PROXY_LOG = "ai-proxy.log";
const LITELLM_BASE = (process.env.AI_BASE_URL ?? "").trim().replace(/\/$/, "");
const USE_LITELLM = Boolean(LITELLM_BASE);

/** Full non-stream completion (large JSON dungeons on local LLMs often need several minutes). */
function parseTimeoutMs(raw: string | undefined, fallback: number): number {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return fallback;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 30_000 ? n : fallback;
}

const CHAT_COMPLETION_TIMEOUT_MS = parseTimeoutMs(process.env.AI_CHAT_TIMEOUT_MS, AI_CHAT_TIMEOUT_MS_DEFAULT);
const CHAT_STREAM_TIMEOUT_MS = parseTimeoutMs(process.env.AI_CHAT_STREAM_TIMEOUT_MS, CHAT_COMPLETION_TIMEOUT_MS);

const WORKER_URLS = (process.env.AI_WORKER_URLS ?? "http://localhost:11434")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

interface Worker {
  url: string;
  healthy: boolean;
  busy: boolean;
  lastCheck: number;
}

const workers: Worker[] = WORKER_URLS.map((url) => ({
  url,
  healthy: true,
  busy: false,
  lastCheck: 0,
}));
const HEALTH_RETRY_MS = 30_000;

function logAiGen(line: string): void {
  appendLogFile(AI_GEN_LOG, line);
}

function logAiProxy(line: string): void {
  appendLogFile(AI_PROXY_LOG, line);
}

/** Headers for LiteLLM only — OPENAI_API_KEY is not sent unless LITELLM_USE_OPENAI_API_KEY=1/true. */
function litellmHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const useOpenaiKey =
    process.env.LITELLM_USE_OPENAI_API_KEY === "1" || process.env.LITELLM_USE_OPENAI_API_KEY === "true";
  const key =
    process.env.LITELLM_API_KEY?.trim() ||
    (useOpenaiKey ? process.env.OPENAI_API_KEY?.trim() : undefined);
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

async function litellmErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return j.error?.message ?? j.message ?? text.slice(0, 300);
  } catch {
    return text.slice(0, 300) || res.statusText;
  }
}

function isMissingOllamaModelMessage(msg: string): boolean {
  return /model\s+['"][^'"]+['"]\s+not\s+found|not\s+found.*model|OllamaException.*not\s+found/i.test(
    msg
  );
}

/** LiteLLM proxy: no model_list entry for the router name (often empty/broken YAML). */
function isLitellmRouteMissingMessage(msg: string): boolean {
  return /invalid model name|ProxyModelNotFound/i.test(msg);
}

function modelUnavailableError(detail: string): AppError {
  const short = detail.replace(/\s+/g, " ").trim().slice(0, 280);
  return new AppError(
    503,
    `The Ollama model configured for this worker is not installed (or the name does not match ` +
      `\`ollama list\` on that machine). On the worker PC run e.g. \`ollama pull llama3.1:8b\`, or ` +
      `re-register via the API with the exact model tag. ${short ? `[${short}]` : ""}`,
    "AI_MODEL_UNAVAILABLE"
  );
}

function truncateDetail(s: string, max = 450): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function liteLlmUpstreamError(status: number, detail: string): AppError {
  return new AppError(
    502,
    `AI proxy (LiteLLM) error (${status}): ${truncateDetail(detail)}`,
    "AI_UPSTREAM_ERROR"
  );
}

function liteLlmUnreachable(reason: string): AppError {
  return new AppError(
    503,
    `Cannot reach LiteLLM at ${LITELLM_BASE}. Is it running on the Docker host (port 4000)? ` +
      `Check AI_BASE_URL in the backend container. ${truncateDetail(reason, 200)}`,
    "AI_PROXY_UNREACHABLE"
  );
}

async function checkHealth(w: Worker) {
  try {
    const res = await fetch(`${w.url}/api/tags`, { signal: AbortSignal.timeout(5000) });
    w.healthy = res.ok;
  } catch {
    w.healthy = false;
  }
  w.lastCheck = Date.now();
}

async function getWorker(): Promise<Worker> {
  await Promise.all(
    workers
      .filter((w) => !w.healthy && Date.now() - w.lastCheck > HEALTH_RETRY_MS)
      .map(checkHealth)
  );
  const available = workers.filter((w) => w.healthy && !w.busy);
  if (available.length > 0) return available.reduce((a, b) => (a.lastCheck <= b.lastCheck ? a : b));
  const healthy = workers.filter((w) => w.healthy);
  if (healthy.length === 0) throw new Error("No AI workers available. Start Ollama on your machines.");
  return healthy[0];
}

export interface GenerateOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  /** Extra text appended to ai-generation.log lines (e.g. jobId=…). */
  logContext?: string;
}

function buildMessages(prompt: string, opts: GenerateOptions) {
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });
  return messages;
}

export async function generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const messages = buildMessages(prompt, opts);
  const t0 = Date.now();
  const maxTok = opts.maxTokens ?? 4096;
  const ctx = opts.logContext ? ` ${opts.logContext}` : "";

  if (USE_LITELLM) {
    const h = litellmHeaders();
    logAiGen(
      `start litellm POST /v1/chat/completions base=${LITELLM_BASE} model=${MODEL} max_tokens=${maxTok} ` +
        `promptChars=${prompt.length} systemChars=${opts.system?.length ?? 0} auth=${Boolean(h.Authorization)}${ctx}`
    );
    let res: Response;
    try {
      res = await fetch(`${LITELLM_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: opts.temperature ?? 0.8,
          max_tokens: maxTok,
        }),
        signal: AbortSignal.timeout(CHAT_COMPLETION_TIMEOUT_MS),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logAiGen(`error litellm fetch ms=${Date.now() - t0} ${truncateDetail(msg, 500)}${ctx}`);
      if (msg.includes("abort") || msg.includes("Timeout") || msg.includes("timed out")) {
        throw new AppError(
          504,
          `AI request timed out after ${CHAT_COMPLETION_TIMEOUT_MS / 1000}s (LiteLLM/Ollama still generating). ` +
            `Try again, use a smaller/faster model, or raise AI_CHAT_TIMEOUT_MS (and nginx proxy_read_timeout if you use the bundled frontend).`,
          "AI_TIMEOUT"
        );
      }
      throw liteLlmUnreachable(msg);
    }
    if (!res.ok) {
      const detail = await litellmErrorMessage(res);
      logAiGen(
        `error litellm http=${res.status} ms=${Date.now() - t0} detail=${truncateDetail(detail, 600)}${ctx}`
      );
      if (isLitellmRouteMissingMessage(detail)) {
        throw new AppError(
          503,
          `LiteLLM has no route for model "${MODEL}". If workers are already registered, the proxy usually ` +
            `needs a restart to reload litellm-config.yaml: on the Docker host run \`docker restart dnd5e_litellm\`. ` +
            `Otherwise register a worker (POST /api/workers/register) and ensure the backend can run \`docker restart\` ` +
            `(mount Docker socket) or restart LiteLLM manually.`,
          "LITELLM_NO_MODEL_ROUTE"
        );
      }
      if (isMissingOllamaModelMessage(detail)) throw modelUnavailableError(detail);
      throw liteLlmUpstreamError(res.status, detail);
    }
    let data: { choices?: { message?: { content?: string } }[] };
    try {
      data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    } catch {
      logAiGen(`error litellm non-json ms=${Date.now() - t0}${ctx}`);
      throw new AppError(502, "LiteLLM returned a non-JSON response. Check proxy logs.", "AI_BAD_RESPONSE");
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      logAiGen(`error litellm empty message ms=${Date.now() - t0}${ctx}`);
      throw new AppError(502, "LiteLLM returned no assistant message content.", "AI_EMPTY_MESSAGE");
    }
    const trimmed = content.trim();
    logAiGen(
      `ok litellm ms=${Date.now() - t0} responseChars=${trimmed.length} preview=${JSON.stringify(trimmed.slice(0, 800))}${ctx ? " " + ctx : ""}`
    );
    return trimmed;
  }

  const worker = await getWorker();
  logAiGen(
    `start direct POST ${worker.url}/api/chat model=${MODEL} max_predict=${maxTok} promptChars=${prompt.length}${ctx}`
  );
  worker.busy = true;
  try {
    const res = await fetch(`${worker.url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: false,
        options: { temperature: opts.temperature ?? 0.8, num_predict: maxTok },
      }),
      signal: AbortSignal.timeout(CHAT_COMPLETION_TIMEOUT_MS),
    });
    if (!res.ok) {
      logAiGen(`error direct http=${res.status} ms=${Date.now() - t0} url=${worker.url}${ctx}`);
      throw new Error(`Worker ${worker.url} returned ${res.status}`);
    }
    const data = (await res.json()) as { message: { content: string } };
    worker.lastCheck = Date.now();
    const trimmed = data.message.content.trim();
    logAiGen(
      `ok direct ms=${Date.now() - t0} url=${worker.url} responseChars=${trimmed.length} preview=${JSON.stringify(trimmed.slice(0, 800))}${ctx ? " " + ctx : ""}`
    );
    return trimmed;
  } catch (e) {
    if (!(e instanceof AppError)) {
      const msg = e instanceof Error ? e.message : String(e);
      logAiGen(`error direct ms=${Date.now() - t0} url=${worker.url} ${truncateDetail(msg, 400)}${ctx}`);
    }
    throw e;
  } finally {
    worker.busy = false;
  }
}

export async function generateStream(
  prompt: string,
  opts: GenerateOptions,
  onChunk: (chunk: string) => void
): Promise<string> {
  const messages = buildMessages(prompt, opts);
  const t0 = Date.now();
  const maxTok = opts.maxTokens ?? 4096;

  if (USE_LITELLM) {
    const h = litellmHeaders();
    logAiGen(
      `start-stream litellm POST /v1/chat/completions base=${LITELLM_BASE} model=${MODEL} max_tokens=${maxTok} ` +
        `promptChars=${prompt.length} auth=${Boolean(h.Authorization)}`
    );
    let res: Response;
    try {
      res = await fetch(`${LITELLM_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: opts.temperature ?? 0.8,
          max_tokens: maxTok,
          stream: true,
        }),
        signal: AbortSignal.timeout(CHAT_STREAM_TIMEOUT_MS),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logAiGen(`error-stream litellm ms=${Date.now() - t0} ${truncateDetail(msg, 500)}`);
      if (msg.includes("abort") || msg.includes("Timeout") || msg.includes("timed out")) {
        throw new AppError(
          504,
          `AI stream timed out after ${CHAT_STREAM_TIMEOUT_MS / 1000}s. Try AI_CHAT_STREAM_TIMEOUT_MS or a smaller model.`,
          "AI_TIMEOUT"
        );
      }
      throw liteLlmUnreachable(msg);
    }
    if (!res.ok) {
      const detail = await litellmErrorMessage(res);
      logAiGen(
        `error-stream litellm http=${res.status} ms=${Date.now() - t0} detail=${truncateDetail(detail, 600)}`
      );
      if (isLitellmRouteMissingMessage(detail)) {
        throw new AppError(
          503,
          `LiteLLM has no route for model "${MODEL}". Try \`docker restart dnd5e_litellm\` on the host, or register workers and ensure the backend can restart that container.`,
          "LITELLM_NO_MODEL_ROUTE"
        );
      }
      if (isMissingOllamaModelMessage(detail)) throw modelUnavailableError(detail);
      throw liteLlmUpstreamError(res.status, detail);
    }
    if (!res.body) {
      logAiGen(`error-stream litellm empty body ms=${Date.now() - t0}`);
      throw new AppError(502, "LiteLLM returned an empty stream body.", "AI_EMPTY_STREAM");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const piece = obj.choices?.[0]?.delta?.content;
          if (piece) {
            full += piece;
            onChunk(piece);
          }
        } catch {
          /* partial line */
        }
      }
    }
    logAiGen(
      `ok-stream litellm ms=${Date.now() - t0} responseChars=${full.length} preview=${JSON.stringify(full.slice(0, 800))}`
    );
    return full;
  }

  const worker = await getWorker();
  logAiGen(
    `start-stream direct POST ${worker.url}/api/chat model=${MODEL} max_predict=${maxTok} promptChars=${prompt.length}`
  );
  worker.busy = true;
  let full = "";
  try {
    const res = await fetch(`${worker.url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: true,
        options: { temperature: opts.temperature ?? 0.8, num_predict: maxTok },
      }),
      signal: AbortSignal.timeout(CHAT_STREAM_TIMEOUT_MS),
    });
    if (!res.ok || !res.body) {
      logAiGen(`error-stream direct http=${res.status} ms=${Date.now() - t0} url=${worker.url}`);
      throw new Error(`Worker ${worker.url} returned ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
        try {
          const obj = JSON.parse(line) as { message?: { content: string } };
          if (obj.message?.content) {
            full += obj.message.content;
            onChunk(obj.message.content);
          }
        } catch {
          /* partial */
        }
      }
    }
    worker.lastCheck = Date.now();
    logAiGen(
      `ok-stream direct ms=${Date.now() - t0} url=${worker.url} responseChars=${full.length} preview=${JSON.stringify(full.slice(0, 800))}`
    );
    return full;
  } catch (e) {
    if (!(e instanceof AppError)) {
      const msg = e instanceof Error ? e.message : String(e);
      logAiGen(`error-stream direct ms=${Date.now() - t0} url=${worker.url} ${truncateDetail(msg, 400)}`);
    }
    throw e;
  } finally {
    worker.busy = false;
  }
}

async function litellmModelsFetch(headers: Record<string, string>): Promise<{
  httpOk: boolean;
  status: number;
  ids: string[];
  bodySnippet: string;
}> {
  const res = await fetch(`${LITELLM_BASE}/v1/models`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  const bodySnippet = text.replace(/\s+/g, " ").trim().slice(0, 500);
  let ids: string[] = [];
  if (res.ok) {
    try {
      const j = JSON.parse(text) as { data?: { id?: string }[] };
      ids = (j.data ?? []).map((x) => x.id).filter((id): id is string => typeof id === "string" && id.length > 0);
    } catch {
      logAiProxy(`GET /v1/models JSON parse failed snippet=${bodySnippet}`);
    }
  }
  return { httpOk: res.ok, status: res.status, ids, bodySnippet };
}

/**
 * True when LiteLLM lists AI_MODEL (same auth as chat). Logs to ai-proxy.log.
 */
export async function verifyLitellmRouterModel(): Promise<{ ok: boolean; detail?: string }> {
  if (!USE_LITELLM) return { ok: true };
  try {
    const h = litellmHeaders();
    const hadAuth = Boolean(h.Authorization);
    const r = await litellmModelsFetch(h);
    logAiProxy(
      `GET /v1/models status=${r.status} auth=${hadAuth} modelCount=${r.ids.length} ` +
        `sample=[${r.ids.slice(0, 8).join(",")}]`
    );

    if (!r.httpOk) {
      return {
        ok: false,
        detail: `LiteLLM /v1/models returned ${r.status}: ${truncateDetail(r.bodySnippet, 200)}`,
      };
    }

    if (r.ids.includes(MODEL)) return { ok: true };

    if (hadAuth && r.ids.length === 0) {
      const r2 = await litellmModelsFetch({ "Content-Type": "application/json" });
      logAiProxy(
        `GET /v1/models retry without Authorization status=${r2.status} modelCount=${r2.ids.length} ` +
          `sample=[${r2.ids.slice(0, 8).join(",")}]`
      );
      if (r2.httpOk && r2.ids.includes(MODEL)) {
        return {
          ok: false,
          detail:
            `LiteLLM hid all models from your Authorization header (often a stray OPENAI_API_KEY on the backend). ` +
            `Remove OPENAI_API_KEY from the backend env, or set LITELLM_API_KEY to the LiteLLM master key, ` +
            `or set LITELLM_USE_OPENAI_API_KEY=1 only if that key is meant for this proxy.`,
        };
      }
    }

    const sample = r.ids.length ? r.ids.slice(0, 12).join(", ") : "(none)";
    return {
      ok: false,
      detail:
        `LiteLLM does not list "${MODEL}" (seen: ${sample}). ` +
        `If empty: ensure litellm-config.yaml has workers, then docker restart dnd5e_litellm. ` +
        `If you use a proxy master key, set LITELLM_API_KEY on the backend to match.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logAiProxy(`GET /v1/models error ${truncateDetail(msg, 400)}`);
    return { ok: false, detail: `Cannot reach LiteLLM at ${LITELLM_BASE}: ${truncateDetail(msg, 200)}` };
  }
}

export async function getWorkerStatus() {
  if (USE_LITELLM) {
    try {
      const res = await fetch(`${LITELLM_BASE}/health`, { signal: AbortSignal.timeout(5000) });
      const ok = res.ok;
      return [
        {
          url: LITELLM_BASE,
          healthy: ok,
          busy: false,
          model: MODEL,
        },
      ];
    } catch {
      return [{ url: LITELLM_BASE, healthy: false, busy: false, model: MODEL }];
    }
  }

  await Promise.all(workers.map(checkHealth));
  return workers.map((w) => ({ url: w.url, healthy: w.healthy, busy: w.busy, model: MODEL }));
}

if (USE_LITELLM) {
  const authMode = litellmHeaders().Authorization
    ? "Authorization header set (LITELLM_API_KEY or LITELLM_USE_OPENAI_API_KEY)"
    : "no proxy auth header";
  console.log(
    `AI: LiteLLM at ${LITELLM_BASE} | model: ${MODEL} | chat timeout ${CHAT_COMPLETION_TIMEOUT_MS / 1000}s | ${authMode}`
  );
  console.log(
    "AI logs: ./logs/backend/ai-generation.log (each request) | ai-jobs.log (dungeon/story jobs) | ai-proxy.log (/v1/models)"
  );
} else {
  Promise.all(workers.map(checkHealth)).then(() => {
    const healthy = workers.filter((w) => w.healthy).length;
    console.log(`AI Workers: ${healthy}/${workers.length} online | model: ${MODEL}`);
  });
}
