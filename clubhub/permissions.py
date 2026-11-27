"""Who may do what. Keep every rule here so it is easy to change later."""
from flask import g

from .db import query


def is_admin():
    return bool(g.user and g.user["is_admin"])


def team_role(team_id, user_id=None):
    user_id = user_id or (g.user["id"] if g.user else None)
    if not user_id or not team_id:
        return None
    row = query("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?",
                (team_id, user_id), one=True)
    return row["role"] if row else None


def can_manage_team(team_id):
    """Admins and the team's coaches/staff can edit the roster and team events."""
    return is_admin() or team_role(team_id) in ("coach", "staff")


def manageable_team_ids():
    if is_admin():
        return [r["id"] for r in query("SELECT id FROM teams")]
    rows = query("SELECT team_id FROM team_members WHERE user_id = ? AND role IN ('coach','staff')",
                 (g.user["id"],))
    return [r["team_id"] for r in rows]


def can_create_events():
    return is_admin() or bool(manageable_team_ids())


def can_manage_event(event):
    if is_admin():
        return True
    if event["team_id"] is None:
        return g.user is not None and event["created_by"] == g.user["id"]
    return can_manage_team(event["team_id"])


def can_rsvp(event):
    if g.user is None:
        return False
    if event["team_id"] is None:
        return True
    return team_role(event["team_id"]) is not None or is_admin()
