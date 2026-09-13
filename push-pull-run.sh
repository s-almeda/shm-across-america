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
#
# The sync here is deliberately unconditional, and it is not the same as the
# pull inside update.sh. update.sh ships in the repo, so it cannot be trusted
# to fetch its own replacement: if the copy on the server is missing or buggy,
# it can't be the thing that fixes itself. Syncing first means the server
# always runs the version that was just pushed.
#
# A reset rather than a pull, for the reason update.sh uses one too: dist/ is
# committed build output, so a merge would conflict on files nobody edited.
# Only tracked files are touched -- trip.db, uploads/ and .env are gitignored.
#
# -t so sudo inside update.sh can prompt, and so its output streams back live.
ssh -t "$HOST" "
  set -e
  cd $REMOTE_DIR
  git fetch origin
  git reset --hard origin/\$(git rev-parse --abbrev-ref HEAD)
  chmod +x update.sh
  ./update.sh
"

echo
echo "========================================================"
echo "  Live: https://shmtracker.snailbunny.site"
echo "========================================================"
