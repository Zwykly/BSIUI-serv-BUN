import { Database } from 'bun:sqlite'
import { config } from '../config'

/**
 * The schema mirrors the tables SQLModel creates in the Python backend, so
 * both servers can run against the same `database.db` file.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS user (
  id INTEGER NOT NULL,
  username VARCHAR NOT NULL,
  hashed_password VARCHAR NOT NULL,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_user_username ON user (username);

CREATE TABLE IF NOT EXISTS message (
  id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  msg VARCHAR NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY(sender_id) REFERENCES user (id),
  FOREIGN KEY(receiver_id) REFERENCES user (id)
);
CREATE INDEX IF NOT EXISTS ix_message_sender_id ON message (sender_id);
CREATE INDEX IF NOT EXISTS ix_message_receiver_id ON message (receiver_id);
CREATE INDEX IF NOT EXISTS ix_message_created_at ON message (created_at);
`

export function createDatabase(path: string = config.databasePath): Database {
  const db = new Database(path, { create: true, strict: true })
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')
  db.run(SCHEMA)
  return db
}

/**
 * SQLAlchemy stores naive UTC datetimes as "YYYY-MM-DD HH:MM:SS.ffffff".
 * Using the same format keeps rows readable by the Python backend.
 */
export function nowUtc(): string {
  const iso = new Date().toISOString() // 2026-10-28T15:30:00.123Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)}000`
}

/** Python returns `+00:00` from POST /messages but `Z` from the history endpoint. */
export function toIso(sqliteDate: string, suffix: '+00:00' | 'Z'): string {
  return `${sqliteDate.replace(' ', 'T')}${suffix}`
}
