#!/bin/bash
#
# Runs ON THE SERVER. Takes a frozen copy of the live database as plain files,
# without stopping the service or writing to the database.
#
#   cd ~/Projects/shmtracker && bash scripts/snapshot_db.sh
#
# Writes into snapshots/<timestamp>/:
#   trip.db    -- a complete SQLite copy, openable with sqlite3 / DB Browser
#   trip.json  -- what /api/trip serves right now (hidden pins and flagged
#                 comments already left out), i.e. exactly what the site shows
#
# Photos are files in UPLOAD_DIR, not in the database, so they aren't copied.

set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
cd "$DIR"

# The real path lives in .env (/srv/shmtracker/trip.db on the server), not in
# the shell's environment, so read it from there first.
envval() { grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- || true; }
DB="${DATABASE_PATH:-$(envval DATABASE_PATH)}"
DB="${DB:-$DIR/trip.db}"
PORT="$(envval PORT)"
PORT="${PORT:-8730}"
PY="$DIR/venv/bin/python"
[ -x "$PY" ] || PY="python3"

if [ ! -f "$DB" ]; then
  echo "No database at $DB" >&2
  exit 1
fi

OUT="$DIR/snapshots/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

# sqlite3's backup API rather than cp: the service may be mid-write, and a
# plain copy of a database being written to isn't guaranteed to be valid.
# The source is opened read-only, so this can't change it.
"$PY" - "$DB" "$OUT/trip.db" <<'EOF'
import sqlite3, sys
src, dest = sys.argv[1], sys.argv[2]
with sqlite3.connect(f"file:{src}?mode=ro", uri=True) as s, sqlite3.connect(dest) as d:
    s.backup(d)
with sqlite3.connect(dest) as d:
    ok = d.execute("PRAGMA integrity_check").fetchone()[0]
    print(f"  trip.db     integrity: {ok}")
    for t in ("pins", "messages", "photos", "comments", "planned_stops"):
        try:
            n = d.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            print(f"    {t:<15} {n} row(s)")
        except sqlite3.OperationalError:
            pass
EOF

CODE="$(curl -s -o "$OUT/trip.json" -w '%{http_code}' "http://127.0.0.1:$PORT/api/trip" || echo 000)"
if [ "$CODE" = "200" ]; then
  echo "  trip.json   $(wc -c < "$OUT/trip.json" | tr -d ' ') bytes"
else
  rm -f "$OUT/trip.json"
  echo "  trip.json   skipped (/api/trip on port $PORT answered $CODE)"
fi

echo
echo "Snapshot of $DB saved to:"
echo "  $OUT"
echo
echo "To copy it to the laptop:"
echo "  scp -r snailbunny:$OUT ."
