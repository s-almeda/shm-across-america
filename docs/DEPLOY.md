# Deploying to shmtracker.snailbunny.site

Assumes the server runs **nginx + systemd** and already serves other sites on
other ports. If it's Caddy or Apache instead, only step 6 changes.

The frontend is built **on the laptop** and committed, so the server never needs
Node. Deploying is `git pull` + restart, forever.

---

## 0. On the laptop: build and push

```bash
cd ~/Projects/shm-across-america
npm run build
git add -A
git commit -m "Seed planned stops, hide/show stops, favicon"
git push
```

`dist/` is committed on purpose. If `git status` shows changes under `dist/`
after a build, they must go in the commit or the server serves stale JS.

---

## 1. Pick a free port

```bash
ssh snailbunny.site
sudo ss -tlnp | awk '{print $4, $7}' | sort
```

Pick something not listed. This guide uses **8730** — substitute yours
everywhere below if it's taken.

---

## 2. Point DNS at the server

In the DNS panel for `snailbunny.site`, add:

| Type | Name        | Value                     |
|------|-------------|---------------------------|
| A    | `shmtracker`| *(same IP as the apex record)* |

Check it resolves before doing TLS:

```bash
dig +short shmtracker.snailbunny.site
```

---

## 3. Clone and install

```bash
sudo mkdir -p /srv/shmtracker
sudo chown "$USER":"$USER" /srv/shmtracker
git clone https://github.com/s-almeda/shm-across-america.git /srv/shmtracker
cd /srv/shmtracker

python3 -m venv venv
venv/bin/pip install -q -r requirements.txt
```

---

## 4. Create the server's `.env`

`.env` is gitignored, so it does **not** come down with the clone — make it here.
Use a *different* `ADMIN_PASSWORD` than the laptop's, and generate a fresh
`SECRET_KEY`:

```bash
cd /srv/shmtracker
venv/bin/python -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))" > .env
cat >> .env <<'EOF'
ADMIN_PASSWORD=CHANGE-ME-to-something-long
ADMIN_PATH=hq-8271
DATABASE_PATH=/srv/shmtracker/trip.db
UPLOAD_DIR=/srv/shmtracker/uploads
PORT=8730
EOF
chmod 600 .env
```

Then edit `ADMIN_PASSWORD`:

```bash
nano .env
```

`SECRET_KEY` must never change after this — rewriting it logs every device out.
`ADMIN_PATH` is the obscured admin URL; changing it changes the login URL.

---

## 5. Seed the planned route

The database is gitignored, so the server starts empty. Create the schema and
the nineteen orange planned-stop pins:

```bash
cd /srv/shmtracker
mkdir -p uploads
venv/bin/python -m scripts.seed_stops
```

Safe to re-run — it matches on name and only adds what's missing.

---

## 6. Run it under systemd

```bash
sudo tee /etc/systemd/system/shmtracker.service >/dev/null <<'EOF'
[Unit]
Description=shmtracker
After=network.target

[Service]
User=REPLACE_WITH_YOUR_USER
WorkingDirectory=/srv/shmtracker
EnvironmentFile=/srv/shmtracker/.env
ExecStart=/srv/shmtracker/venv/bin/gunicorn --workers 2 --bind 127.0.0.1:8730 wsgi:app
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo sed -i "s/REPLACE_WITH_YOUR_USER/$USER/" /etc/systemd/system/shmtracker.service
sudo systemctl daemon-reload
sudo systemctl enable --now shmtracker
systemctl status shmtracker --no-pager
```

Bound to `127.0.0.1`, so only nginx can reach it directly.

Quick check before involving nginx:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8730/
curl -s http://127.0.0.1:8730/api/trip | head -c 300
```

Expect `200` and JSON with 19 `planned_stops`.

---

## 7. nginx vhost

```bash
sudo tee /etc/nginx/sites-available/shmtracker >/dev/null <<'EOF'
server {
    listen 80;
    server_name shmtracker.snailbunny.site;

    # Phone photos are the big uploads here; the default 1M rejects them.
    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:8730;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/shmtracker /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` failing here means a syntax error or a `server_name` clash with an
existing site — fix before reloading, a bad reload takes the other sites down.

---

## 8. HTTPS

```bash
sudo certbot --nginx -d shmtracker.snailbunny.site
```

Certbot rewrites the vhost to add TLS and an http→https redirect. Twilio will
not post to a plain-http webhook, so this is required, not optional.

---

## 9. Point Twilio at the new webhook

In the Twilio console, set the number's incoming-message webhook to:

```
https://shmtracker.snailbunny.site/sms
```

---

## 10. Test it

```bash
curl -s -o /dev/null -w 'root      %{http_code}\n' https://shmtracker.snailbunny.site/
curl -s -o /dev/null -w 'js        %{http_code}\n' "https://shmtracker.snailbunny.site/$(grep -o 'build/index-[^"]*\.js' /srv/shmtracker/dist/index.html)"
curl -s -o /dev/null -w 'favicon   %{http_code}\n' https://shmtracker.snailbunny.site/assets/favicon.png
curl -s -o /dev/null -w 'car       %{http_code}\n' https://shmtracker.snailbunny.site/assets/car.png
curl -s -o /dev/null -w 'api       %{http_code}\n' https://shmtracker.snailbunny.site/api/trip
curl -s -o /dev/null -w 'admin     %{http_code}\n' "https://shmtracker.snailbunny.site/$(grep ADMIN_PATH /srv/shmtracker/.env | cut -d= -f2)/login"
```

All `200`. Then in a browser:

1. Map loads with 19 orange pins, **no route line between them**.
2. Hover an orange pin → its place name in a tooltip.
3. Favicon shows in the tab (hard-refresh — browsers cache these hard).
4. Log in at the admin URL, add a pin with a location, post a note and a photo.
5. Reload the map → the new pin has the car on it, with its note and photo.
6. Leave a comment from the public map, pick a colour, post; reload and confirm
   the colour persisted.
7. In admin, **Hide from map** a planned stop → reload the map, its orange pin
   is gone. **Show on map** → it's back.
8. Text the Twilio number → it appears on the current pin.

---

## Updating later

```bash
# laptop
npm run build && git add -A && git commit -m "..." && git push

# server
cd /srv/shmtracker && git pull && sudo systemctl restart shmtracker
```

If a `pip`-level dependency changed, add
`venv/bin/pip install -q -r requirements.txt` before the restart.

## Backing up the trip

`trip.db` and `uploads/` are the only irreplaceable things on the server, and
neither is in git. From the laptop:

```bash
scp snailbunny.site:/srv/shmtracker/trip.db ./backups/trip-$(date +%F).db
rsync -a snailbunny.site:/srv/shmtracker/uploads/ ./backups/uploads/
```

Worth running from the road every few days.

## If something breaks

```bash
sudo journalctl -u shmtracker -n 50 --no-pager   # app errors
sudo tail -50 /var/log/nginx/error.log           # proxy/TLS errors
sudo systemctl restart shmtracker
```
