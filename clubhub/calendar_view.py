"""Shared club calendar: a month grid plus an agenda list of the same month."""
import calendar
from datetime import date, timedelta

from flask import Blueprint, g, render_template, request

from .auth import login_required
from .db import query
from .events import EVENT_SELECT, attach_my_rsvp

bp = Blueprint("calendar", __name__, url_prefix="/calendar")


@bp.route("/")
@login_required
def month():
    today = date.today()
    try:
        year, mon = map(int, request.args.get("month", "").split("-"))
        first = date(year, mon, 1)
    except ValueError:
        first = today.replace(day=1)
    team_id = request.args.get("team", type=int)
    category = request.args.get("category", "")
    mine = request.args.get("mine") == "1"

    weeks = calendar.Calendar(firstweekday=0).monthdatescalendar(first.year, first.month)
    start, end = weeks[0][0], weeks[-1][-1]

    sql = EVENT_SELECT + " WHERE date(e.starts_at) BETWEEN ? AND ?"
    args = [start.isoformat(), end.isoformat()]
    if team_id:
        sql += " AND e.team_id = ?"
        args.append(team_id)
    if category in ("sport", "social"):
        sql += " AND e.category = ?"
        args.append(category)
    if mine:
        sql += (" AND (e.team_id IS NULL OR e.team_id IN "
                "(SELECT team_id FROM team_members WHERE user_id = ?))")
        args.append(g.user["id"])
    events = attach_my_rsvp(query(sql + " ORDER BY e.starts_at", args))

    by_day = {}
    for e in events:
        by_day.setdefault(e["starts_at"][:10], []).append(e)

    prev_month = (first.replace(day=1) - timedelta(days=1)).replace(day=1)
    next_month = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    month_events = [e for e in events if e["starts_at"][:7] == first.strftime("%Y-%m")]

    return render_template(
        "calendar.html", weeks=weeks, first=first, today=today, by_day=by_day,
        month_events=month_events, prev_month=prev_month, next_month=next_month,
        teams=query("SELECT id, name, color FROM teams ORDER BY name"),
        team_id=team_id, category=category, mine=mine,
        weekday_names=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    )
