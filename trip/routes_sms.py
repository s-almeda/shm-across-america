import re

from flask import Blueprint, current_app, request
from twilio.twiml.messaging_response import MessagingResponse

from .db import get_db, now_iso
from .geocode import GeocodeError, resolve_location
from .media import download_media

bp = Blueprint("sms", __name__)

LOCATION_PREFIX_RE = re.compile(r"^\s*location:\s*", re.IGNORECASE)


def _get_current_pin(db):
    return db.execute("SELECT * FROM pins WHERE is_current = 1 ORDER BY id DESC LIMIT 1").fetchone()


@bp.route("/sms", methods=["POST"])
def sms():
    db = get_db()
    body = (request.form.get("Body") or "").strip()
    num_media = int(request.form.get("NumMedia", "0") or "0")

    resp = MessagingResponse()

    loc_match = LOCATION_PREFIX_RE.match(body)
    if loc_match:
        remainder = body[loc_match.end():]
        try:
            lat, lng, label, _exact = resolve_location(remainder)
        except GeocodeError as e:
            resp.message(f"Couldn't parse that location: {e}")
            return str(resp)

        db.execute("UPDATE pins SET is_current = 0")
        db.execute(
            "INSERT INTO pins (lat, lng, label, created_at, is_current) VALUES (?, ?, ?, ?, 1)",
            (lat, lng, label, now_iso()),
        )
        db.commit()

        resp.message(f"✓ pin added{f' ({label})' if label else ''}")
        return str(resp)

    pin = _get_current_pin(db)
    if pin is None:
        resp.message("No trip location yet — send LOCATION: <lat>, <lng> first.")
        return str(resp)

    added = []

    if body:
        db.execute(
            "INSERT INTO messages (pin_id, text, created_at) VALUES (?, ?, ?)",
            (pin["id"], body, now_iso()),
        )
        added.append("note")

    account_sid = current_app.config.get("TWILIO_ACCOUNT_SID")
    auth_token = current_app.config.get("TWILIO_AUTH_TOKEN")
    upload_dir = current_app.config["UPLOAD_DIR"]

    photo_failures = 0
    for i in range(num_media):
        media_url = request.form.get(f"MediaUrl{i}")
        if not media_url:
            continue
        try:
            filename = download_media(media_url, account_sid, auth_token, upload_dir)
            db.execute(
                "INSERT INTO photos (pin_id, file_path, created_at) VALUES (?, ?, ?)",
                (pin["id"], filename, now_iso()),
            )
        except Exception:
            photo_failures += 1

    if num_media and num_media - photo_failures > 0:
        added.append("photo" if num_media - photo_failures == 1 else "photos")

    db.commit()

    if not added:
        resp.message("Got it, but there was nothing to save.")
    else:
        resp.message(f"✓ {' + '.join(added)} added")

    return str(resp)
