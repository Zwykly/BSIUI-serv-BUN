import { Elysia } from 'elysia'
import { database } from '../../plugins/database'
import { errors } from '../../plugins/errors'
import { jwtPlugin } from '../../plugins/auth'
import { AuthModel } from './model'
import { AuthService } from './service'

export const auth = new Elysia({ prefix: '/auth', tags: ['auth'] })
  .use(errors)
  .use(database)
  .use(jwtPlugin)
  .post('/register', ({ db, body, set }) => {
    set.status = 201
    return AuthService.register(db, body.login, body.password)
  }, { body: AuthModel.register, response: { 201: AuthModel.user } })
  // OAuth2 password flow: form-urlencoded `username` + `password`, like FastAPI.
  .post('/login', async ({ db, jwt, body }) => {
    const user = await AuthService.authenticate(db, body.username, body.password)
    return { access_token: await jwt.sign({ sub: user.username }), token_type: 'bearer' as const }
  }, { body: AuthModel.login, response: { 200: AuthModel.token } })
