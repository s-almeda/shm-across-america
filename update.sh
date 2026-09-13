#!/bin/bash
#
# Runs ON THE SERVER. Pulls the latest code, migrates the database without
# touching the data in it, and restarts the service.
#
#   cd ~/Projects/shmtracker && ./update.sh
#
# Safe to run repeatedly. The three things that can't be recreated -- trip.db,
# uploads/ and .env -- are all gitignored, so nothing here can overwrite them,
# and the database is backed up before anything else happens.

set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Bash reads a script incrementally as it runs, so a `git pull` that rewrites
# this file mid-execution can make the rest of it garbage. Re-exec from a copy
# first, then the original is free to change underneath us.
if [ "${UPDATE_SH_REEXEC:-}" != "1" ]; then
  COPY="$(mktemp /tmp/update-sh.XXXXXX)"
  cp "$0" "$COPY"
  chmod +x "$COPY"
  UPDATE_SH_REEXEC=1 exec "$COPY" "$@"
fi

cd "$DIR"

DB="${DATABASE_PATH:-$DIR/trip.db}"
BACKUP_DIR="$DIR/backups"
KEEP_BACKUPS=20
PY="$DIR/venv/bin/python"

step() { echo; echo "=========================================="; echo " $1"; echo "=========================================="; }

# ----------------------------------------------------------------------------
step "1. Backing up the database"
# ----------------------------------------------------------------------------
if [ -f "$DB" ]; then
  mkdir -p "$BACKUP_DIR"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  DEST="$BACKUP_DIR/trip-$STAMP.db"
  # sqlite3's own backup, not cp: the service is still running and may be
  # mid-write, and a plain copy of a database being written to is not
  # guaranteed to be a valid database.
  "$PY" - "$DB" "$DEST" <<'EOF'
import sqlite3, sys
src, dest = sys.argv[1], sys.argv[2]
with sqlite3.connect(f"file:{src}?mode=ro", uri=True) as s, sqlite3.connect(dest) as d:
    s.backup(d)
print(f"  backed up to {dest}")
EOF
  # Keep the most recent few; these are small, but not infinite.
  ls -1t "$BACKUP_DIR"/trip-*.db 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm --
  echo "  $(ls -1 "$BACKUP_DIR"/trip-*.db 2>/dev/null | wc -l) backup(s) kept"
else
  echo "  no database yet at $DB -- it'll be created on first start"
fi

# ----------------------------------------------------------------------------
step "2. Pulling the latest code"
# ----------------------------------------------------------------------------
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch origin "$BRANCH"
# Hard reset rather than merge, on purpose: dist/ is committed build output, so
# anything that rebuilt here would collide with every future pull. Only tracked
# files are touched -- trip.db, uploads/ and .env are gitignored and survive.
git reset --hard "origin/$BRANCH"
echo "  now at $(git log -1 --format='%h %s')"

# ----------------------------------------------------------------------------
step "3. Updating Python dependencies"
# ----------------------------------------------------------------------------
"$DIR/venv/bin/pip" install -q -r requirements.txt
echo "  done"

# ----------------------------------------------------------------------------
step "4. Migrating the database"
# ----------------------------------------------------------------------------
# create_app() runs init_db(), which is CREATE TABLE IF NOT EXISTS plus
# explicit ALTERs for added columns -- it adds what's missing and never drops
# or rewrites anything. Doing it here rather than letting the first request do
# it means a broken migration fails while the old service is still up.
"$PY" - <<'EOF'
from dotenv import load_dotenv
load_dotenv()
from trip import create_app
from trip.db import get_db

app = create_app()   # runs init_db
with app.app_context():
    db = get_db()
    tables = sorted(r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"))
    print("  tables:", ", ".join(tables))
    for t in ("pins", "messages", "photos", "comments", "planned_stops"):
        if t in tables:
            n = db.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            print(f"    {t:<15} {n} row(s)")
EOF

# ----------------------------------------------------------------------------
step "5. Restarting the service"
# ----------------------------------------------------------------------------
sudo systemctl reset-failed shmtracker || true
sudo systemctl restart shmtracker
sleep 1
sudo systemctl status shmtracker --no-pager --lines=0

# ----------------------------------------------------------------------------
step "6. Checking it answers"
# ----------------------------------------------------------------------------
PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 || true)"
PORT="${PORT:-8730}"
sleep 1
CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/trip" || echo 000)"
if [ "$CODE" = "200" ]; then
  echo "  /api/trip -> 200"
else
  echo "  /api/trip -> $CODE  (check: journalctl -u shmtracker -n 40 --no-pager)"
  exit 1
fi

echo
echo "========================================================"
echo "  Updated. https://shmtracker.snailbunny.site"
echo "========================================================"
