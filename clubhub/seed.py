"""Demo data so the app is not empty on first run. All passwords: demo1234"""
import random
from datetime import date, datetime, timedelta

from werkzeug.security import generate_password_hash

from .db import execute


def seed_demo_data():
    pw = generate_password_hash("demo1234")
    people = [
        ("Club Admin", "admin@clubhub.local", 1),
        ("Claire Coach", "coach@clubhub.local", 0),
        ("Paul Player", "player@clubhub.local", 0),
        ("Sam Martin", "sam@clubhub.local", 0),
        ("Lea Dubois", "lea@clubhub.local", 0),
        ("Hugo Bernard", "hugo@clubhub.local", 0),
        ("Nina Petit", "nina@clubhub.local", 0),
        ("Tom Leroy", "tom@clubhub.local", 0),
        ("Emma Roux", "emma@clubhub.local", 0),
        ("Yanis Moreau", "yanis@clubhub.local", 0),
    ]
    ids = {}
    for name, email, admin in people:
        ids[email.split("@")[0]] = execute(
            "INSERT INTO users (name, email, phone, password_hash, is_admin) VALUES (?, ?, ?, ?, ?)",
            (name, email, "06 00 00 00 00", pw, admin))

    seniors = execute("INSERT INTO teams (name, sport, color) VALUES (?, ?, ?)",
                      ("Seniors A", "Football", "#1e88e5"))
    u13 = execute("INSERT INTO teams (name, sport, color) VALUES (?, ?, ?)",
                  ("U13", "Football", "#43a047"))
    women = execute("INSERT INTO teams (name, sport, color) VALUES (?, ?, ?)",
                    ("Women Basket", "Basketball", "#e53935"))

    roster = [
        (seniors, "coach", "coach", None, None),
        (seniors, "player", "player", "Striker", "9"),
        (seniors, "sam", "player", "Goalkeeper", "1"),
        (seniors, "hugo", "player", "Defender", "4"),
        (seniors, "tom", "player", "Midfielder", "8"),
        (seniors, "yanis", "player", "Winger", "11"),
        (u13, "coach", "coach", None, None),
        (u13, "hugo", "staff", "Assistant", None),
        (u13, "player", "player", "Midfielder", "10"),  # same person on two rosters
        (women, "lea", "coach", None, None),
        (women, "nina", "player", "Guard", "5"),
        (women, "emma", "player", "Center", "15"),
    ]
    for team, who, role, position, number in roster:
        execute("INSERT INTO team_members (team_id, user_id, role, position, jersey_number) "
                "VALUES (?, ?, ?, ?, ?)", (team, ids[who], role, position, number))

    today = date.today()
    monday = today - timedelta(days=today.weekday())

    def at(day, hour, minute=0):
        return datetime(day.year, day.month, day.day, hour, minute).strftime("%Y-%m-%dT%H:%M")

    events = []
    for week in range(-1, 6):
        base = monday + timedelta(weeks=week)
        tue, wed, thu, sat, sun = (base + timedelta(days=d) for d in (1, 2, 3, 5, 6))
        events += [
            ("Training", "sport", "training", seniors, at(tue, 19), at(tue, 21), "Main pitch", None),
            ("Training", "sport", "training", seniors, at(thu, 19), at(thu, 21), "Main pitch", None),
            ("Training", "sport", "training", u13, at(wed, 14), at(wed, 16), "Pitch 2", None),
            ("Practice", "sport", "training", women, at(thu, 20), at(thu, 22), "Gym", None),
            ("League match", "sport", "match", seniors, at(sun, 15), at(sun, 17), "Away",
             random.choice(["FC Rivers", "AS Hills", "US Valley"])),
            ("Youth match", "sport", "match", u13, at(sat, 10), at(sat, 12), "Home",
             random.choice(["Junior Stars", "Little Lions"])),
        ]
    first_sat = monday + timedelta(days=12)
    events += [
        ("Club barbecue", "social", "party", None, at(first_sat, 19), at(first_sat, 23),
         "Clubhouse", None),
        ("General assembly", "social", "meeting", None, at(monday + timedelta(days=17), 20),
         at(monday + timedelta(days=17), 22), "Clubhouse", None),
        ("Team dinner", "social", "meal", women, at(monday + timedelta(days=9), 20), None,
         "Pizzeria Roma", None),
        ("Spring tournament", "sport", "tournament", u13, at(monday + timedelta(days=26), 9),
         at(monday + timedelta(days=26), 17), "City stadium", None),
    ]
    rnd = random.Random(42)
    members = {seniors: ["coach", "player", "sam", "hugo", "tom", "yanis"],
               u13: ["coach", "hugo", "player"], women: ["lea", "nina", "emma"],
               None: list(ids)}
    for title, cat, kind, team, start, end, loc, opp in events:
        eid = execute(
            """INSERT INTO events (title, category, kind, team_id, starts_at, ends_at, location,
                                   opponent, description, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (title, cat, kind, team, start, end, loc, opp, "", ids["admin"]))
        for who in members[team]:
            status = rnd.choice(["yes", "yes", "maybe", "no", None])
            if status:
                execute("INSERT INTO rsvps (event_id, user_id, status) VALUES (?, ?, ?)",
                        (eid, ids[who], status))
