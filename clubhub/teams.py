"""Teams and their rosters. A user can be on several teams."""
from flask import Blueprint, abort, flash, g, redirect, render_template, request, url_for

from .auth import admin_required, login_required
from .db import execute, query
from .events import EVENT_SELECT, attach_my_rsvp
from .permissions import can_manage_team

bp = Blueprint("teams", __name__, url_prefix="/teams")

ROLES = ("player", "coach", "staff")


def get_team_or_404(team_id):
    team = query("SELECT * FROM teams WHERE id = ?", (team_id,), one=True)
    if team is None:
        abort(404)
    return team


@bp.route("/")
@login_required
def index():
    teams = query(
        """SELECT t.*, COUNT(tm.user_id) AS members,
                  MAX(CASE WHEN tm.user_id = ? THEN tm.role END) AS my_role
           FROM teams t LEFT JOIN team_members tm ON tm.team_id = t.id
           GROUP BY t.id ORDER BY t.name""",
        (g.user["id"],),
    )
    return render_template("teams/index.html", teams=teams)


def _team_form_values():
    return (
        request.form.get("name", "").strip(),
        request.form.get("sport", "").strip(),
        request.form.get("color", "#1e88e5").strip() or "#1e88e5",
    )


@bp.route("/new", methods=("GET", "POST"))
@admin_required
def create():
    if request.method == "POST":
        name, sport, color = _team_form_values()
        if not name:
            flash("Team name is required.", "error")
        else:
            team_id = execute("INSERT INTO teams (name, sport, color) VALUES (?, ?, ?)",
                              (name, sport, color))
            flash("Team created.", "ok")
            return redirect(url_for("teams.detail", team_id=team_id))
    return render_template("teams/form.html", team=None)


@bp.route("/<int:team_id>")
@login_required
def detail(team_id):
    team = get_team_or_404(team_id)
    roster = query(
        """SELECT u.id, u.name, u.email, u.phone, tm.role, tm.position, tm.jersey_number
           FROM team_members tm JOIN users u ON u.id = tm.user_id
           WHERE tm.team_id = ?
           ORDER BY CASE tm.role WHEN 'coach' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END, u.name""",
        (team_id,),
    )
    others = query(
        """SELECT id, name, email FROM users
           WHERE id NOT IN (SELECT user_id FROM team_members WHERE team_id = ?)
           ORDER BY name""",
        (team_id,),
    )
    events = query(EVENT_SELECT + " WHERE e.team_id = ? AND e.starts_at >= date('now') "
                   "ORDER BY e.starts_at LIMIT 10", (team_id,))
    return render_template("teams/detail.html", team=team, roster=roster, others=others,
                           events=attach_my_rsvp(events), roles=ROLES,
                           can_manage=can_manage_team(team_id))


@bp.route("/<int:team_id>/edit", methods=("GET", "POST"))
@login_required
def edit(team_id):
    team = get_team_or_404(team_id)
    if not can_manage_team(team_id):
        abort(403)
    if request.method == "POST":
        name, sport, color = _team_form_values()
        if not name:
            flash("Team name is required.", "error")
        else:
            execute("UPDATE teams SET name = ?, sport = ?, color = ? WHERE id = ?",
                    (name, sport, color, team_id))
            flash("Team updated.", "ok")
            return redirect(url_for("teams.detail", team_id=team_id))
    return render_template("teams/form.html", team=team)


@bp.route("/<int:team_id>/delete", methods=("POST",))
@admin_required
def delete(team_id):
    get_team_or_404(team_id)
    execute("DELETE FROM teams WHERE id = ?", (team_id,))
    flash("Team deleted.", "ok")
    return redirect(url_for("teams.index"))


@bp.route("/<int:team_id>/members", methods=("POST",))
@login_required
def add_member(team_id):
    get_team_or_404(team_id)
    if not can_manage_team(team_id):
        abort(403)
    user_id = request.form.get("user_id", type=int)
    role = request.form.get("role", "player")
    if role not in ROLES:
        role = "player"
    if not user_id or not query("SELECT id FROM users WHERE id = ?", (user_id,), one=True):
        flash("Pick a member to add.", "error")
    else:
        execute(
            """INSERT OR REPLACE INTO team_members (team_id, user_id, role, position, jersey_number)
               VALUES (?, ?, ?, ?, ?)""",
            (team_id, user_id, role, request.form.get("position", "").strip(),
             request.form.get("jersey_number", "").strip()),
        )
        flash("Member added to the roster.", "ok")
    return redirect(url_for("teams.detail", team_id=team_id))


@bp.route("/<int:team_id>/members/<int:user_id>", methods=("POST",))
@login_required
def update_member(team_id, user_id):
    if not can_manage_team(team_id):
        abort(403)
    role = request.form.get("role", "player")
    if role not in ROLES:
        role = "player"
    execute(
        """UPDATE team_members SET role = ?, position = ?, jersey_number = ?
           WHERE team_id = ? AND user_id = ?""",
        (role, request.form.get("position", "").strip(),
         request.form.get("jersey_number", "").strip(), team_id, user_id),
    )
    flash("Member updated.", "ok")
    return redirect(url_for("teams.detail", team_id=team_id))


@bp.route("/<int:team_id>/members/<int:user_id>/remove", methods=("POST",))
@login_required
def remove_member(team_id, user_id):
    if not can_manage_team(team_id):
        abort(403)
    execute("DELETE FROM team_members WHERE team_id = ? AND user_id = ?", (team_id, user_id))
    flash("Member removed from the roster.", "ok")
    return redirect(url_for("teams.detail", team_id=team_id))
