import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { config } from '../config'
import * as schema from './schema'

/**
 * Bootstrap DDL, idempotent so it also works on a database created by the
 * Python backend. Keep in sync with ./schema.ts.
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

export function createDatabase(path: string = config.databasePath) {
  const sqlite = new Database(path, { create: true, strict: true })
  sqlite.run('PRAGMA journal_mode = WAL')
  sqlite.run('PRAGMA foreign_keys = ON')
  sqlite.run(SCHEMA)
  return drizzle(sqlite, { schema })
}

export type Db = ReturnType<typeof createDatabase>

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
