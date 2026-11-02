import { jwt } from '@elysiajs/jwt'
import { Elysia } from 'elysia'
import { config } from '../config'
import { database } from './database'
import { errors, HttpError } from './errors'

export interface User {
  id: number
  username: string
  hashed_password: string
}

export const jwtPlugin = jwt({
  name: 'jwt',
  secret: config.secretKey,
  alg: config.algorithm as 'HS256',
  exp: `${config.accessTokenExpireMinutes}m`
})

/**
 * Adds `currentUser` to the context of every route registered after it
 * (equivalent of FastAPI's `CurrentUser` dependency).
 */
export const authenticated = new Elysia({ name: 'authenticated' })
  .use(errors)
  .use(database)
  .use(jwtPlugin)
  .resolve({ as: 'scoped' }, async ({ headers, jwt, db }) => {
    const invalid = new HttpError(401, 'Nieprawidłowy token')
    const header = headers.authorization
    if (!header) throw new HttpError(401, 'Not authenticated')

    const [scheme, token] = header.split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new HttpError(401, 'Not authenticated')

    const payload = await jwt.verify(token)
    if (!payload || typeof payload.sub !== 'string') throw invalid

    const user = db
      .query<User, [string]>('SELECT id, username, hashed_password FROM user WHERE username = ?')
      .get(payload.sub)
    if (!user) throw invalid

    return { currentUser: user }
  })
