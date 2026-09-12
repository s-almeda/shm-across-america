import os
import uuid
from datetime import datetime, timezone

from flask import (
    Blueprint,
    current_app,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.utils import secure_filename

from .db import get_db, now_iso
from .geocode import GeocodeError, resolve_location

bp = Blueprint("admin", __name__)

ALLOWED_IMAGE_EXT = {"png", "jpg", "jpeg", "gif", "webp", "heic"}


def parse_when(value, fallback=None):
    """Timestamps are stored as UTC ISO. Anything the browser sends has already
    been converted to UTC by the form, but be strict anyway."""
    if not value or not value.strip():
        return fallback
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("Couldn't read that date/time.")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def pin_anchor(pin_id=None):
    """Land back on the pin you were editing instead of the top of the page."""
    url = url_for("admin.dashboard")
    return f"{url}#pin-{pin_id}" if pin_id else url


def register_admin_routes(app):
    path = app.config["ADMIN_PATH"]

    # One gate for the whole blueprint, so a route added later can't
    # accidentally ship unprotected.
    @bp.before_request
    def require_admin():
        if request.endpoint == "admin.login":
            return None
        if not session.get("admin"):
            # An inline save must not get a login page back as if it worked.
            if (request.endpoint or "").startswith("admin.api_"):
                return jsonify({"error": "Logged out. Reload the page."}), 401
            return redirect(url_for("admin.login"))
        return None

    @bp.route(f"/{path}/login", methods=["GET", "POST"])
    def login():
        if request.method == "POST":
            password = request.form.get("password", "")
            if password and password == current_app.config["ADMIN_PASSWORD"]:
                session["admin"] = True
                # survives browser close; paired with a stable SECRET_KEY
                # this means logging in once per device, not once per restart
                session.permanent = True
                return redirect(url_for("admin.dashboard"))
            flash("Wrong password.")
        return render_template("admin_login.html", admin_path=path)

    @bp.route(f"/{path}/logout")
    def logout():
        session.pop("admin", None)
        return redirect(url_for("admin.login"))

    @bp.route(f"/{path}/resolve-location", methods=["POST"])
    def resolve_location_route():
        data = request.get_json(silent=True) or {}
        try:
            lat, lng, label, exact = resolve_location(data.get("query", ""))
        except GeocodeError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify({"lat": lat, "lng": lng, "label": label, "exact": exact})

    @bp.route(f"/{path}/")
    def dashboard():
        db = get_db()
        pin_rows = db.execute("SELECT * FROM pins ORDER BY created_at DESC, id DESC").fetchall()
        pins = []
        for pin in pin_rows:
            pin = dict(pin)
            pin["messages_list"] = db.execute(
                "SELECT * FROM messages WHERE pin_id = ? ORDER BY created_at ASC", (pin["id"],)
            ).fetchall()
            pin["photos_list"] = db.execute(
                "SELECT * FROM photos WHERE pin_id = ? ORDER BY created_at ASC", (pin["id"],)
            ).fetchall()
            pins.append(pin)
        stops = db.execute("SELECT * FROM planned_stops ORDER BY id ASC").fetchall()
        flagged = db.execute(
            """
            SELECT comments.*, pins.label AS pin_label
            FROM comments JOIN pins ON pins.id = comments.pin_id
            WHERE comments.status = 'flagged'
            ORDER BY comments.created_at DESC
            """
        ).fetchall()
        comments_enabled = (
            db.execute("SELECT value FROM settings WHERE key = 'comments_enabled'").fetchone()["value"]
            == "true"
        )
        return render_template(
            "admin_dashboard.html",
            admin_path=path,
            pins=pins,
            stops=stops,
            flagged=flagged,
            comments_enabled=comments_enabled,
        )

    @bp.route(f"/{path}/pins/new", methods=["POST"])
    def create_pin():
        db = get_db()
        lat = request.form.get("lat", type=float)
        lng = request.form.get("lng", type=float)
        label = (request.form.get("label") or "").strip() or None
        if lat is None or lng is None:
            flash("Lat/lng required.")
            return redirect(url_for("admin.dashboard"))

        db.execute("UPDATE pins SET is_current = 0")
        cur = db.execute(
            "INSERT INTO pins (lat, lng, label, created_at, is_current) VALUES (?, ?, ?, ?, 1)",
            (lat, lng, label, now_iso()),
        )
        db.commit()
        flash(f"Added {label or 'pin'} and made it current.", "ok")
        return redirect(pin_anchor(cur.lastrowid))

    @bp.route(f"/{path}/pins/<int:pin_id>/edit", methods=["POST"])
    def edit_pin(pin_id):
        db = get_db()
        lat = request.form.get("lat", type=float)
        lng = request.form.get("lng", type=float)
        label = (request.form.get("label") or "").strip() or None
        db.execute(
            "UPDATE pins SET lat = ?, lng = ?, label = ? WHERE id = ?",
            (lat, lng, label, pin_id),
        )
        db.commit()
        flash("Pin saved.", "ok")
        return redirect(pin_anchor(pin_id))

    @bp.route(f"/{path}/pins/<int:pin_id>/make-current", methods=["POST"])
    def make_current(pin_id):
        db = get_db()
        db.execute("UPDATE pins SET is_current = 0")
        db.execute("UPDATE pins SET is_current = 1 WHERE id = ?", (pin_id,))
        db.commit()
        flash("That pin is now current -- the car sits here.", "ok")
        return redirect(pin_anchor(pin_id))

    @bp.route(f"/{path}/pins/<int:pin_id>/delete", methods=["POST"])
    def delete_pin(pin_id):
        db = get_db()
        photos = db.execute("SELECT file_path FROM photos WHERE pin_id = ?", (pin_id,)).fetchall()
        for p in photos:
            fp = os.path.join(current_app.config["UPLOAD_DIR"], p["file_path"])
            if os.path.exists(fp):
                os.remove(fp)
        db.execute("DELETE FROM photos WHERE pin_id = ?", (pin_id,))
        db.execute("DELETE FROM messages WHERE pin_id = ?", (pin_id,))
        db.execute("DELETE FROM pins WHERE id = ?", (pin_id,))
        db.commit()
        flash("Pin deleted, along with its notes and photos.", "ok")
        return redirect(url_for("admin.dashboard"))

    # ---------- notes ----------

    @bp.route(f"/{path}/api/pins/<int:pin_id>/messages", methods=["POST"])
    def api_create_message(pin_id):
        db = get_db()
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        if not text:
            return jsonify({"error": "Nothing to post."}), 400
        try:
            when = parse_when(data.get("created_at"), now_iso())
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        cur = db.execute(
            "INSERT INTO messages (pin_id, text, created_at) VALUES (?, ?, ?)",
            (pin_id, text, when),
        )
        db.commit()
        return jsonify({"id": cur.lastrowid, "text": text, "created_at": when}), 201

    @bp.route(f"/{path}/api/messages/<int:message_id>", methods=["POST"])
    def api_save_message(message_id):
        db = get_db()
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        if not text:
            return jsonify({"error": "A note can't be empty."}), 400
        row = db.execute("SELECT created_at FROM messages WHERE id = ?", (message_id,)).fetchone()
        if not row:
            return jsonify({"error": "That note is gone."}), 404
        try:
            when = parse_when(data.get("created_at"), row["created_at"])
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        db.execute(
            "UPDATE messages SET text = ?, created_at = ? WHERE id = ?", (text, when, message_id)
        )
        db.commit()
        return jsonify({"id": message_id, "text": text, "created_at": when})

    @bp.route(f"/{path}/messages/<int:message_id>/delete", methods=["POST"])
    def delete_message(message_id):
        db = get_db()
        row = db.execute("SELECT pin_id FROM messages WHERE id = ?", (message_id,)).fetchone()
        db.execute("DELETE FROM messages WHERE id = ?", (message_id,))
        db.commit()
        flash("Note deleted.", "ok")
        return redirect(pin_anchor(row["pin_id"] if row else None))

    # ---------- photos ----------

    @bp.route(f"/{path}/pins/<int:pin_id>/photos/new", methods=["POST"])
    def add_photo(pin_id):
        db = get_db()
        file = request.files.get("photo")
        caption = (request.form.get("caption") or "").strip() or None
        if not (file and file.filename):
            flash("Pick an image first.")
            return redirect(pin_anchor(pin_id))

        ext = secure_filename(file.filename).rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_IMAGE_EXT:
            flash(f"Can't use a .{ext} -- try jpg, png, webp, gif or heic.")
            return redirect(pin_anchor(pin_id))

        try:
            when = parse_when(request.form.get("created_at"), now_iso())
        except ValueError as e:
            flash(str(e))
            return redirect(pin_anchor(pin_id))

        filename = f"{uuid.uuid4().hex}.{ext}"
        upload_dir = current_app.config["UPLOAD_DIR"]
        os.makedirs(upload_dir, exist_ok=True)
        file.save(os.path.join(upload_dir, filename))
        db.execute(
            "INSERT INTO photos (pin_id, file_path, caption, created_at) VALUES (?, ?, ?, ?)",
            (pin_id, filename, caption, when),
        )
        db.commit()
        flash("Photo uploaded.", "ok")
        return redirect(pin_anchor(pin_id))

    @bp.route(f"/{path}/api/photos/<int:photo_id>", methods=["POST"])
    def api_save_photo(photo_id):
        db = get_db()
        data = request.get_json(silent=True) or {}
        row = db.execute("SELECT created_at FROM photos WHERE id = ?", (photo_id,)).fetchone()
        if not row:
            return jsonify({"error": "That photo is gone."}), 404
        caption = (data.get("caption") or "").strip() or None
        try:
            when = parse_when(data.get("created_at"), row["created_at"])
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        db.execute(
            "UPDATE photos SET caption = ?, created_at = ? WHERE id = ?",
            (caption, when, photo_id),
        )
        db.commit()
        return jsonify({"id": photo_id, "caption": caption, "created_at": when})

    @bp.route(f"/{path}/photos/<int:photo_id>/delete", methods=["POST"])
    def delete_photo(photo_id):
        db = get_db()
        row = db.execute(
            "SELECT pin_id, file_path FROM photos WHERE id = ?", (photo_id,)
        ).fetchone()
        if row:
            fp = os.path.join(current_app.config["UPLOAD_DIR"], row["file_path"])
            if os.path.exists(fp):
                os.remove(fp)
            db.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
            db.commit()
            flash("Photo deleted.", "ok")
        return redirect(pin_anchor(row["pin_id"] if row else None))

    @bp.route(f"/{path}/stops/new", methods=["POST"])
    def create_stop():
        db = get_db()
        name = (request.form.get("name") or "").strip()
        lat = request.form.get("lat", type=float)
        lng = request.form.get("lng", type=float)
        note = (request.form.get("note") or "").strip() or None
        if name and lat is not None and lng is not None:
            db.execute(
                "INSERT INTO planned_stops (name, lat, lng, note) VALUES (?, ?, ?, ?)",
                (name, lat, lng, note),
            )
            db.commit()
            flash(f"Added planned stop: {name}.", "ok")
        else:
            flash("A stop needs both a name and a location.")
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/stops/<int:stop_id>/delete", methods=["POST"])
    def delete_stop(stop_id):
        db = get_db()
        db.execute("DELETE FROM planned_stops WHERE id = ?", (stop_id,))
        db.commit()
        flash("Planned stop deleted.", "ok")
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/comments/toggle", methods=["POST"])
    def toggle_comments():
        db = get_db()
        current = db.execute(
            "SELECT value FROM settings WHERE key = 'comments_enabled'"
        ).fetchone()["value"]
        new_value = "false" if current == "true" else "true"
        db.execute(
            "UPDATE settings SET value = ? WHERE key = 'comments_enabled'", (new_value,)
        )
        db.commit()
        flash(f"Comments are now {'on' if new_value == 'true' else 'off'}.", "ok")
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/comments/<int:comment_id>/restore", methods=["POST"])
    def restore_comment(comment_id):
        db = get_db()
        db.execute("UPDATE comments SET status = 'visible' WHERE id = ?", (comment_id,))
        db.commit()
        flash("Comment is visible again.", "ok")
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/comments/<int:comment_id>/delete", methods=["POST"])
    def delete_comment(comment_id):
        db = get_db()
        db.execute("UPDATE comments SET status = 'deleted' WHERE id = ?", (comment_id,))
        db.commit()
        flash("Comment deleted.", "ok")
        return redirect(url_for("admin.dashboard"))

    app.register_blueprint(bp)
