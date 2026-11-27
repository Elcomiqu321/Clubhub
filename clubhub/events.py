"""Sport and social events, with availability (RSVP) per member."""
from datetime import datetime, timedelta

from flask import Blueprint, abort, flash, g, redirect, render_template, request, url_for

from .auth import login_required
from .db import execute, query
from .permissions import (can_create_events, can_manage_event, can_rsvp, is_admin,
                          manageable_team_ids)

bp = Blueprint("events", __name__, url_prefix="/events")

CATEGORIES = ("sport", "social")
KINDS = {
    "sport": ("match", "training", "tournament", "other"),
    "social": ("party", "meal", "meeting", "trip", "other"),
}
RSVP_STATUSES = ("yes", "maybe", "no")

# Shared SELECT used by the dashboard, team pages, lists and the calendar.
EVENT_SELECT = """
SELECT e.*, t.name AS team_name, t.color AS team_color,
       (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'yes') AS n_yes,
       (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'maybe') AS n_maybe,
       (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'no') AS n_no
FROM events e LEFT JOIN teams t ON t.id = e.team_id
"""


def attach_my_rsvp(events):
    """Return events as dicts with the current user's RSVP and permissions added."""
    if not events:
        return []
    ids = [e["id"] for e in events]
    marks = ",".join("?" * len(ids))
    mine = {r["event_id"]: r["status"] for r in query(
        f"SELECT event_id, status FROM rsvps WHERE user_id = ? AND event_id IN ({marks})",
        [g.user["id"], *ids])}
    out = []
    for e in events:
        d = dict(e)
        d["my_rsvp"] = mine.get(e["id"])
        d["can_rsvp"] = can_rsvp(e)
        d["can_manage"] = can_manage_event(e)
        out.append(d)
    return out


def get_event_or_404(event_id):
    event = query(EVENT_SELECT + " WHERE e.id = ?", (event_id,), one=True)
    if event is None:
        abort(404)
    return event


def _allowed_team_choices():
    ids = manageable_team_ids()
    if not ids:
        return []
    marks = ",".join("?" * len(ids))
    return query(f"SELECT id, name FROM teams WHERE id IN ({marks}) ORDER BY name", ids)


def _read_form():
    f = request.form
    data = {
        "title": f.get("title", "").strip(),
        "category": f.get("category", "sport"),
        "kind": f.get("kind", "other"),
        "team_id": f.get("team_id", type=int) or None,
        "starts_at": f.get("starts_at", "").strip(),
        "ends_at": f.get("ends_at", "").strip() or None,
        "location": f.get("location", "").strip(),
        "opponent": f.get("opponent", "").strip(),
        "description": f.get("description", "").strip(),
    }
    errors = []
    if not data["title"]:
        errors.append("Title is required.")
    if data["category"] not in CATEGORIES:
        errors.append("Pick sport or social.")
    elif data["kind"] not in KINDS[data["category"]]:
        data["kind"] = "other"
    try:
        start = datetime.strptime(data["starts_at"], "%Y-%m-%dT%H:%M")
    except ValueError:
        errors.append("Start date and time are required.")
        start = None
    if data["ends_at"]:
        try:
            end = datetime.strptime(data["ends_at"], "%Y-%m-%dT%H:%M")
            if start and end < start:
                errors.append("The end must be after the start.")
        except ValueError:
            errors.append("End date is not valid.")
    if data["team_id"] is None and not is_admin():
        errors.append("Only club admins can create club-wide events. Pick a team.")
    if data["team_id"] is not None and data["team_id"] not in manageable_team_ids():
        errors.append("You cannot create events for this team.")
    return data, errors


@bp.route("/")
@login_required
def index():
    category = request.args.get("category", "")
    team_id = request.args.get("team", type=int)
    show_past = request.args.get("past") == "1"
    sql = EVENT_SELECT + " WHERE 1=1"
    args = []
    if category in CATEGORIES:
        sql += " AND e.category = ?"
        args.append(category)
    if team_id:
        sql += " AND e.team_id = ?"
        args.append(team_id)
    if show_past:
        sql += " AND e.starts_at < date('now') ORDER BY e.starts_at DESC"
    else:
        sql += " AND e.starts_at >= date('now') ORDER BY e.starts_at"
    events = attach_my_rsvp(query(sql + " LIMIT 200", args))
    teams = query("SELECT id, name FROM teams ORDER BY name")
    return render_template("events/index.html", events=events, teams=teams,
                           category=category, team_id=team_id, show_past=show_past,
                           can_create=can_create_events())


