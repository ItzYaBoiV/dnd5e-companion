# D&D 5e Companion — Quick Start

## Server: 192.168.5.7

---

## First-Time Setup

### 1. Prerequisites
```bash
# Install Docker + Docker Compose if not already installed
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Extract and configure
```bash
cd ~/Docker
unzip dnd5e-companion.zip
cd dnd5e-companion
cp .env.example .env
nano .env   # Set a strong POSTGRES_PASSWORD
```

### 3. Build and start
```bash
docker compose up -d --build
```

### 4. Seed SRD data (first time only — takes 3–5 minutes)
```bash
# In .env, change: SEED_ON_START=true
docker compose restart backend
docker compose logs -f backend   # watch for "Seed complete"

# Then in .env, change back: SEED_ON_START=false
docker compose restart backend
```

### 5. Access the app
- Local:    http://192.168.5.7:56790
- Domain:   http://dnd5e.d20madjd.quest  (once Nginx Proxy Manager is set up)

---

## Nginx Proxy Manager Setup

Create one proxy host:
- Domain:           dnd5e.d20madjd.quest
- Forward Hostname: 192.168.5.7
- Forward Port:     56790
- Enable:           WebSockets Support
- Add SSL cert from Let's Encrypt

That's it — NPM handles HTTPS, the app handles everything else.

---

## AI Workers Setup

See `ai-workers/README.md` for full instructions.

Quick version:
1. Run `ai-workers/gpu-worker/setup.sh` on each RTX 3080 Ti machine
2. Run `ai-workers/mac-mini/setup.sh` on your Mac Mini M4
3. Fill in worker LAN IPs in `ai-workers/load-balancer/litellm-config.yaml`
4. Start LiteLLM: `cd ai-workers/load-balancer && docker compose up -d`
5. In `.env`, set `AI_BASE_URL=http://host.docker.internal:4000` (not `localhost` — the API runs inside a container)
6. `docker compose up -d --force-recreate backend`
7. Verify (through the frontend proxy): `curl http://192.168.5.7:56790/api/generate/ai/health`

---

## Daily Usage

```bash
cd ~/Docker/dnd5e-companion

# Start everything
docker compose up -d

# Stop everything
docker compose down

# View logs
docker compose logs -f

# Update app (after extracting new zip)
docker compose up -d --build
```

---

## Port Map

| Port  | Service              | Access                        |
|-------|----------------------|-------------------------------|
| 56790 | Frontend (React)     | NPM → public via domain       |
| 56791 | Backend API          | Local only (testing/admin)    |
| 4000  | LiteLLM AI balancer  | Local only (192.168.5.7:4000) |
| 5432  | PostgreSQL           | Internal Docker network only  |

---

## App URLs (via domain)

| URL                                    | Page                   |
|----------------------------------------|------------------------|
| dnd5e.d20madjd.quest/                  | Character list         |
| dnd5e.d20madjd.quest/characters/new   | Create character       |
| dnd5e.d20madjd.quest/play             | DM play mode           |
| dnd5e.d20madjd.quest/dungeons         | AI generator           |
| dnd5e.d20madjd.quest/monsters         | Monster manual         |
| dnd5e.d20madjd.quest/reference        | SRD reference          |
