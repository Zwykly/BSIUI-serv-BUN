import { t } from 'elysia'

const read = t.Object({
  id: t.Number(),
  sender_name: t.String(),
  receiver_name: t.String(),
  msg: t.String(),
  created_at: t.String()
})

export const MessageModel = {
  create: t.Object({ receiver_name: t.String(), msg: t.String() }),
  created: t.Object({ id: t.Number(), created_at: t.String() }),
  update: t.Object({
    senders: t.Array(t.Object({ username: t.String(), count: t.Number(), last_id: t.Number() }))
  }),
  history: t.Array(read),
  sinceParams: t.Object({ since_id: t.Integer() }),
  historyParams: t.Object({ since_id: t.Integer(), receiver_name: t.String() })
}
