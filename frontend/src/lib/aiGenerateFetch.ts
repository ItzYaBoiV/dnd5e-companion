/**
 * Dungeon/story generation returns 202 + jobId; we poll until complete (no long-held connection through CDNs).
 * Encounter/NPC may still use SSE keepalives when the server streams.
 */
const POLL_MS = 2000;
const MAX_WAIT_MS = 1_800_000;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** `/api/generate/dungeons/generate` → `/api/generate` */
function jobsBaseFromPostUrl(postUrl: string): string {
  const m = postUrl.match(/^(.*)\/(?:dungeons|stories|encounter|npc)\/generate\/?$/);
  return m ? m[1] : postUrl.replace(/\/[^/]+\/generate\/?$/, "");
}

async function pollAiJob(
  jobId: string,
  baseUrl: string,
  onPoll?: (info: { status: string; elapsedSec: number }) => void,
): Promise<unknown> {
  const jobUrl = `${baseUrl}/jobs/${jobId}`;
  const deadline = Date.now() + MAX_WAIT_MS;
  const started = Date.now();

  while (Date.now() < deadline) {
    const r = await fetch(jobUrl, { headers: { Accept: "application/json" } });
    let j: { status?: string; result?: { kind: string; id: string }; error?: string | null };
    try {
      j = await r.json() as typeof j;
    } catch {
      throw new Error(`Job poll failed (HTTP ${r.status})`);
    }
    if (!r.ok) {
      throw new Error(typeof j.error === "string" && j.error ? j.error : `Job poll HTTP ${r.status}`);
    }

    const st = j.status ?? "unknown";
    onPoll?.({ status: st, elapsedSec: Math.floor((Date.now() - started) / 1000) });

    if (j.status === "failed") {
      throw new Error(j.error || "Generation failed");
    }

    if (j.status === "completed") {
      if (j.result?.kind === "dungeon" && j.result.id) {
        const dr = await fetch(`${baseUrl}/dungeons/${j.result.id}`);
        const data = await dr.json() as { error?: string };
        if (!dr.ok) throw new Error(data?.error || `Failed to load dungeon (${dr.status})`);
        return data;
      }
      if (j.result?.kind === "story" && j.result.id) {
        const sr = await fetch(`${baseUrl}/stories/${j.result.id}`);
        const data = await sr.json() as { error?: string };
        if (!sr.ok) throw new Error(data?.error || `Failed to load story (${sr.status})`);
        return data;
      }
      throw new Error("Job finished but the server did not return a dungeon or story id.");
    }

    await sleep(POLL_MS);
  }

  throw new Error(
    `Still generating after ${MAX_WAIT_MS / 60000} minutes. Open the Dungeons or Stories tab — it may appear there when ready.`,
  );
}

export async function postAiGenerate(
  url: string,
  body: unknown,
  opts?: { onJobPoll?: (info: { status: string; elapsedSec: number }) => void },
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 202) {
    const meta = (await res.json()) as { jobId?: string; pollPath?: string };
    if (!meta.jobId) throw new Error("Server returned 202 without jobId");
    return pollAiJob(meta.jobId, jobsBaseFromPostUrl(url), opts?.onJobPoll);
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/event-stream")) {
    const payload = await readSseDataPayload(res);
    if (isErrorPayload(payload)) {
      throw new Error(payload.code ? `${payload.error} [${payload.code}]` : payload.error);
    }
    return payload;
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Generation failed (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const d = data as { error?: string; code?: string };
    throw new Error(d.error ? (d.code ? `${d.error} [${d.code}]` : d.error) : `HTTP ${res.status}`);
  }
  return data;
}

function isErrorPayload(x: unknown): x is { error: string; code?: string } {
  return (
    x !== null &&
    typeof x === "object" &&
    "error" in x &&
    typeof (x as { error: unknown }).error === "string"
  );
}

async function readSseDataPayload(res: Response): Promise<unknown> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const dec = new TextDecoder();
  let buf = "";
  let lastData: unknown;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    for (;;) {
      const sep = buf.indexOf("\n\n");
      if (sep < 0) break;
      const block = buf.slice(0, sep).trimEnd();
      buf = buf.slice(sep + 2);
      if (!block || block.startsWith(":")) continue;

      for (const line of block.split("\n")) {
        if (line.startsWith("data: ")) {
          lastData = JSON.parse(line.slice(6)) as unknown;
        }
      }
    }
  }

  if (lastData === undefined) {
    throw new Error("AI stream ended without a result (check nginx / Cloudflare timeouts)");
  }
  return lastData;
}
