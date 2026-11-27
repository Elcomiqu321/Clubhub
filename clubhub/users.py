"""User management: club directory, profiles, and admin tools."""
import secrets

from flask import Blueprint, abort, flash, g, redirect, render_template, request, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from .auth import admin_required, login_required
from .db import execute, query

bp = Blueprint("users", __name__, url_prefix="/members")


@bp.route("/")
@login_required
def index():
    users = query(
        """SELECT u.id, u.name, u.email, u.phone, u.is_admin,
                  GROUP_CONCAT(t.name, ', ') AS teams
           FROM users u
           LEFT JOIN team_members tm ON tm.user_id = u.id
           LEFT JOIN teams t ON t.id = tm.team_id
           GROUP BY u.id ORDER BY u.name""")
    return render_template("users/index.html", users=users)


@bp.route("/<int:user_id>")
@login_required
def profile(user_id):
    user = query("SELECT * FROM users WHERE id = ?", (user_id,), one=True)
    if user is None:
        abort(404)
    teams = query(
        """SELECT t.id, t.name, t.color, tm.role, tm.position, tm.jersey_number
           FROM team_members tm JOIN teams t ON t.id = tm.team_id
           WHERE tm.user_id = ? ORDER BY t.name""", (user_id,))
    return render_template("users/profile.html", member=user, teams=teams)


@bp.route("/me", methods=("GET", "POST"))
@login_required
def edit_me():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        phone = request.form.get("phone", "").strip()
        new_pw = request.form.get("new_password", "")
        if not name:
            flash("Name is required.", "error")
        elif new_pw and not check_password_hash(g.user["password_hash"],
                                                request.form.get("current_password", "")):
            flash("Current password is wrong.", "error")
        elif new_pw and len(new_pw) < 6:
            flash("New password must be at least 6 characters.", "error")
        else:
            execute("UPDATE users SET name = ?, phone = ? WHERE id = ?",
                    (name, phone, g.user["id"]))
            if new_pw:
                execute("UPDATE users SET password_hash = ? WHERE id = ?",
                        (generate_password_hash(new_pw), g.user["id"]))
            flash("Profile saved.", "ok")
            return redirect(url_for("users.profile", user_id=g.user["id"]))
    return render_template("users/edit_me.html")


@bp.route("/new", methods=("GET", "POST"))
@admin_required
def create():
    """Admins can add members directly (e.g. young players without their own email login)."""
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        phone = request.form.get("phone", "").strip()
        if not name or not email:
            flash("Name and email are required.", "error")
        elif query("SELECT id FROM users WHERE email = ?", (email,), one=True):
            flash("An account with this email already exists.", "error")
        else:
            temp_pw = secrets.token_urlsafe(6)
            user_id = execute(
                "INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)",
                (name, email, phone, generate_password_hash(temp_pw)))
            flash(f"Member created. Temporary password: {temp_pw} (share it with them).", "ok")
            return redirect(url_for("users.profile", user_id=user_id))
    return render_template("users/new.html")


@bp.route("/<int:user_id>/admin", methods=("POST",))
@admin_required
def toggle_admin(user_id):
    if user_id == g.user["id"]:
        flash("You cannot remove your own admin rights.", "error")
    else:
        execute("UPDATE users SET is_admin = 1 - is_admin WHERE id = ?", (user_id,))
        flash("Admin rights updated.", "ok")
    return redirect(url_for("users.profile", user_id=user_id))


@bp.route("/<int:user_id>/delete", methods=("POST",))
@admin_required
def delete(user_id):
    if user_id == g.user["id"]:
        flash("You cannot delete your own account here.", "error")
        return redirect(url_for("users.profile", user_id=user_id))
    execute("DELETE FROM users WHERE id = ?", (user_id,))
    flash("Member deleted.", "ok")
    return redirect(url_for("users.index"))
