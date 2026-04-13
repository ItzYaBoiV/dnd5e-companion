# D&D 5e AI Workers

No SSH. No usernames. Workers connect to the server over HTTP.

**The server does not run the LLM** — only Postgres, the API, and LiteLLM (a thin proxy). All generation happens on your Mac / GPU machines (Ollama). Choose the largest model each worker can run; you are not limited by the server’s CPU/RAM.

## How it works

```
Worker machine                   D&D Server (192.168.5.7)
     |                                     |
     |-- 1. Run install script             |
     |-- 2. Ollama starts on :11434        |
     |-- 3. GET /api/tags → pick exact model name (matches `ollama list`)
     |-- 4. POST /api/workers/register     --> backend writes litellm config
     |                                          + restarts LiteLLM container
     |
     |<-- LiteLLM now sends AI jobs to this machine
```

Install scripts **sync the model string from Ollama** (via `pick_ollama_model.py`), so LiteLLM always gets a name that actually exists on disk. They still **recommend** a default from RAM (Mac) or VRAM (GPU), but if you already pulled e.g. `qwen2.5:14b`, that is what gets registered—no more `llama3.1:8b not found` from a stale server config.

**Re-sync only** (Ollama already installed): `bash install-mac.sh --sync-only` · `bash install-linux.sh --sync-only` · `.\install-windows.ps1 -SyncOnly`

**From the server** (no script on worker): `./register-worker.sh --sync 192.168.5.XX` pulls tags from the worker’s Ollama and registers the resolved name.

**Automatic (server-side):** the backend polls **already-registered** worker IPs on a timer (default every **5 minutes**), re-reads each Ollama `/api/tags`, and updates LiteLLM **only when** the resolved model string changed — no manual sync for day-to-day use. This does **not** scan your LAN for new machines; new workers still need to run an install script (or `register-worker.sh`) once. Env: `WORKER_RECONCILE_MS` (default `300000`, set `0` to disable). Optional first delay: `WORKER_RECONCILE_INITIAL_MS` (default `20000`). Manual trigger: `curl -X POST http://SERVER:56791/api/workers/reconcile`.

**`deploy.sh`:** it no longer prompts for worker IPs. Workers add themselves when you run the installers. To pre-fill LiteLLM before any worker has registered, set `DEPLOY_LITELLM_WORKERS` (see comment block in `deploy.sh`).

## Setup

### 1 - Start the server first
```bash
cd ~/Docker/dnd5e-companion && ./deploy.sh
```

### 2 - Each RTX 3080 Ti (Linux)
```bash
bash ai-workers/gpu-worker/install-linux.sh
```

### 2 - Each RTX 3080 Ti (Windows) - PowerShell as Admin
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\ai-workers\gpu-worker\install-windows.ps1
```

### 2 - Mac Mini M4
```bash
bash ai-workers/mac-mini/install-mac.sh
```

Each script auto-detects its LAN IP, resolves `model` from **live** Ollama tags, then calls `POST /api/workers/register` (same host/port; override with env `SERVER_IP` / `SERVER_PORT` on the worker).

## Manual registration (if auto-register failed)
```bash
# From repo root on the server — match whatever `ollama list` shows on the worker:
./register-worker.sh --sync 192.168.5.20

# Fixed names (when you know the exact tag):
./register-worker.sh 192.168.5.10 llama3.1:8b
./register-worker.sh 192.168.5.20 qwen2.5:14b

# Or direct curl
curl -X POST http://192.168.5.7:56791/api/workers/register \
  -H "Content-Type: application/json" \
  -d '{"ip":"192.168.5.10","model":"llama3.1:8b"}'
```

Windows auto-sync needs **Python 3** on the PATH (Mac/Linux use `python3` for the same picker).

## Check worker status
```bash
curl http://192.168.5.7:56791/api/workers
```
Or visit the app: `/dungeons` page shows a green badge when workers are online.

## Remove a worker
```bash
curl -X DELETE http://192.168.5.7:56791/api/workers/192.168.5.10
```

## Firewall notes
Each worker machine needs port **11434** open for incoming TCP from 192.168.5.7.

Linux workers: `sudo ufw allow from 192.168.5.7 to any port 11434`

Windows workers: Windows Defender Firewall → New Inbound Rule → TCP 11434 → Allow

Mac: no action needed (macOS allows it by default)
