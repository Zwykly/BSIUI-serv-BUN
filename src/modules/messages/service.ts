import { and, asc, count, eq, gt, max, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { nowUtc, toIso, type Db } from '../../db'
import { messages, users, type User } from '../../db/schema'
import { HttpError } from '../../plugins/errors'

export abstract class MessageService {
  static send(db: Db, sender: User, receiverName: string, msg: string) {
    if (!msg.trim()) throw new HttpError(400, 'Pusta wiadomość')

    const receiver = db.select({ id: users.id }).from(users).where(eq(users.username, receiverName)).get()
    if (!receiver) throw new HttpError(404, 'Odbiorca nie istnieje')
    if (receiver.id === sender.id) throw new HttpError(400, 'Nie możesz pisać do siebie')

    const row = db
      .insert(messages)
      .values({ senderId: sender.id, receiverId: receiver.id, msg, createdAt: nowUtc() })
      .returning({ id: messages.id, createdAt: messages.createdAt })
      .get()
    return { id: row.id, created_at: toIso(row.createdAt, '+00:00') }
  }

  static pendingSenders(db: Db, user: User, sinceId: number) {
    const senders = db
      .select({
        username: users.username,
        count: count(messages.id),
        last_id: max(messages.id).mapWith(Number)
      })
      .from(messages)
      .innerJoin(users, eq(users.id, messages.senderId))
      .where(and(eq(messages.receiverId, user.id), gt(messages.id, sinceId)))
      .groupBy(users.username)
      .all()
    return { senders }
  }

  static history(db: Db, user: User, sinceId: number, otherName: string) {
    const other = db.select({ id: users.id }).from(users).where(eq(users.username, otherName)).get()
    if (!other) throw new HttpError(404, 'Taki użytkownik nie istnieje')

    const sender = alias(users, 'sender')
    const receiver = alias(users, 'receiver')

    return db
      .select({
        id: messages.id,
        sender_name: sender.username,
        receiver_name: receiver.username,
        msg: messages.msg,
        created_at: messages.createdAt
      })
      .from(messages)
      .innerJoin(sender, eq(sender.id, messages.senderId))
      .innerJoin(receiver, eq(receiver.id, messages.receiverId))
      .where(
        and(
          gt(messages.id, sinceId),
          or(
            and(eq(messages.senderId, user.id), eq(messages.receiverId, other.id)),
            and(eq(messages.senderId, other.id), eq(messages.receiverId, user.id))
          )
        )
      )
      .orderBy(asc(messages.id))
      .all()
      .map((m) => ({ ...m, created_at: toIso(m.created_at, 'Z') }))
  }
}
