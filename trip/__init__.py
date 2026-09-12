import os

from flask import Flask

from . import db as db_module
from .routes_admin import register_admin_routes
from .routes_api import bp as api_bp
from .routes_sms import bp as sms_bp


def create_app():
    app = Flask(
        __name__,
        static_folder="../static",
        static_url_path="",
        template_folder="../templates",
    )

    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or os.urandom(32)
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
