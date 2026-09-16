import re

from flask import Blueprint, jsonify, request

from .db import get_db, now_iso

bp = Blueprint("api", __name__, url_prefix="/api")

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def clean_color(value):
    """Only a plain 6-digit hex gets stored -- this string is interpolated
    into a style attribute on the map."""
    value = (value or "").strip()
    return value.lower() if HEX_COLOR.match(value) else None


def _setting(db, key, default=None):
    row = db.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


@bp.route("/trip", methods=["GET"])
def trip():
    db = get_db()

    pins = []
    for pin in db.execute("SELECT * FROM pins WHERE hidden = 0 ORDER BY COALESCE(arrival_time, created_at) ASC, id ASC").fetchall():
        messages = db.execute(
            "SELECT text, created_at FROM messages WHERE pin_id = ? ORDER BY created_at ASC",
            (pin["id"],),
        ).fetchall()
        photos = db.execute(
            "SELECT file_path, caption, created_at FROM photos WHERE pin_id = ? ORDER BY created_at ASC",
            (pin["id"],),
        ).fetchall()
        comments = db.execute(
            "SELECT id, author_name, author_color, body, created_at FROM comments WHERE pin_id = ? AND status = 'visible' ORDER BY created_at ASC",
            (pin["id"],),
        ).fetchall()

        pins.append(
            {
                "id": pin["id"],
                "lat": pin["lat"],
                "lng": pin["lng"],
                "label": pin["label"],
                "created_at": pin["created_at"],
                "is_current": bool(pin["is_current"]),
                "messages": [{"text": m["text"], "created_at": m["created_at"]} for m in messages],
                "photos": [
                    {
                        "url": f"/uploads/{p['file_path']}",
                        "caption": p["caption"],
                        "created_at": p["created_at"],
                    }
                    for p in photos
                ],
                "comments": [
                    {
                        "id": c["id"],
                        "author_name": c["author_name"],
                        "author_color": c["author_color"],
                        "body": c["body"],
                        "created_at": c["created_at"],
                    }
                    for c in comments
                ],
            }
        )

    # Hidden stops stay in the database -- they're just off the public map, so
    # they can come back with one click once the road changes.
    planned_stops = [
        dict(row)
        for row in db.execute(
            "SELECT id, name, lat, lng, note FROM planned_stops"
            " WHERE hidden = 0 ORDER BY id ASC"
        ).fetchall()
    ]

    comments_enabled = _setting(db, "comments_enabled", "true") == "true"

    return jsonify(
        {
            "pins": pins,
            "planned_stops": planned_stops,
            "comments_enabled": comments_enabled,
        }
    )


@bp.route("/comments", methods=["POST"])
def post_comment():
    db = get_db()
    data = request.get_json(silent=True) or {}

    if _setting(db, "comments_enabled", "true") != "true":
        return jsonify({"error": "comments are disabled"}), 403

    pin_id = data.get("pin_id")
    pin = db.execute("SELECT id FROM pins WHERE id = ?", (pin_id,)).fetchone() if pin_id else None
    if not pin:
        return jsonify({"error": "pin_id must reference an existing pin"}), 400

    author_name = (data.get("author_name") or "").strip()
    body = (data.get("body") or "").strip()
    if not author_name or not body:
        return jsonify({"error": "author_name and body are required"}), 400

    author_color = clean_color(data.get("author_color"))
    created_at = now_iso()
    cur = db.execute(
        "INSERT INTO comments (pin_id, author_name, author_color, body, created_at, status)"
        " VALUES (?, ?, ?, ?, ?, 'visible')",
        (pin_id, author_name, author_color, body, created_at),
    )
    db.commit()

    return (
        jsonify(
            {
                "id": cur.lastrowid,
                "pin_id": pin_id,
                "author_name": author_name,
                "author_color": author_color,
                "body": body,
                "created_at": created_at,
            }
        ),
        201,
    )


@bp.route("/comments/<int:comment_id>/flag", methods=["POST"])
def flag_comment(comment_id):
    db = get_db()
    db.execute("UPDATE comments SET status = 'flagged' WHERE id = ? AND status = 'visible'", (comment_id,))
    db.commit()
    return ("", 204)
