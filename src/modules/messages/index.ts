import { Elysia } from 'elysia'
import { authenticated } from '../../plugins/auth'
import { MessageModel } from './model'
import { MessageService } from './service'

export const messages = new Elysia({ prefix: '/messages', tags: ['messages'] })
  .use(authenticated)
  .post('', ({ db, currentUser, body, set }) => {
    set.status = 201
    return MessageService.send(db, currentUser, body.receiver_name, body.msg)
  }, { body: MessageModel.create, response: { 201: MessageModel.created } })
  .get('/update/:since_id', ({ db, currentUser, params }) =>
    MessageService.pendingSenders(db, currentUser, params.since_id),
  { params: MessageModel.sinceParams, response: { 200: MessageModel.update } })
  .get('/history/:since_id/:receiver_name', ({ db, currentUser, params }) =>
    MessageService.history(db, currentUser, params.since_id, params.receiver_name),
  { params: MessageModel.historyParams, response: { 200: MessageModel.history } })
