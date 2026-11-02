import { jwt } from '@elysiajs/jwt'
import { eq } from 'drizzle-orm'
import { Elysia } from 'elysia'
import { config } from '../config'
import { users } from '../db/schema'
import { database } from './database'
import { errors, HttpError } from './errors'

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

    const user = db.select().from(users).where(eq(users.username, payload.sub)).get()
    if (!user) throw invalid

    return { currentUser: user }
  })
