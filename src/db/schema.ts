import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Mirrors the tables SQLModel creates in the Python backend (table and column
 * names must not change, both servers share the same database file).
 */
export const users = sqliteTable('user', {
  id: integer('id').primaryKey(),
  username: text('username').notNull().unique(),
  hashedPassword: text('hashed_password').notNull()
})

export const messages = sqliteTable('message', {
  id: integer('id').primaryKey(),
  senderId: integer('sender_id')
    .notNull()
    .references(() => users.id),
  receiverId: integer('receiver_id')
    .notNull()
    .references(() => users.id),
  msg: text('msg').notNull(),
  // Stored as "YYYY-MM-DD HH:MM:SS.ffffff" (UTC), the format SQLAlchemy uses.
  createdAt: text('created_at').notNull()
})

export type User = typeof users.$inferSelect
