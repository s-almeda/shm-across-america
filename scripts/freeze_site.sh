#!/bin/bash
#
# Runs ON THE SERVER, as root. Turns shmtracker into a static site: nginx
# serves the built frontend, a frozen copy of /api/trip and the photos
# straight off disk, and the Flask app is switched off so nothing can write
# to the database again.
#
#   cd ~/Projects/shmtracker && bash scripts/freeze_site.sh
#
# Before running:
#   - deploy the latest code (dist/ is what gets published)
#   - in admin: turn comments off, and fix which pin is "current"
# Those are read from the live app at snapshot time and baked into trip.json.
#
# Nothing here deletes or edits trip.db or the photos. The old nginx config is
# kept, and the app is only stopped after the static site checks out, so
# UNDO (printed at the end) puts everything back.

set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
cd "$DIR"

DOMAIN="shmtracker.snailbunny.site"
SERVICE="shmtracker"
VHOST="/etc/nginx/sites-available/shmtracker"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

envval() { grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- || true; }
UPLOAD_DIR="$(envval UPLOAD_DIR)"
UPLOAD_DIR="${UPLOAD_DIR:-/srv/shmtracker/uploads}"
STATIC_DIR="/srv/shmtracker/static"
STAMP="$(date +%Y%m%d-%H%M%S)"

step() { echo; echo "=========================================="; echo " $1"; echo "=========================================="; }
die() { echo "  ERROR: $*" >&2; exit 1; }

# ----------------------------------------------------------------------------
step "1. Checking prerequisites"
# ----------------------------------------------------------------------------
[ "$(id -u)" = "0" ] || die "run as root (it writes nginx config)"
[ -f dist/index.html ] || die "no dist/index.html in $DIR -- deploy first"
[ -d "$UPLOAD_DIR" ] || die "no photo folder at $UPLOAD_DIR"
[ -f "$VHOST" ] || die "no nginx config at $VHOST"
[ -f "$CERT_DIR/fullchain.pem" ] || die "no TLS cert at $CERT_DIR"
systemctl is-active --quiet "$SERVICE" || die "$SERVICE isn't running -- it's needed for the final snapshot"
echo "  ok"

# ----------------------------------------------------------------------------
step "2. Taking the final snapshot"
# ----------------------------------------------------------------------------
bash "$DIR/scripts/snapshot_db.sh"
SNAP="$(ls -1d "$DIR"/snapshots/*/ | sort | tail -n1)"
SNAP="${SNAP%/}"
[ -f "$SNAP/trip.json" ] || die "the snapshot has no trip.json -- is the app answering on /api/trip?"

if grep -q '"comments_enabled": *true' "$SNAP/trip.json"; then
  echo
  echo "  Comments are still ON in this snapshot, so the frozen site would show"
  echo "  a comment form that can't post anywhere."
  read -r -p "  Continue anyway? [y/N] " ans
  [ "$ans" = "y" ] || die "turn comments off in admin, then run this again"
fi

# ----------------------------------------------------------------------------
step "3. Publishing the static files"
# ----------------------------------------------------------------------------
# A fresh folder each run, then swapped in, so a rerun never leaves a mix of
# old and new build files.
NEW="$STATIC_DIR.new"
rm -rf "$NEW"
mkdir -p "$NEW"
cp -r dist/. "$NEW/"
cp "$SNAP/trip.json" "$NEW/trip.json"
if [ -d "$STATIC_DIR" ]; then mv "$STATIC_DIR" "$STATIC_DIR.old-$STAMP"; fi
mv "$NEW" "$STATIC_DIR"
chmod -R a+rX "$STATIC_DIR"
echo "  $STATIC_DIR  ($(find "$STATIC_DIR" -type f | wc -l) files)"
echo "  photos stay in $UPLOAD_DIR"

# ----------------------------------------------------------------------------
step "4. Switching nginx to the static files"
# ----------------------------------------------------------------------------
BACKUP="$VHOST.flask-$STAMP"
cp "$VHOST" "$BACKUP"
echo "  old config kept at $BACKUP"

# Certbot's own include files, if this server has them -- same TLS settings
# the old config used.
SSL_EXTRA=""
[ -f /etc/letsencrypt/options-ssl-nginx.conf ] && SSL_EXTRA+="    include /etc/letsencrypt/options-ssl-nginx.conf;"$'\n'
[ -f /etc/letsencrypt/ssl-dhparams.pem ] && SSL_EXTRA+="    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"$'\n'

cat > "$VHOST" <<EOF
# Frozen static site, written by scripts/freeze_site.sh on $STAMP.
# The Flask version of this file is at $BACKUP.

server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
$SSL_EXTRA
    root $STATIC_DIR;

    # The frontend still asks for /api/trip; answer it with the frozen copy.
    location = /api/trip {
        default_type application/json;
        add_header Cache-Control "no-cache";
        alias $STATIC_DIR/trip.json;
    }

    location /uploads/ {
        alias $UPLOAD_DIR/;
    }

    # Content-hashed filenames, so these can be cached for good.
    location /build/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Comments, flags, the SMS webhook and admin are gone.
    location /api/ { return 410; }
    location = /sms { return 410; }

    location / {
        try_files \$uri /index.html;
    }
}
EOF

if ! nginx -t 2>&1 | sed 's/^/  /'; then
  cp "$BACKUP" "$VHOST"
  die "nginx rejected the new config -- the old one is restored, nothing changed"
fi
systemctl reload nginx
echo "  nginx reloaded"

# ----------------------------------------------------------------------------
step "5. Checking the static site"
# ----------------------------------------------------------------------------
JS="$(grep -o 'build/index-[^"]*\.js' "$STATIC_DIR/index.html" | head -n1)"
PHOTO="$(find "$UPLOAD_DIR" -type f | head -n1)"
PHOTO="${PHOTO#"$UPLOAD_DIR"/}"
FAILED=0
check() {
  local label="$1" path="$2" want="$3"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/$path" || echo 000)"
  printf '  %-10s %s' "$label" "$code"
  if [ "$code" = "$want" ]; then echo; else echo "   (expected $want)"; FAILED=1; fi
}
check "page"     ""              200
check "js"       "$JS"           200
check "trip"     "api/trip"      200
[ -n "$PHOTO" ] && check "photo" "uploads/$PHOTO" 200
check "comments" "api/comments"  410

if [ "$FAILED" = "1" ]; then
  cp "$BACKUP" "$VHOST"
  nginx -t >/dev/null 2>&1 && systemctl reload nginx
  die "the static site didn't check out -- the Flask config is restored and the app is still running"
fi

# ----------------------------------------------------------------------------
step "6. Switching off the Flask app"
# ----------------------------------------------------------------------------
echo "  The static site is live. Open https://$DOMAIN and click around before"
echo "  answering: once the app is off, nothing can change the database."
read -r -p "  Stop and disable $SERVICE now? [y/N] " ans
if [ "$ans" = "y" ]; then
  systemctl disable --now "$SERVICE"
  echo "  $SERVICE stopped and won't start on boot"
else
  echo "  left running -- to stop it later: systemctl disable --now $SERVICE"
fi

echo
echo "========================================================"
echo "  Frozen. https://$DOMAIN"
echo
echo "  Snapshot:  $SNAP"
echo
echo "  UNDO (back to the live app):"
echo "    cp $BACKUP $VHOST"
echo "    systemctl enable --now $SERVICE"
echo "    nginx -t && systemctl reload nginx"
echo "========================================================"
