#!/bin/bash
# When docker pull fails: lookup registry-1.docker.io on 127.0.0.53 — server misbehaving
# Run on the Linux host. May need sudo.

cat << 'TXT'
══════════════════════════════════════════════════════════════════
 Fix HOST DNS so:  getent hosts registry-1.docker.io  prints IPs
══════════════════════════════════════════════════════════════════

Restarting systemd-resolved alone does NOTHING until you set DNS servers.

Your LAN interface is usually the one with your home IP (e.g. enp2s0 = 192.168.x.x).
If you use Tailscale/WireGuard (interface like wt0, 100.x.x.x), it often breaks DNS —
try the Tailscale step below.

──────────────────────────────────────────────────────────────────
 STEP 1 — Set DNS on your Ethernet/Wi‑Fi link (replace enp2s0 if needed)
──────────────────────────────────────────────────────────────────
  ip -br a    # find the interface with 192.168.5.x (not docker br-, not lo)

  sudo resolvectl dns enp2s0 8.8.8.8 1.1.1.1
  sudo resolvectl flush-caches
  getent hosts registry-1.docker.io

  If you now see IP lines, run:
  sudo systemctl restart docker
  cd ~/Docker/dnd5e-companion/ai-workers/load-balancer
  docker compose pull && docker compose up -d

──────────────────────────────────────────────────────────────────
 STEP 2 — Make it persistent (Ubuntu systemd-resolved)
──────────────────────────────────────────────────────────────────
  sudo nano /etc/systemd/resolved.conf

  Under [Resolve], set (uncomment or add):
    DNS=8.8.8.8 1.1.1.1
    FallbackDNS=8.8.8.8 1.1.1.1

  sudo systemctl restart systemd-resolved
  getent hosts registry-1.docker.io

──────────────────────────────────────────────────────────────────
 STEP 3 — If you use Tailscale (wt0 / 100.x.x.x)
──────────────────────────────────────────────────────────────────
  Tailscale “MagicDNS” sometimes breaks lookups for docker.io:

    sudo tailscale set --accept-dns=false
    sudo resolvectl flush-caches
    getent hosts registry-1.docker.io

  Re-enable later if you want:  sudo tailscale set --accept-dns=true

──────────────────────────────────────────────────────────────────
 Other
──────────────────────────────────────────────────────────────────
  • Do not paste deploy.sh log lines (▶ Starting…) into the shell.
  • /etc/docker/daemon.json "dns" is for containers, not for docker pull.
  • Many stale docker bridges? After things work:  docker network prune
    (only removes unused networks — confirm when prompted)
  • "all predefined address pools have been fully subnetted":
      sudo bash ~/Docker/dnd5e-companion/fix-docker-address-pools.sh
      sudo systemctl restart docker
══════════════════════════════════════════════════════════════════
TXT
