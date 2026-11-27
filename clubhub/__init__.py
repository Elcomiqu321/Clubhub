"""Clubhub: a small club and team management app (SportEasy-style prototype).

Each feature lives in its own blueprint module so new tools (chat, stats,
payments...) can be added later as new modules registered in create_app().
"""
import os
import secrets

from flask import Flask, abort, request, send_from_directory, session

from . import db


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("CLUBHUB_SECRET_KEY", "dev-change-me"),
        DATABASE=os.path.join(app.instance_path, "clubhub.sqlite"),
    )
    if test_config:
        app.config.update(test_config)
    os.makedirs(app.instance_path, exist_ok=True)

    db.init_app(app)

    from . import auth, calendar_view, events, main, teams, users

    for module in (auth, main, teams, events, calendar_view, users):
        app.register_blueprint(module.bp)

    # --- Simple CSRF protection for every POST form -------------------------
    def csrf_token():
        if "_csrf" not in session:
            session["_csrf"] = secrets.token_hex(16)
        return session["_csrf"]

    app.jinja_env.globals["csrf_token"] = csrf_token

    @app.before_request
    def check_csrf():
        if request.method == "POST" and not app.config.get("TESTING_NO_CSRF"):
            sent = request.form.get("_csrf")
            if not sent or sent != session.get("_csrf"):
                abort(400, "Invalid form token, please reload the page and try again.")

    # --- PWA files must be served from the site root -------------------------
    @app.route("/sw.js")
    def service_worker():
        resp = send_from_directory(app.static_folder, "js/sw.js", mimetype="application/javascript")
        resp.headers["Service-Worker-Allowed"] = "/"
        resp.headers["Cache-Control"] = "no-cache"
        return resp

    @app.route("/manifest.webmanifest")
    def manifest():
        return send_from_directory(app.static_folder, "manifest.webmanifest",
                                   mimetype="application/manifest+json")

    return app
