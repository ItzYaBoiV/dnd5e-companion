#!/bin/bash
# Expand Docker's automatic bridge subnets so "docker compose" projects without
# explicit networks stop failing with:
#   all predefined address pools have been fully subnetted
#
# Edits /etc/docker/daemon.json (merges JSON; backs up first). Requires sudo.
# After run: sudo systemctl restart docker
#
# See: https://docs.docker.com/engine/daemon/#daemon-configuration-file

set -euo pipefail

DAEMON_JSON="/etc/docker/daemon.json"
BACKUP="/etc/docker/daemon.json.bak.$(date +%Y%m%d%H%M%S)"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo "$0" "$@"
fi

if [ ! -f "$DAEMON_JSON" ]; then
  echo "{}" > "$DAEMON_JSON"
fi

cp -a "$DAEMON_JSON" "$BACKUP"
echo "Backup: $BACKUP"

python3 << 'PY'
import json
import sys

path = "/etc/docker/daemon.json"

with open(path, "r", encoding="utf-8") as f:
    raw = f.read().strip()
    data = json.loads(raw) if raw else {}

# Pools Docker will use for NEW default bridge networks (compose default networks, etc.).
# 172.16.0.0/12 → up to 4096 /24 subnets (covers usual 172.17+ behavior explicitly).
# 10.128.0.0/9  → avoids common LAN & this repo's 10.0.200.x-style explicit subnets.
# 192.168.128.0/17 → avoids typical home 192.168.0.0–192.168.127.255 (e.g. 192.168.5.x).
RECOMMENDED = [
    {"base": "172.16.0.0/12", "size": 24},
    {"base": "10.128.0.0/9", "size": 24},
    {"base": "192.168.128.0/17", "size": 24},
]

existing = data.get("default-address-pools")
if existing is None:
    existing = []

if not isinstance(existing, list):
    print("error: default-address-pools exists but is not a list — fix manually", file=sys.stderr)
    sys.exit(1)

seen = {p.get("base") for p in existing if isinstance(p, dict) and "base" in p}
added = []
for p in RECOMMENDED:
    if p["base"] not in seen:
        existing.append(dict(p))
        seen.add(p["base"])
        added.append(p["base"])

data["default-address-pools"] = existing

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

if added:
    print("Appended default-address-pools bases:", ", ".join(added))
else:
    print("All recommended pools already present — no change to pool list.")
print("Wrote:", path)
PY

echo ""
echo "Validate:  docker info 2>/dev/null | grep -i 'address pool' || true"
echo "Then run:  sudo systemctl restart docker"
echo ""
echo "Optional: remove stale unused networks to free clutter (not required for pools):"
echo "  docker network prune"
echo ""
