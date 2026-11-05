import { Elysia } from 'elysia'
import { authenticated } from '../../plugins/auth'
import { MessageModel } from './model'
import { MessageService } from './service'

export const messages = new Elysia({ prefix: '/messages', tags: ['messages'] })
  .use(authenticated)
  // Sending flow, step 5: headers {JWT, EK_A-pub[, OPK_B-pub]}, body {ciphertext, iv}.
  .post('', async ({ db, currentUser, body, headers, set }) => {
    const created = await MessageService.send(db, currentUser, body.receiver_name, {
      msg: body.msg,
      iv: body.iv,
      ekPub: headers['x-ek-pub'],
      opkPub: headers['x-opk-pub']
    })
    set.status = 201
    return created
  }, { body: MessageModel.create, headers: MessageModel.createHeaders, response: { 201: MessageModel.created } })
  .get('/update/:since_id', ({ db, currentUser, params }) =>
    MessageService.pendingSenders(db, currentUser, params.since_id),
  { params: MessageModel.sinceParams, response: { 200: MessageModel.update } })
  .get('/history/:since_id/:receiver_name', ({ db, currentUser, params }) =>
    MessageService.history(db, currentUser, params.since_id, params.receiver_name),
  { params: MessageModel.historyParams, response: { 200: MessageModel.history } })
