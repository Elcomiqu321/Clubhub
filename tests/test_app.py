"""Smoke tests. Run with:  python -m pytest"""
import re

import pytest

from clubhub import create_app
from clubhub.db import init_db, query
from clubhub.seed import seed_demo_data


@pytest.fixture
def app(tmp_path):
    app = create_app({"TESTING": True, "DATABASE": str(tmp_path / "test.sqlite")})
    with app.app_context():
        init_db(reset=True)
        seed_demo_data()
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def csrf(client, url):
    html = client.get(url).get_data(as_text=True)
    return re.search(r'name="_csrf" value="([^"]+)"', html).group(1)


def login(client, email="admin@clubhub.local", pw="demo1234"):
    token = csrf(client, "/auth/login")
    return client.post("/auth/login", data={"email": email, "password": pw, "_csrf": token})


def test_login_required(client):
    assert client.get("/").status_code == 302


def test_post_without_csrf_rejected(client):
    assert client.post("/auth/login", data={"email": "x", "password": "y"}).status_code == 400


def test_register_first_user_is_admin(tmp_path):
    app = create_app({"TESTING": True, "DATABASE": str(tmp_path / "empty.sqlite")})
    c = app.test_client()
    token = csrf(c, "/auth/register")
    c.post("/auth/register", data={"name": "A B", "email": "a@b.c", "password": "secret1", "_csrf": token})
    with app.app_context():
        assert query("SELECT is_admin FROM users WHERE email='a@b.c'", one=True)["is_admin"] == 1


def test_pages_render(client):
    login(client)
    for url in ["/", "/calendar/", "/calendar/?month=2026-02", "/events/", "/events/?past=1",
                "/teams/", "/teams/1", "/members/", "/members/1", "/members/me",
                "/events/new", "/events/1", "/teams/new", "/members/new", "/offline"]:
        assert client.get(url).status_code == 200, url
    assert client.get("/sw.js").status_code == 200
    assert client.get("/manifest.webmanifest").status_code == 200


def test_create_event_with_repeat_and_rsvp(client, app):
    login(client)
    token = csrf(client, "/events/new")
    r = client.post("/events/new", data={
        "_csrf": token, "title": "Extra training", "category": "sport", "kind": "training",
        "team_id": "1", "starts_at": "2030-01-07T19:00", "ends_at": "2030-01-07T21:00",
        "repeat_weeks": "3"})
    assert r.status_code == 302
    with app.app_context():
        rows = query("SELECT id FROM events WHERE title='Extra training'")
        assert len(rows) == 4
        eid = rows[0]["id"]
    client.post(f"/events/{eid}/rsvp", data={"_csrf": token, "status": "yes"})
    with app.app_context():
        assert query("SELECT status FROM rsvps WHERE event_id=? AND user_id=1", (eid,), one=True)["status"] == "yes"


def test_roster_add_remove(client, app):
    login(client)
    token = csrf(client, "/teams/3")
    client.post("/teams/3/members", data={"_csrf": token, "user_id": "3", "role": "player"})
    with app.app_context():
        assert query("SELECT 1 FROM team_members WHERE team_id=3 AND user_id=3", one=True)
    client.post("/teams/3/members/3/remove", data={"_csrf": token})
    with app.app_context():
        assert not query("SELECT 1 FROM team_members WHERE team_id=3 AND user_id=3", one=True)


def test_player_cannot_manage(client):
    login(client, "player@clubhub.local")
    token = csrf(client, "/")
    assert client.post("/teams/1/members/2/remove", data={"_csrf": token}).status_code == 403
    assert client.get("/events/1/edit").status_code == 403