@bp.route("/new", methods=("GET", "POST"))
@login_required
def create():
    if not can_create_events():
        flash("Only admins and coaches can create events.", "error")
        return redirect(url_for("events.index"))
    if request.method == "POST":
        data, errors = _read_form()
        repeat = max(0, min(request.form.get("repeat_weeks", 0, type=int) or 0, 52))
        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("events/form.html", event=data, teams=_allowed_team_choices(),
                                   kinds=KINDS, is_admin=is_admin())
        start = datetime.strptime(data["starts_at"], "%Y-%m-%dT%H:%M")
        end = datetime.strptime(data["ends_at"], "%Y-%m-%dT%H:%M") if data["ends_at"] else None
        first_id = None
        for week in range(repeat + 1):  # optional weekly repeat, e.g. trainings
            delta = timedelta(weeks=week)
            new_id = execute(
                """INSERT INTO events (title, category, kind, team_id, starts_at, ends_at,
                                       location, opponent, description, created_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (data["title"], data["category"], data["kind"], data["team_id"],
                 (start + delta).strftime("%Y-%m-%dT%H:%M"),
                 (end + delta).strftime("%Y-%m-%dT%H:%M") if end else None,
                 data["location"], data["opponent"], data["description"], g.user["id"]),
            )
            first_id = first_id or new_id
        flash("Event created." if not repeat else f"{repeat + 1} events created.", "ok")
        return redirect(url_for("events.detail", event_id=first_id))
    prefill = {"category": request.args.get("category", "sport"),
               "team_id": request.args.get("team", type=int)}
    if request.args.get("date"):
        prefill["starts_at"] = request.args["date"] + "T18:00"
    return render_template("events/form.html", event=prefill, teams=_allowed_team_choices(),
                           kinds=KINDS, is_admin=is_admin())


@bp.route("/<int:event_id>")
@login_required
def detail(event_id):
    event = attach_my_rsvp([get_event_or_404(event_id)])[0]
    # Invited people: the team roster, or every member for club-wide events.
    if event["team_id"]:
        invited = query(
            """SELECT u.id, u.name, tm.role, r.status FROM team_members tm
               JOIN users u ON u.id = tm.user_id
               LEFT JOIN rsvps r ON r.user_id = u.id AND r.event_id = ?
               WHERE tm.team_id = ? ORDER BY u.name""", (event_id, event["team_id"]))
    else:
        invited = query(
            """SELECT u.id, u.name, NULL AS role, r.status FROM users u
               LEFT JOIN rsvps r ON r.user_id = u.id AND r.event_id = ?
               ORDER BY u.name""", (event_id,))
    groups = {"yes": [], "maybe": [], "no": [], None: []}
    for person in invited:
        groups.get(person["status"], groups[None]).append(person)
    return render_template("events/detail.html", event=event, groups=groups)


@bp.route("/<int:event_id>/edit", methods=("GET", "POST"))
@login_required
def edit(event_id):
    event = get_event_or_404(event_id)
    if not can_manage_event(event):
        abort(403)
    if request.method == "POST":
        data, errors = _read_form()
        if errors:
            for e in errors:
                flash(e, "error")
            data["id"] = event_id
            return render_template("events/form.html", event=data, teams=_allowed_team_choices(),
                                   kinds=KINDS, is_admin=is_admin())
        execute(
            """UPDATE events SET title=?, category=?, kind=?, team_id=?, starts_at=?, ends_at=?,
                                 location=?, opponent=?, description=? WHERE id=?""",
            (data["title"], data["category"], data["kind"], data["team_id"], data["starts_at"],
             data["ends_at"], data["location"], data["opponent"], data["description"], event_id),
        )
        flash("Event updated.", "ok")
        return redirect(url_for("events.detail", event_id=event_id))
    return render_template("events/form.html", event=dict(event), teams=_allowed_team_choices(),
                           kinds=KINDS, is_admin=is_admin())


@bp.route("/<int:event_id>/delete", methods=("POST",))
@login_required
def delete(event_id):
    event = get_event_or_404(event_id)
    if not can_manage_event(event):
        abort(403)
    execute("DELETE FROM events WHERE id = ?", (event_id,))
    flash("Event deleted.", "ok")
    return redirect(url_for("events.index"))


@bp.route("/<int:event_id>/rsvp", methods=("POST",))
@login_required
def rsvp(event_id):
    event = get_event_or_404(event_id)
    status = request.form.get("status")
    if not can_rsvp(event):
        flash("Only members of this team can answer.", "error")
    elif status == "clear":
        execute("DELETE FROM rsvps WHERE event_id = ? AND user_id = ?", (event_id, g.user["id"]))
    elif status in RSVP_STATUSES:
        execute(
            """INSERT INTO rsvps (event_id, user_id, status, updated_at)
               VALUES (?, ?, ?, datetime('now'))
               ON CONFLICT(event_id, user_id) DO UPDATE SET status = excluded.status,
                                                            updated_at = excluded.updated_at""",
            (event_id, g.user["id"], status),
        )
    next_url = request.form.get("next", "")
    if not next_url.startswith("/") or next_url.startswith("//"):
        next_url = url_for("events.detail", event_id=event_id)
    return redirect(next_url)
