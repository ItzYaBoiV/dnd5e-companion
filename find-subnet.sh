#!/bin/bash
# find-subnet.sh
# Scans all existing Docker network subnets on this machine,
# finds a free one, and writes it into docker-compose.yml.
# Read-only scan — no containers are touched.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
GREEN='\033[0;32m'; GOLD='\033[0;33m'; RED='\033[0;31m'; RESET='\033[0m'; BOLD='\033[1m'

echo -e "${BOLD}Scanning Docker networks on this machine...${RESET}"

# Collect every subnet currently claimed by any Docker network
USED=$(docker network ls -q \
  | xargs docker network inspect \
      --format '{{range .IPAM.Config}}{{.Subnet}}{{"\n"}}{{end}}' 2>/dev/null \
  | grep -v '^$' | sort -u)

echo "Used subnets:"
echo "$USED" | sed 's/^/  /'
echo ""

# Try 172.20–172.29 first (Docker's typical custom range)
FREE=""
for i in $(seq 20 29); do
  CANDIDATE="172.${i}.0.0/24"
  if ! echo "$USED" | grep -qE "172\.${i}\."; then
    FREE="$CANDIDATE"
    break
  fi
done

# Fallback: try 10.0.200–10.0.220 (unlikely to clash with real LANs)
if [ -z "$FREE" ]; then
  for i in $(seq 200 220); do
    CANDIDATE="10.0.${i}.0/24"
    if ! echo "$USED" | grep -qE "10\.0\.${i}\."; then
      FREE="$CANDIDATE"
      break
    fi
  done
fi

if [ -z "$FREE" ]; then
  echo -e "${RED}Could not find a free subnet.${RESET}"
  echo "Run:  docker network prune -f"
  echo "Then: ./find-subnet.sh"
  exit 1
fi

echo -e "${GREEN}Free subnet found: $FREE${RESET}"

# Write it into docker-compose.yml (replaces placeholder or existing subnet line)
sed -i "s|subnet:.*|subnet: $FREE|" "$COMPOSE_FILE"

echo -e "${GREEN}Updated docker-compose.yml → subnet: $FREE${RESET}"
echo ""
echo "Now run:  docker compose up -d --build"
