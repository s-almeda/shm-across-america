import os
from datetime import timedelta

from flask import Flask

from . import db as db_module
from .routes_admin import register_admin_routes
from .routes_api import bp as api_bp
from .routes_sms import bp as sms_bp


def create_app():
    app = Flask(
        __name__,
        # Built by `npm run build` and committed, so deploying stays
        # git pull + restart with no Node on the server.
        static_folder="../dist",
        static_url_path="",
        template_folder="../templates",
    )

    # Must be stable across restarts -- a random key per boot silently
    # invalidates every session cookie, logging you out on every restart.
    secret = os.environ.get("SECRET_KEY")
    if not secret:
        raise RuntimeError(
            "SECRET_KEY is missing from .env. Generate one with:\n"
            '  python -c "import secrets; print(secrets.token_hex(32))"'
        )
    app.config["SECRET_KEY"] = secret

    # Stay logged in: a persistent cookie the browser keeps after closing,
    # unreadable from JS.
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=365)
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

    app.config["ADMIN_PASSWORD"] = os.environ["ADMIN_PASSWORD"]
    app.config["TWILIO_ACCOUNT_SID"] = os.environ.get("TWILIO_ACCOUNT_SID")
    app.config["TWILIO_AUTH_TOKEN"] = os.environ.get("TWILIO_AUTH_TOKEN")
    app.config["TWILIO_FROM_NUMBER"] = os.environ.get("TWILIO_FROM_NUMBER")
    app.config["DATABASE_PATH"] = os.environ.get("DATABASE_PATH", "./trip.db")
    app.config["UPLOAD_DIR"] = os.environ.get("UPLOAD_DIR", "./uploads")
    app.config["ADMIN_PATH"] = os.environ.get("ADMIN_PATH", "hq-8271")

    db_module.register(app)
    db_module.init_db(app)

    app.register_blueprint(sms_bp)
    app.register_blueprint(api_bp)
    register_admin_routes(app)

    from flask import send_from_directory

    @app.route("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.route("/uploads/<path:filename>")
    def uploaded_file(filename):
        return send_from_directory(os.path.abspath(app.config["UPLOAD_DIR"]), filename)

    return app
