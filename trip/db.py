import sqlite3
from datetime import datetime, timezone

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS pins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pin_id INTEGER NOT NULL REFERENCES pins(id),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pin_id INTEGER NOT NULL REFERENCES pins(id),
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    caption TEXT
);

CREATE TABLE IF NOT EXISTS planned_stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    note TEXT,
    hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pin_id INTEGER NOT NULL REFERENCES pins(id),
    author_name TEXT NOT NULL,
    author_color TEXT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'visible'
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE_PATH"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def _add_column(db, table, column, decl):
    """CREATE TABLE IF NOT EXISTS skips tables that already exist, so new
    columns need an explicit ALTER against the live database."""
    existing = {row["name"] for row in db.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def init_db(app):
    with app.app_context():
        db = get_db()
        db.executescript(SCHEMA)
        _add_column(db, "photos", "caption", "TEXT")
        _add_column(db, "comments", "author_color", "TEXT")
        _add_column(db, "planned_stops", "hidden", "INTEGER NOT NULL DEFAULT 0")
        _add_column(db, "pins", "hidden", "INTEGER NOT NULL DEFAULT 0")
        db.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('comments_enabled', 'true')"
        )
        db.commit()


def register(app):
    app.teardown_appcontext(close_db)
