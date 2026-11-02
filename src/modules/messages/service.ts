import type { Database } from 'bun:sqlite'
import { nowUtc, toIso } from '../../db'
import { HttpError } from '../../plugins/errors'
import type { User } from '../../plugins/auth'

interface MessageRow {
  id: number
  sender_name: string
  receiver_name: string
  msg: string
  created_at: string
}

export abstract class MessageService {
  static send(db: Database, sender: User, receiverName: string, msg: string) {
    if (!msg.trim()) throw new HttpError(400, 'Pusta wiadomość')

    const receiver = db
      .query<{ id: number }, [string]>('SELECT id FROM user WHERE username = ?')
      .get(receiverName)
    if (!receiver) throw new HttpError(404, 'Odbiorca nie istnieje')
    if (receiver.id === sender.id) throw new HttpError(400, 'Nie możesz pisać do siebie')

    const row = db
      .query<{ id: number; created_at: string }, [number, number, string, string]>(
        `INSERT INTO message (sender_id, receiver_id, msg, created_at)
         VALUES (?, ?, ?, ?) RETURNING id, created_at`
      )
      .get(sender.id, receiver.id, msg, nowUtc())
    return { id: row!.id, created_at: toIso(row!.created_at, '+00:00') }
  }

  static pendingSenders(db: Database, user: User, sinceId: number) {
    const senders = db
      .query<{ username: string; count: number; last_id: number }, [number, number]>(
        `SELECT u.username AS username, COUNT(m.id) AS count, MAX(m.id) AS last_id
         FROM message m JOIN user u ON u.id = m.sender_id
         WHERE m.receiver_id = ? AND m.id > ?
         GROUP BY u.username`
      )
      .all(user.id, sinceId)
    return { senders }
  }

  static history(db: Database, user: User, sinceId: number, otherName: string) {
    const other = db
      .query<{ id: number }, [string]>('SELECT id FROM user WHERE username = ?')
      .get(otherName)
    if (!other) throw new HttpError(404, 'Taki użytkownik nie istnieje')

    return db
      .query<MessageRow, [number, number, number, number, number]>(
        `SELECT m.id, s.username AS sender_name, r.username AS receiver_name, m.msg, m.created_at
         FROM message m
         JOIN user s ON s.id = m.sender_id
         JOIN user r ON r.id = m.receiver_id
         WHERE m.id > ?
           AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
         ORDER BY m.id ASC`
      )
      .all(sinceId, user.id, other.id, other.id, user.id)
      .map((m) => ({ ...m, created_at: toIso(m.created_at, 'Z') }))
  }
}
