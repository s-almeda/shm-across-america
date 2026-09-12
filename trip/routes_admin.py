import os
import uuid
from functools import wraps

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


def _admin_path():
    return current_app.config["ADMIN_PATH"]


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin"):
            return redirect(url_for("admin.login"))
        return view(*args, **kwargs)

    return wrapped


def register_admin_routes(app):
    path = app.config["ADMIN_PATH"]

    @bp.route(f"/{path}/login", methods=["GET", "POST"])
    def login():
        if request.method == "POST":
            password = request.form.get("password", "")
            if password and password == current_app.config["ADMIN_PASSWORD"]:
                session["admin"] = True
                return redirect(url_for("admin.dashboard"))
            flash("Wrong password.")
        return render_template("admin_login.html", admin_path=path)

    @bp.route(f"/{path}/logout")
    def logout():
        session.pop("admin", None)
        return redirect(url_for("admin.login"))

    @bp.route(f"/{path}/resolve-location", methods=["POST"])
    @admin_required
    def resolve_location_route():
        data = request.get_json(silent=True) or {}
        try:
            lat, lng, label, exact = resolve_location(data.get("query", ""))
        except GeocodeError as e:
            return jsonify({"error": str(e)}), 400
        return jsonify({"lat": lat, "lng": lng, "label": label, "exact": exact})

    @bp.route(f"/{path}/")
    @admin_required
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
    @admin_required
    def create_pin():
        db = get_db()
        lat = request.form.get("lat", type=float)
        lng = request.form.get("lng", type=float)
        label = (request.form.get("label") or "").strip() or None
        if lat is None or lng is None:
            flash("Lat/lng required.")
            return redirect(url_for("admin.dashboard"))

        db.execute("UPDATE pins SET is_current = 0")
        db.execute(
            "INSERT INTO pins (lat, lng, label, created_at, is_current) VALUES (?, ?, ?, ?, 1)",
            (lat, lng, label, now_iso()),
        )
        db.commit()
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/pins/<int:pin_id>/edit", methods=["POST"])
    @admin_required
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
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/pins/<int:pin_id>/make-current", methods=["POST"])
    @admin_required
    def make_current(pin_id):
        db = get_db()
        db.execute("UPDATE pins SET is_current = 0")
        db.execute("UPDATE pins SET is_current = 1 WHERE id = ?", (pin_id,))
        db.commit()
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/pins/<int:pin_id>/delete", methods=["POST"])
    @admin_required
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
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/pins/<int:pin_id>/messages/new", methods=["POST"])
    @admin_required
    def add_message(pin_id):
        db = get_db()
        text = (request.form.get("text") or "").strip()
        if text:
            db.execute(
                "INSERT INTO messages (pin_id, text, created_at) VALUES (?, ?, ?)",
                (pin_id, text, now_iso()),
            )
            db.commit()
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/messages/<int:message_id>/delete", methods=["POST"])
    @admin_required
    def delete_message(message_id):
        db = get_db()
        db.execute("DELETE FROM messages WHERE id = ?", (message_id,))
        db.commit()
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/pins/<int:pin_id>/photos/new", methods=["POST"])
    @admin_required
    def add_photo(pin_id):
        db = get_db()
        file = request.files.get("photo")
        if file and file.filename:
            ext = secure_filename(file.filename).rsplit(".", 1)[-1].lower()
            if ext in ALLOWED_IMAGE_EXT:
                filename = f"{uuid.uuid4().hex}.{ext}"
                upload_dir = current_app.config["UPLOAD_DIR"]
                os.makedirs(upload_dir, exist_ok=True)
                file.save(os.path.join(upload_dir, filename))
                db.execute(
                    "INSERT INTO photos (pin_id, file_path, created_at) VALUES (?, ?, ?)",
                    (pin_id, filename, now_iso()),
                )
                db.commit()
            else:
                flash("Unsupported image type.")
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/photos/<int:photo_id>/delete", methods=["POST"])
    @admin_required
    def delete_photo(photo_id):
        db = get_db()
        row = db.execute("SELECT file_path FROM photos WHERE id = ?", (photo_id,)).fetchone()
        if row:
            fp = os.path.join(current_app.config["UPLOAD_DIR"], row["file_path"])
            if os.path.exists(fp):
                os.remove(fp)
            db.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
            db.commit()
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/stops/new", methods=["POST"])
    @admin_required
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
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/stops/<int:stop_id>/delete", methods=["POST"])
    @admin_required
    def delete_stop(stop_id):
        db = get_db()
        db.execute("DELETE FROM planned_stops WHERE id = ?", (stop_id,))
        db.commit()
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/comments/toggle", methods=["POST"])
    @admin_required
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
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/comments/<int:comment_id>/restore", methods=["POST"])
    @admin_required
    def restore_comment(comment_id):
        db = get_db()
        db.execute("UPDATE comments SET status = 'visible' WHERE id = ?", (comment_id,))
        db.commit()
        return redirect(url_for("admin.dashboard"))

    @bp.route(f"/{path}/comments/<int:comment_id>/delete", methods=["POST"])
    @admin_required
    def delete_comment(comment_id):
        db = get_db()
        db.execute("UPDATE comments SET status = 'deleted' WHERE id = ?", (comment_id,))
        db.commit()
        return redirect(url_for("admin.dashboard"))

    app.register_blueprint(bp)
