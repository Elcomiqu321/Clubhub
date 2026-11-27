"""Register, login, logout and the login_required decorator."""
import functools

from flask import Blueprint, flash, g, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from .db import execute, query

bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.before_app_request
def load_logged_in_user():
    user_id = session.get("user_id")
    g.user = query("SELECT * FROM users WHERE id = ?", (user_id,), one=True) if user_id else None


def login_required(view):
    @functools.wraps(view)
    def wrapped(**kwargs):
        if g.user is None:
            return redirect(url_for("auth.login", next=request.path))
        return view(**kwargs)
    return wrapped


def admin_required(view):
    @functools.wraps(view)
    @login_required
    def wrapped(**kwargs):
        if not g.user["is_admin"]:
            flash("Only club admins can do that.", "error")
            return redirect(url_for("main.home"))
        return view(**kwargs)
    return wrapped


@bp.route("/register", methods=("GET", "POST"))
def register():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        error = None
        if not name or not email or not password:
            error = "Name, email and password are required."
        elif len(password) < 6:
            error = "Password must be at least 6 characters."
        elif query("SELECT id FROM users WHERE email = ?", (email,), one=True):
            error = "An account with this email already exists."
        if error:
            flash(error, "error")
        else:
            # The very first account becomes the club admin.
            first = query("SELECT COUNT(*) AS n FROM users", one=True)["n"] == 0
            user_id = execute(
                "INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, ?)",
                (name, email, generate_password_hash(password), 1 if first else 0),
            )
            session.clear()
            session["user_id"] = user_id
            flash("Welcome to Clubhub!" + (" You are the club admin." if first else ""), "ok")
            return redirect(url_for("main.home"))
    return render_template("auth/register.html")


@bp.route("/login", methods=("GET", "POST"))
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        user = query("SELECT * FROM users WHERE email = ?", (email,), one=True)
        if user is None or not check_password_hash(user["password_hash"], password):
            flash("Wrong email or password.", "error")
        else:
            session.clear()
            session["user_id"] = user["id"]
            next_url = request.args.get("next", "")
            if not next_url.startswith("/") or next_url.startswith("//"):
                next_url = url_for("main.home")
            return redirect(next_url)
    return render_template("auth/login.html")


@bp.route("/logout", methods=("POST",))
def logout():
    session.clear()
    return redirect(url_for("auth.login"))
