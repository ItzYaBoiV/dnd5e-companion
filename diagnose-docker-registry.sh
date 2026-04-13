#!/bin/bash
# READ-ONLY diagnostics for "docker pull / registry-1.docker.io" failures.
# Does not change any system or Docker settings.
#
# Run from anywhere; uses ~/Docker/dnd5e-companion paths only if present.
# Save output and send it:
#   bash diagnose-docker-registry.sh 2>&1 | tee ~/docker-registry-diagnostic.txt

set +e

echo "═══════════════════════════════════════════════════════════════════"
echo " Docker registry / DNS diagnostic bundle (read-only)"
echo " Generated: $(date -Is 2>/dev/null || date)"
echo " Hostname: $(hostname -f 2>/dev/null || hostname)"
echo "═══════════════════════════════════════════════════════════════════"

section() {
  echo ""
  echo "───────────────────────────────────────────────────────────────────"
  echo " $1"
  echo "───────────────────────────────────────────────────────────────────"
}

section "1) OS / kernel"
uname -a 2>/dev/null
[ -f /etc/os-release ] && cat /etc/os-release

section "2) Default route / interfaces (brief)"
command -v ip >/dev/null && ip -br route show default 2>/dev/null
command -v ip >/dev/null && ip -br a 2>/dev/null | head -40
echo "(… truncated if many interfaces; full count: $(ip -br a 2>/dev/null | wc -l) lines)"

section "3) /etc/resolv.conf (what glibc-style apps often use)"
ls -l /etc/resolv.conf 2>/dev/null
cat /etc/resolv.conf 2>/dev/null

section "4) systemd-resolved (if present)"
command -v resolvectl >/dev/null && resolvectl status 2>/dev/null || echo "resolvectl not found"
systemctl is-active systemd-resolved 2>/dev/null || true

section "5) DNS lookups — registry-1.docker.io"
echo "--- getent hosts (NSS) ---"
getent hosts registry-1.docker.io 2>&1 || true
echo "--- dig via stub 127.0.0.53 ---"
command -v dig >/dev/null && dig +time=2 +tries=1 +short registry-1.docker.io @127.0.0.53 2>&1 || echo "dig not installed (sudo apt install dnsutils)"
command -v dig >/dev/null && dig +time=2 +tries=1 registry-1.docker.io @127.0.0.53 2>&1 | tail -5
echo "--- dig via 8.8.8.8 ---"
command -v dig >/dev/null && dig +time=2 +tries=1 +short registry-1.docker.io @8.8.8.8 2>&1 || true
command -v dig >/dev/null && dig +time=2 +tries=1 registry-1.docker.io @8.8.8.8 2>&1 | tail -5

section "6) HTTPS reachability (curl, like a browser stack)"
command -v curl >/dev/null && curl -sS -o /dev/null -w "registry-1.docker.io/v2/ HTTP %{http_code} (401 without auth is OK)\n" --connect-timeout 8 --max-time 15 "https://registry-1.docker.io/v2/" 2>&1 || echo "curl failed or not installed"

section "7) Docker CLI / daemon (no pull)"
command -v docker >/dev/null || { echo "docker CLI not in PATH"; exit 0; }
docker version 2>&1
echo "--- docker info (subset) ---"
docker info 2>&1 | grep -iE '^(Server Version|Operating System|OSType|Architecture|Name|Registry|HTTP Proxy|HTTPS Proxy|No Proxy|Docker Root Dir|Debug Mode|Experimental|Insecure Registries|Registry Mirrors)' || docker info 2>&1 | head -35

section "8) Docker unit environment (proxy hints)"
systemctl show docker --property=Environment --no-pager 2>/dev/null || true

section "9) /etc/docker/daemon.json (if readable)"
if [ -r /etc/docker/daemon.json ]; then
  cat /etc/docker/daemon.json 2>/dev/null
else
  echo "not readable without sudo or missing"
  sudo -n cat /etc/docker/daemon.json 2>/dev/null || echo "(skip: run script with sudo for this file if you want it included)"
fi

section "10) LiteLLM compose image line (project)"
COMPOSE="$HOME/Docker/dnd5e-companion/ai-workers/load-balancer/docker-compose.yml"
if [ -f "$COMPOSE" ]; then
  grep -nE '^\s*image:' "$COMPOSE" 2>/dev/null || true
else
  echo "file not found: $COMPOSE"
fi

section "11) VPN / overlay hints (process names only)"
ps aux 2>/dev/null | grep -iE 'netbird|tailscale|wireguard|wg-quick|openvpn' | grep -v grep || echo "(none matched)"

section "12) tailscaled / netbird systemd (status only)"
systemctl status tailscaled --no-pager -l 2>&1 | head -15
systemctl status netbird --no-pager -l 2>&1 | head -15 || systemctl status netbird-client --no-pager -l 2>&1 | head -15 || true

section "13) Last Docker journal lines (recent errors, read-only)"
journalctl -u docker --no-pager -n 40 2>/dev/null || echo "journalctl -u docker unavailable (try: sudo journalctl -u docker -n 40)"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo " End of read-only bundle. If something needed sudo, re-run:"
echo "   sudo bash diagnose-docker-registry.sh 2>&1 | tee ~/docker-registry-diagnostic-sudo.txt"
echo "═══════════════════════════════════════════════════════════════════"
