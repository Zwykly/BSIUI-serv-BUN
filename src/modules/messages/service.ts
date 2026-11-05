import { and, asc, count, eq, gt, max, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { toIso, type Db } from '../../db'
import { messages, users, type User } from '../../db/schema'
import { HttpError } from '../../plugins/errors'
import { decodeBase64, KeyService } from '../keys/service'

const IV_BYTES = 12
const GCM_TAG_BYTES = 16

/** What the sender attaches to a message so the receiver can redo X3DH. */
export interface EncryptedPayload {
  msg: string
  iv: string
  ekPub: string
  opkPub?: string
}

export abstract class MessageService {
  /**
   * Sending flow, step 6: store the message. The server cannot read it; it only
   * checks the payload is shaped like AES-GCM output plus valid X3DH public keys.
   */
  static async send(db: Db, sender: User, receiverName: string, payload: EncryptedPayload) {
    const { msg, iv, ekPub, opkPub } = payload
    if (!msg.trim()) throw new HttpError(400, 'Pusta wiadomość')

    const receiver = db.select({ id: users.id }).from(users).where(eq(users.username, receiverName)).get()
    if (!receiver) throw new HttpError(404, 'Odbiorca nie istnieje')
    if (receiver.id === sender.id) throw new HttpError(400, 'Nie możesz pisać do siebie')

    if ((decodeBase64(msg)?.length ?? 0) < GCM_TAG_BYTES) throw new HttpError(400, 'Nieprawidłowy szyfrogram')
    if (decodeBase64(iv)?.length !== IV_BYTES) throw new HttpError(400, 'Nieprawidłowy wektor IV')
    await KeyService.assertPublicKeys(opkPub === undefined ? [ekPub] : [ekPub, opkPub])

    const row = db
      .insert(messages)
      .values({ senderId: sender.id, receiverId: receiver.id, msg, iv, ekPub, opkPub: opkPub ?? null })
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
        iv: messages.iv,
        ek_pub: messages.ekPub,
        opk_pub: messages.opkPub,
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
