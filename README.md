# Clubhub

Clubhub is a web app copy of the SportEasy team management app. It helps sports clubs organize
members, teams, events and a shared calendar in one place.

**Status: functional prototype.** The design is intentionally basic.

## What works today

- **User management**: register / log in / log out, profile editing, club member directory,
  admins can add members (with a temporary password), grant admin rights or delete members.
  The first account registered becomes the club admin.
- **Teams with rosters**: several teams per club, and one person can be on several teams with a
  role per team (player, coach, staff), position and jersey number.
- **Events**: sport events (match, training, tournament) and social events (party, meal, meeting,
  trip), for one team or for the whole club. Optional weekly repeat for trainings.
- **Availability (RSVP)**: each invited member answers In / Maybe / Out, and the event page shows
  who is coming.
- **Shared club calendar**: month grid of every team and club event, filters by team, by
  sport/social and "only mine", plus an agenda list.
- **Installable app (PWA)**: manifest, icons and a service worker. Mobile-first layout with a
  bottom navigation bar on phones.

## Run it on Windows

You need Python 3.10 or newer. In a command prompt, inside the project folder:

```
py -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python run.py --seed
```

Open http://127.0.0.1:5000 and log in with one of the demo accounts (password `demo1234`):

| Email | Role |
| --- | --- |
| admin@clubhub.local | club admin |
| coach@clubhub.local | coach of Seniors A and U13 |
| player@clubhub.local | player in Seniors A and U13 |

`--seed` wipes the database and reloads the demo data. Next time just run `python run.py`
(after `venv\Scripts\activate`). To start with an empty club, delete `instance\clubhub.sqlite`
and register: the first account becomes the admin.

Run the tests with `pip install pytest` then `python -m pytest`.

## Try it on your phone

1. Start the app so it is reachable on your Wi-Fi: `python run.py --host 0.0.0.0`
2. Find your PC's IP address with `ipconfig` (for example `192.168.1.20`).
3. On your phone, open `http://192.168.1.20:5000`. Allow Python through the Windows firewall if asked.

Browsers only allow installing a PWA from `https://` (or from `localhost`). So over plain Wi-Fi
the app works on the phone but the "Install" option may not appear. To test installing, either
deploy the app to a host with HTTPS, or use a tunnel such as `ngrok http 5000` and open the
https link it gives you. Then use "Install app" (Android / Chrome) or Share → "Add to Home Screen"
(iPhone / Safari).

## Online test version (GitHub Pages)

> ⚠️ **Testing only. Everything is public.** The online version keeps the whole club database in
> [`data/clubhub.json`](data/clubhub.json), a public file in this repo. Anyone can read every name,
> email and phone number in it, and logins are only checked in the browser. Don't put real
> personal information or real passwords in it. A proper backend will replace this later.

The `docs/` folder holds a browser-only copy of the app (same features, plain JavaScript) that
GitHub Pages can host for free. It reads `data/clubhub.json` from GitHub, and each change is
saved as a commit to that file through the GitHub API.

- **URL** (once Pages is turned on): https://elcomiqu321.github.io/Clubhub/
- **Viewing** works for anyone, with no setup.
- **Saving changes** needs a GitHub token on each device: in the app, open Settings and paste a
  fine-grained token limited to this repo with *Contents: Read and write*. The token stays in that
  browser only. Anyone who has it can change files in the repo, so share it only with testers you trust.
- Without a token, reads come from GitHub's file cache, which can be up to ~5 minutes behind.

To turn it on: merge this branch into `main`, then in the repo go to
Settings → Pages → Build and deployment → Source: *Deploy from a branch*, Branch: `main`, folder `/docs`.

To reset the online data to fresh demo data: `python tools/export_demo_json.py`, then commit
`data/clubhub.json`. To point the app at another repo or file, edit `docs/config.js`.

## Project layout

```
run.py                  start the server (python run.py [--seed] [--host 0.0.0.0])
clubhub/
  __init__.py           create_app(): registers each feature module, CSRF, PWA routes
  db.py, schema.sql     SQLite access (no ORM) and the tables
  permissions.py        who can do what (admin, coach/staff, player)
  auth.py               register, login, logout
  users.py              member directory, profiles, admin tools
  teams.py              teams and rosters
  events.py             sport/social events and RSVP
  calendar_view.py      shared club calendar
  seed.py               demo data
  templates/            Jinja HTML pages, one folder per feature
  static/               CSS, JS, service worker, manifest, icons
tests/                  pytest smoke tests
docs/                   GitHub Pages version (static HTML/JS, data in data/clubhub.json)
data/clubhub.json       online demo database (public!)
tools/                  helper scripts
```

To add a new tool later (chat, stats, payments...), create a new module with a Flask
`Blueprint`, add its templates folder, and register it in `create_app()`.

## Permissions (prototype rules)

- **Admin**: everything (create teams, club-wide events, manage members).
- **Coach / staff of a team**: edit that team, its roster and its events.
- **Player**: see everything in the club, answer RSVPs for their teams and club events.

## Not done yet

Email invitations and password reset, chat, notifications, match stats, payments, file sharing,
and calendar export (.ics). Change `CLUBHUB_SECRET_KEY` before deploying anywhere public.
