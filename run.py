"""Start the Clubhub development server.

Usage (Windows command line):
    python run.py              start the app on http://127.0.0.1:5000
    python run.py --seed       reset the database with demo data, then start
    python run.py --host 0.0.0.0   make the app reachable from a phone on the same Wi-Fi
"""
import argparse

from clubhub import create_app
from clubhub.db import init_db
from clubhub.seed import seed_demo_data

parser = argparse.ArgumentParser(description="Run Clubhub")
parser.add_argument("--seed", action="store_true", help="reset the database and load demo data")
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=5000)
args = parser.parse_args()

app = create_app()

if args.seed:
    with app.app_context():
        init_db(reset=True)
        seed_demo_data()
    print("Database reset with demo data. Log in with admin@clubhub.local / demo1234")

app.run(host=args.host, port=args.port, debug=True)
