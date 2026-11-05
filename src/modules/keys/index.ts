import { Elysia } from 'elysia'
import { authenticated } from '../../plugins/auth'
import { KeyModel } from './model'
import { KeyService } from './service'

export const keys = new Elysia({ tags: ['keys'] })
  .use(authenticated)
  // Sending flow, steps 1-2: fetch the receiver's bundle. The server hands out
  // one of their one-time prekeys and deletes it.
  .get('/:username/keys', ({ db, currentUser, params }) =>
    KeyService.bundle(db, currentUser, params.username),
  { params: KeyModel.usernameParams, response: { 200: KeyModel.publicBundle } })
  // Number of the caller's one-time prekeys still on the server.
  .get('/keys/opk', ({ db, currentUser }) => KeyService.oneTimePrekeyCount(db, currentUser),
  { response: { 200: KeyModel.count } })
  // Upload fresh one-time prekeys once the pool runs low.
  .post('/keys/opk', ({ db, currentUser, body }) =>
    KeyService.addOneTimePrekeys(db, currentUser, body.opk_pub),
  { body: KeyModel.oneTimePrekeys, response: { 200: KeyModel.count } })
