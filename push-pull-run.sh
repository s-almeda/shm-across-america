#!/bin/bash
#
# Runs ON THE LAPTOP. Builds the frontend, commits and pushes it, then tells
# the server to pull and restart.
#
#   ./push-pull-run.sh                  # commit message is auto-generated
#   ./push-pull-run.sh "fix the pins"   # or give one
#
# The build happens here, not on the server: dist/ is committed, so the server
# only ever needs git and Python.

set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

HOST="snailbunny"
REMOTE_DIR="~/Projects/shmtracker"
MESSAGE="${1:-deploy $(date +'%Y-%m-%d %H:%M')}"

step() { echo; echo "=========================================="; echo " $1"; echo "=========================================="; }

# ----------------------------------------------------------------------------
step "1. Building the frontend"
# ----------------------------------------------------------------------------
npm run build

# ----------------------------------------------------------------------------
step "2. Committing and pushing"
# ----------------------------------------------------------------------------
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "$MESSAGE"
  echo "  committed: $MESSAGE"
else
  echo "  nothing to commit -- pushing whatever isn't on the remote yet"
fi
git push origin "$BRANCH"

# ----------------------------------------------------------------------------
step "3. Updating the server"
# ----------------------------------------------------------------------------
# -t so sudo inside update.sh can prompt, and so its output streams back live.
ssh -t "$HOST" "cd $REMOTE_DIR && ./update.sh"

echo
echo "========================================================"
echo "  Live: https://shmtracker.snailbunny.site"
echo "========================================================"
