import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { config } from '../config'
import * as schema from './schema'

/** Opens the database and applies pending migrations from `./drizzle`. */
export function createDatabase(path: string = config.databasePath) {
  const sqlite = new Database(path, { create: true, strict: true })
  sqlite.run('PRAGMA journal_mode = WAL')
  sqlite.run('PRAGMA foreign_keys = ON')

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: `${import.meta.dir}/../../drizzle` })
  return db
}

export type Db = ReturnType<typeof createDatabase>

/**
 * Timestamps are stored as epoch milliseconds but exposed like the Python
 * backend does (microsecond precision). Python returns `+00:00` from
 * POST /messages and `Z` from the history endpoint, so clients may see both.
 */
export function toIso(date: Date, suffix: '+00:00' | 'Z'): string {
  return `${date.toISOString().slice(0, -1)}000${suffix}`
}
