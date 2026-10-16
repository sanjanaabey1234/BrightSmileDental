// SQLite storage using Node's built-in driver (node:sqlite) - no native build step needed.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(process.env.DB_PATH || path.join(dataDir, 'dental.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS sessions (
    id            TEXT PRIMARY KEY,
    ref_code      TEXT UNIQUE NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL,
    completed_at  TEXT,
    status        TEXT NOT NULL DEFAULT 'in_progress',   -- in_progress | completed
    name          TEXT,
    contact       TEXT,
    for_whom      TEXT,
    age_group     TEXT,
    main_concern  TEXT,
    ohat_total    INTEGER,
    triage_level  TEXT,                                   -- healthy | attention | urgent | emergency
    top_condition TEXT,
    result_json   TEXT,
    summary       TEXT,
    summary_source TEXT,
    staff_status  TEXT NOT NULL DEFAULT 'new',            -- new | contacted | booked | resolved
    staff_notes   TEXT NOT NULL DEFAULT '',
    user_agent    TEXT
  );

  CREATE TABLE IF NOT EXISTS answers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    question_id   TEXT NOT NULL,
    section       TEXT NOT NULL,
    question_text TEXT NOT NULL,
    value_json    TEXT NOT NULL,
    label         TEXT NOT NULL,
    score         INTEGER,
    created_at    TEXT NOT NULL,
    UNIQUE (session_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sender      TEXT NOT NULL,          -- bot | user | staff | ai
    text        TEXT NOT NULL,
    meta_json   TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id     TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    name           TEXT NOT NULL,
    contact        TEXT NOT NULL,
    preferred_date TEXT,
    preferred_time TEXT,
    notes          TEXT,
    status         TEXT NOT NULL DEFAULT 'requested',  -- requested | confirmed | cancelled | done
    created_at     TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_answers_session  ON answers(session_id);
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
  CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);
`);

export const now = () => new Date().toISOString();

// Wraps a function in a transaction.
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// node:sqlite returns null-prototype objects; normalise to plain objects.
export const plain = (row) => (row ? { ...row } : row);
export const plainAll = (rows) => rows.map((r) => ({ ...r }));
