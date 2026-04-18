#!/usr/bin/env bash
# Stage, commit, and push the current branch to origin (GitHub).
#
# Upstream repo: https://github.com/ItzYaBoiV/dnd5e-companion
# If you use `gh auth login`, HTTPS push to github.com usually works without extra setup.
# Override remote URL: GITHUB_REPO_URL='git@github.com:ItzYaBoiV/dnd5e-companion.git' ./github.sh
#
# Usage:
#   ./github.sh                    # commit with default message
#   ./github.sh "Your message"     # commit with a custom message
#   ./github.sh --status-only      # show git status and exit (no commit/push)
set -euo pipefail

cd "$(dirname "$0")"

# Default matches https://github.com/ItzYaBoiV/dnd5e-companion
GITHUB_REPO_URL="${GITHUB_REPO_URL:-https://github.com/ItzYaBoiV/dnd5e-companion.git}"

ensure_origin() {
  if git remote get-url origin >/dev/null 2>&1; then
    return 0
  fi
  echo "No 'origin' remote — adding: $GITHUB_REPO_URL"
  git remote add origin "$GITHUB_REPO_URL"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Stage, commit, and push the current branch to origin (GitHub).

  ./github.sh [message]     Commit with message (default if omitted)
  ./github.sh --status-only Show git status only
EOF
  exit 0
fi

if [[ "${1:-}" == "--status-only" ]]; then
  git status
  exit 0
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "error: not inside a git repository" >&2
  exit 1
fi

ensure_origin

branch=$(git branch --show-current)
msg=${*:-chore: sync local changes before next prompts}

if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -m "$msg"
else
  echo "Nothing to commit (working tree clean)."
fi

# Push even if we didn't commit (e.g. already committed locally)
if ! git rev-parse --abbrev-ref "@{u}" >/dev/null 2>&1; then
  echo "Setting upstream: origin/$branch"
  git push -u origin "$branch"
else
  git push
fi

echo "Done. Branch: $branch → origin ($(git remote get-url origin))"
