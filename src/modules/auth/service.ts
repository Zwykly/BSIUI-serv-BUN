import { eq } from 'drizzle-orm'
import type { Db } from '../../db'
import { users } from '../../db/schema'
import { HttpError } from '../../plugins/errors'

// Same parameters as pwdlib's recommended Argon2id hasher so hashes stay
// interchangeable with the Python backend (verification reads them from the hash).
const ARGON2 = { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 } as const

export abstract class AuthService {
  static register(db: Db, login: string, password: string) {
    const existing = db.select({ id: users.id }).from(users).where(eq(users.username, login)).get()
    if (existing) throw new HttpError(400, 'Użytkownik już istnieje')

    return db
      .insert(users)
      .values({ username: login, hashedPassword: Bun.password.hashSync(password, ARGON2) })
      .returning({ id: users.id, username: users.username })
      .get()
  }

  static async authenticate(db: Db, username: string, password: string) {
    const user = db.select().from(users).where(eq(users.username, username)).get()
    const valid = user && (await Bun.password.verify(password, user.hashedPassword).catch(() => false))
    if (!user || !valid) throw new HttpError(401, 'Zły login lub hasło')
    return user
  }
}
