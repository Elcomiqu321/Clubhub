"""SQLite helpers (standard library only, no ORM)."""
import os
import sqlite3

from flask import current_app, g


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def query(sql, args=(), one=False):
    cur = get_db().execute(sql, args)
    rows = cur.fetchall()
    cur.close()
    return (rows[0] if rows else None) if one else rows


def execute(sql, args=()):
    conn = get_db()
    cur = conn.execute(sql, args)
    conn.commit()
    return cur.lastrowid


def init_db(reset=False):
    """Create the tables. With reset=True existing data is wiped."""
    conn = get_db()
    exists = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).fetchone()
    if exists and not reset:
        return
    with current_app.open_resource("schema.sql") as f:
        conn.executescript(f.read().decode("utf8"))
    conn.commit()


def init_app(app):
    app.teardown_appcontext(close_db)
    # Create the database automatically the first time the app starts.
    with app.app_context():
        init_db()

    @app.cli.command("init-db")
    def init_db_command():
        """Wipe and recreate the database."""
        init_db(reset=True)
        print("Database initialised.")

    @app.cli.command("seed")
    def seed_command():
        """Wipe the database and load demo data."""
        from .seed import seed_demo_data
        init_db(reset=True)
        seed_demo_data()
        print("Demo data loaded. Log in with admin@clubhub.local / demo1234")
