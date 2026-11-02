import type { Database } from 'bun:sqlite'
import { HttpError } from '../../plugins/errors'
import type { User } from '../../plugins/auth'

// Same parameters as pwdlib's recommended Argon2id hasher so hashes stay
// interchangeable with the Python backend (verification reads them from the hash).
const ARGON2 = { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 } as const

export abstract class AuthService {
  static register(db: Database, login: string, password: string) {
    const existing = db.query('SELECT 1 FROM user WHERE username = ?').get(login)
    if (existing) throw new HttpError(400, 'Użytkownik już istnieje')

    const hashed = Bun.password.hashSync(password, ARGON2)
    const user = db
      .query<{ id: number; username: string }, [string, string]>(
        'INSERT INTO user (username, hashed_password) VALUES (?, ?) RETURNING id, username'
      )
      .get(login, hashed)
    return user!
  }

  static async authenticate(db: Database, username: string, password: string): Promise<User> {
    const user = db
      .query<User, [string]>('SELECT id, username, hashed_password FROM user WHERE username = ?')
      .get(username)
    const valid = user && (await Bun.password.verify(password, user.hashed_password).catch(() => false))
    if (!user || !valid) throw new HttpError(401, 'Zły login lub hasło')
    return user
  }
}
