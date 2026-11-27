"""Build data/clubhub.json (the GitHub Pages demo database) from the Flask demo seed.

Usage:  python tools/export_demo_json.py
All demo passwords are demo1234.
"""
import hashlib
import json
import os
import secrets
import sqlite3
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from clubhub import create_app  # noqa: E402
from clubhub.db import init_db  # noqa: E402
from clubhub.seed import seed_demo_data  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "clubhub.json")


def pw_hash(salt, password):
    # Must match hashPassword() in docs/app.js
    return hashlib.sha256((salt + ":" + password).encode()).hexdigest()


def main():
    tmp = tempfile.mkdtemp()
    app = create_app({"TESTING": True, "DATABASE": os.path.join(tmp, "x.sqlite")})
    with app.app_context():
        init_db(reset=True)
        seed_demo_data()
    conn = sqlite3.connect(os.path.join(tmp, "x.sqlite"))
    conn.row_factory = sqlite3.Row
    rows = lambda sql: [dict(r) for r in conn.execute(sql)]  # noqa: E731

    users = []
    for u in rows("SELECT * FROM users ORDER BY id"):
        salt = secrets.token_hex(8)
        users.append({"id": u["id"], "name": u["name"], "email": u["email"], "phone": u["phone"],
                      "salt": salt, "pw": pw_hash(salt, "demo1234"),
                      "is_admin": bool(u["is_admin"]), "created_at": u["created_at"][:10]})
    data = {
        "version": 1,
        "users": users,
        "teams": rows("SELECT id, name, sport, color FROM teams ORDER BY id"),
        "members": rows("SELECT team_id, user_id, role, position, jersey_number FROM team_members"),
        "events": rows("SELECT id, title, category, kind, team_id, starts_at, ends_at, location, "
                       "opponent, description, created_by FROM events ORDER BY starts_at"),
        "rsvps": rows("SELECT event_id, user_id, status FROM rsvps"),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    print("Wrote", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
