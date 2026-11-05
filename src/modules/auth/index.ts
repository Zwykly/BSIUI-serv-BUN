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
  // Registration: the client sends its credentials together with the public
  // half of its key bundle (IK_pub, SPK_pub, Sig, OPK_pub[]).
  .post('/register', async ({ db, body, set }) => {
    const { login, password, ...bundle } = body
    const user = await AuthService.register(db, login, password, bundle)
    set.status = 201
    return user
  }, { body: AuthModel.register, response: { 201: AuthModel.user } })
  // OAuth2 password flow: form-urlencoded `username` + `password`, like FastAPI.
  .post('/login', async ({ db, jwt, body }) => {
    const user = await AuthService.authenticate(db, body.username, body.password)
    return { access_token: await jwt.sign({ sub: user.username }), token_type: 'bearer' as const }
  }, { body: AuthModel.login, response: { 200: AuthModel.token } })
