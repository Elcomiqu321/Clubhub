DROP TABLE IF EXISTS rsvps;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sport TEXT,
    color TEXT NOT NULL DEFAULT '#1e88e5',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A user can belong to many teams (multiple rosters), with one role per team.
CREATE TABLE team_members (
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'player',   -- player | coach | staff
    position TEXT,
    jersey_number TEXT,
    PRIMARY KEY (team_id, user_id)
);

-- team_id NULL means a club-wide event, visible to everyone.
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,               -- sport | social
    kind TEXT,                            -- match | training | tournament | party | meeting | other
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    starts_at TEXT NOT NULL,              -- 'YYYY-MM-DDTHH:MM'
    ends_at TEXT,
    location TEXT,
    opponent TEXT,
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE rsvps (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL,                 -- yes | no | maybe
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (event_id, user_id)
);

CREATE INDEX idx_events_start ON events(starts_at);
