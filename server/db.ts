import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from './config.ts'

mkdirSync(dirname(config.dbPath), { recursive: true })
export const db = new DatabaseSync(config.dbPath)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient','family')),
  lang TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  discoverable INTEGER NOT NULL DEFAULT 0,
  show_presence INTEGER NOT NULL DEFAULT 1,
  fhir_patient_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_by INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS circle_links (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (patient_id, member_id)
);
CREATE TABLE IF NOT EXISTS routine_tasks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('morning','afternoon','night')),
  key TEXT,
  title TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'star',
  sort INTEGER NOT NULL DEFAULT 0,
  days TEXT NOT NULL DEFAULT '0123456',
  time TEXT,
  is_medication INTEGER NOT NULL DEFAULT 0,
  remind INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS task_completions (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES routine_tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  UNIQUE (task_id, local_date)
);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom',
  source TEXT NOT NULL DEFAULT 'user',
  task_id INTEGER REFERENCES routine_tasks(id) ON DELETE CASCADE,
  date TEXT,
  time TEXT NOT NULL,
  recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekdays','weekly')),
  days TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL,
  next_fire_at INTEGER,
  last_fired_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(active, next_fire_at);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_id INTEGER REFERENCES reminders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  done_at INTEGER
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref TEXT,
  local_date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities ON activities(user_id, local_date);
CREATE TABLE IF NOT EXISTS game_results (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  level INTEGER NOT NULL,
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  media_id TEXT REFERENCES media(id) ON DELETE CASCADE,
  url TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS song_days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, local_date)
);
CREATE TABLE IF NOT EXISTS song_notes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, recipient_id, created_at);
CREATE TABLE IF NOT EXISTS companion_messages (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  reminder_id INTEGER REFERENCES reminders(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('photo','audio','video','note')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  happened_on TEXT,
  place TEXT NOT NULL DEFAULT '',
  people TEXT NOT NULL DEFAULT '',
  media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS memory_answers (
  id INTEGER PRIMARY KEY,
  memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  lang TEXT NOT NULL,
  scenes TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_messages (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scenario_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'natural',
  lang TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','safety','evaluated')),
  state TEXT NOT NULL,
  evaluation TEXT,
  score INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scenario_sessions_user ON scenario_sessions(user_id, scenario_id);

-- ===== Caretaker ↔ patient remembrance system =====
-- Extra profile for a patient. "managed" = created by a caretaker (the patient signs in on their device with a pairing code).
CREATE TABLE IF NOT EXISTS patient_profiles (
  patient_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  managed INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  photo_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
-- One-time codes that sign a patient's own device in (hash only, short expiry).
CREATE TABLE IF NOT EXISTS pair_codes (
  code_hash TEXT PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
-- People who matter to the patient ("avatars"). Phone numbers are encrypted at rest and never sent to the patient app.
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT '',
  avatar_item_id INTEGER,
  phone_enc TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS people_patient ON people(patient_id);
-- Photos and audio attached to a person. Real items point to private media; demo items point to bundled, licence-free illustrations.
CREATE TABLE IF NOT EXISTS person_items (
  id INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo','audio')),
  media_id TEXT REFERENCES media(id) ON DELETE CASCADE,
  demo_asset TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  CHECK (media_id IS NOT NULL OR demo_asset IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS person_items_person ON person_items(person_id);
-- Evidence: every memory keeps its source.
CREATE TABLE IF NOT EXISTS person_memories (
  id INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'memory' CHECK (type IN ('memory','fun_moment','place','event','together','first_met','importance','timeline')),
  content TEXT NOT NULL,
  related_item_id INTEGER REFERENCES person_items(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'caretaker',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS person_memories_person ON person_memories(person_id);
CREATE TABLE IF NOT EXISTS remembrance_stories (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  structure TEXT NOT NULL,
  source_memory_ids TEXT NOT NULL,
  source_item_ids TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  generator TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS remembrance_sessions (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id INTEGER REFERENCES remembrance_stories(id) ON DELETE SET NULL,
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL,
  recognition TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  summary TEXT
);
CREATE INDEX IF NOT EXISTS remembrance_sessions_patient ON remembrance_sessions(patient_id, started_at);
CREATE TABLE IF NOT EXISTS remembrance_interactions (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES remembrance_sessions(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  response TEXT NOT NULL CHECK (response IN ('yes','no','not_sure','text','listened','skip')),
  text TEXT,
  via TEXT NOT NULL DEFAULT 'button' CHECK (via IN ('button','voice','text')),
  created_at INTEGER NOT NULL
);
-- Append-only history of what happened on the patient side (never overwritten).
CREATE TABLE IF NOT EXISTS monitoring_events (
  id INTEGER PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS monitoring_events_patient ON monitoring_events(patient_id, created_at);
`)

type Param = string | number | null | bigint
/** Thin typed helpers around prepared statements. */
export const q = {
  get: <T>(sql: string, ...p: Param[]) => db.prepare(sql).get(...p) as T | undefined,
  all: <T>(sql: string, ...p: Param[]) => db.prepare(sql).all(...p) as T[],
  run: (sql: string, ...p: Param[]) => db.prepare(sql).run(...p),
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
