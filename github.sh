#!/usr/bin/env bash
# Stage, commit, and push the current branch to origin (GitHub).
#
# Upstream repo: https://github.com/ItzYaBoiV/dnd5e-companion
# Git does not use `gh` for HTTPS until you run: gh auth setup-git
# This script runs that automatically when `gh` is installed (idempotent).
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

# Wire Git's HTTPS credential helper to GitHub CLI so push does not prompt for user/password.
# (SSH remotes use your SSH agent instead; this is harmless to run once.)
ensure_gh_credential_helper() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "Tip: install GitHub CLI and run: gh auth login && gh auth setup-git" >&2
    return 0
  fi
  local url
  url=$(git remote get-url origin 2>/dev/null) || return 0
  case "$url" in
    https://github.com/*|https://*.github.com/*)
      gh auth setup-git
      ;;
    *)
      # git@github.com:... — SSH; no gh credential helper required for auth
      ;;
  esac
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

ensure_gh_credential_helper

# Push even if we didn't commit (e.g. already committed locally)
if ! git rev-parse --abbrev-ref "@{u}" >/dev/null 2>&1; then
  echo "Setting upstream: origin/$branch"
  git push -u origin "$branch"
else
  git push
fi

echo "Done. Branch: $branch → origin ($(git remote get-url origin))"
