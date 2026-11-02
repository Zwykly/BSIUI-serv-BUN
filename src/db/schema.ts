import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  hashedPassword: text('hashed_password').notNull()
})

export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    senderId: integer('sender_id')
      .notNull()
      .references(() => users.id),
    receiverId: integer('receiver_id')
      .notNull()
      .references(() => users.id),
    // Opaque to the server: plain text today, ciphertext once E2EE lands.
    msg: text('msg').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (t) => [
    index('messages_sender_idx').on(t.senderId),
    index('messages_receiver_idx').on(t.receiverId, t.id)
  ]
)

export type User = typeof users.$inferSelect
export type Message = typeof messages.$inferSelect
