import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  hashedPassword: text('hashed_password').notNull()
})

/**
 * Public half of a user's X3DH key bundle (identity key, signed prekey and
 * its signature). Private keys never reach the server.
 */
export const userKeys = sqliteTable('user_keys', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  ikPub: text('ik_pub').notNull(),
  spkPub: text('spk_pub').notNull(),
  sig: text('sig').notNull()
})

/** Pool of one-time prekeys; each row is handed out once and then deleted. */
export const oneTimePrekeys = sqliteTable(
  'one_time_prekeys',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    opkPub: text('opk_pub').notNull()
  },
  (t) => [uniqueIndex('one_time_prekeys_user_key_unique').on(t.userId, t.opkPub)]
)

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
    // Opaque to the server: AES-GCM ciphertext (Base64) produced by the sender.
    msg: text('msg').notNull(),
    // X3DH metadata the receiver needs to derive the message key. Nullable only
    // for messages stored before E2EE; the API requires them for new messages.
    iv: text('iv'),
    ekPub: text('ek_pub'),
    // One-time prekey of the receiver used for DH4; null when the sender fell
    // back to 3-DH because the receiver had no one-time prekeys left.
    opkPub: text('opk_pub'),
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
