import { asc, count, eq, inArray } from 'drizzle-orm'
import type { Db } from '../../db'
import { oneTimePrekeys, userKeys, users, type User } from '../../db/schema'
import { HttpError } from '../../plugins/errors'
import { MAX_ONE_TIME_PREKEYS, type KeyBundle } from './model'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** Strict Base64 decoding; returns null for anything that is not canonical Base64. */
export function decodeBase64(value: string): Uint8Array<ArrayBuffer> | null {
  return value && BASE64.test(value) ? Uint8Array.from(Buffer.from(value, 'base64')) : null
}

/**
 * Imports a Base64 SPKI P-256 public key. The identity key is used both for
 * ECDH (X3DH) and ECDSA (signing the SPK), so it is imported per use.
 */
async function importPublicKey(value: string, name: 'ECDH' | 'ECDSA'): Promise<CryptoKey | null> {
  const der = decodeBase64(value)
  if (!der) return null
  return crypto.subtle
    .importKey('spki', der, { name, namedCurve: 'P-256' }, false, name === 'ECDSA' ? ['verify'] : [])
    .catch(() => null)
}

export abstract class KeyService {
  /** True when `value` is a Base64 SPKI P-256 public key. */
  static async isPublicKey(value: string) {
    return (await importPublicKey(value, 'ECDH')) !== null
  }

  static async assertPublicKeys(values: string[]) {
    for (const value of values) {
      if (!(await KeyService.isPublicKey(value))) throw new HttpError(400, 'Nieprawidłowy klucz publiczny')
    }
  }

  /** Checks key formats and that `sig` is IK's signature over the SPK, as clients will. */
  static async validateBundle(bundle: KeyBundle) {
    await KeyService.assertPublicKeys([bundle.ik_pub, bundle.spk_pub, ...bundle.opk_pub])

    const ik = (await importPublicKey(bundle.ik_pub, 'ECDSA'))!
    const spk = decodeBase64(bundle.spk_pub)!
    const sig = decodeBase64(bundle.sig)
    const valid =
      sig !== null &&
      (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ik, sig, spk).catch(() => false))
    if (!valid) throw new HttpError(400, 'Nieprawidłowy podpis klucza')
  }

  /** Stores a validated bundle; call inside the registration transaction. */
  static store(tx: Db | Tx, userId: number, bundle: KeyBundle) {
    tx.insert(userKeys).values({ userId, ikPub: bundle.ik_pub, spkPub: bundle.spk_pub, sig: bundle.sig }).run()
    KeyService.insertOneTimePrekeys(tx, userId, bundle.opk_pub)
  }

  /**
   * Returns `username`'s public bundle with one one-time prekey, which is
   * removed from the pool in the same statement so it is never handed out twice.
   */
  static bundle(db: Db, requester: User, username: string) {
    const user = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()
    if (!user) throw new HttpError(404, 'Taki użytkownik nie istnieje')
    if (user.id === requester.id) throw new HttpError(400, 'Nie możesz pobrać własnych kluczy')

    const keys = db.select().from(userKeys).where(eq(userKeys.userId, user.id)).get()
    if (!keys) throw new HttpError(404, 'Użytkownik nie ma kluczy')

    const oldest = db
      .select({ id: oneTimePrekeys.id })
      .from(oneTimePrekeys)
      .where(eq(oneTimePrekeys.userId, user.id))
      .orderBy(asc(oneTimePrekeys.id))
      .limit(1)
    const opk = db
      .delete(oneTimePrekeys)
      .where(inArray(oneTimePrekeys.id, oldest))
      .returning({ opkPub: oneTimePrekeys.opkPub })
      .get()

    return { username, ik_pub: keys.ikPub, spk_pub: keys.spkPub, sig: keys.sig, opk_pub: opk?.opkPub ?? null }
  }

  static oneTimePrekeyCount(db: Db | Tx, user: Pick<User, 'id'>) {
    const row = db.select({ count: count() }).from(oneTimePrekeys).where(eq(oneTimePrekeys.userId, user.id)).get()
    return { count: row?.count ?? 0 }
  }

  /** Tops up the caller's one-time prekey pool; duplicates are ignored. */
  static async addOneTimePrekeys(db: Db, user: User, opkPubs: string[]) {
    await KeyService.assertPublicKeys(opkPubs)
    return db.transaction((tx) => {
      if (KeyService.oneTimePrekeyCount(tx, user).count + opkPubs.length > MAX_ONE_TIME_PREKEYS) {
        throw new HttpError(400, 'Za dużo kluczy jednorazowych')
      }
      KeyService.insertOneTimePrekeys(tx, user.id, opkPubs)
      return KeyService.oneTimePrekeyCount(tx, user)
    })
  }

  private static insertOneTimePrekeys(tx: Db | Tx, userId: number, opkPubs: string[]) {
    if (opkPubs.length === 0) return
    tx.insert(oneTimePrekeys)
      .values(opkPubs.map((opkPub) => ({ userId, opkPub })))
      .onConflictDoNothing()
      .run()
  }
}
