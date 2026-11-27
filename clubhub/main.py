"""Home dashboard."""
from datetime import datetime

from flask import Blueprint, g, render_template

from .auth import login_required
from .db import query
from .events import EVENT_SELECT, attach_my_rsvp

bp = Blueprint("main", __name__)


@bp.route("/")
@login_required
def home():
    now = datetime.now().strftime("%Y-%m-%dT%H:%M")
    # Upcoming events of my teams plus club-wide events.
    events = query(
        EVENT_SELECT + """
        WHERE e.starts_at >= ?
          AND (e.team_id IS NULL OR e.team_id IN
               (SELECT team_id FROM team_members WHERE user_id = ?))
        ORDER BY e.starts_at LIMIT 10""",
        (now[:10], g.user["id"]),
    )
    my_teams = query(
        """SELECT t.*, tm.role FROM teams t JOIN team_members tm ON tm.team_id = t.id
           WHERE tm.user_id = ? ORDER BY t.name""",
        (g.user["id"],),
    )
    return render_template("home.html", events=attach_my_rsvp(events), my_teams=my_teams)


@bp.route("/offline")
def offline():
    return render_template("offline.html")
