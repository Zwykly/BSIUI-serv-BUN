import { t } from 'elysia'
import { KeyModel } from '../keys/model'

const read = t.Object({
  id: t.Number(),
  sender_name: t.String(),
  receiver_name: t.String(),
  msg: t.String({ description: 'Base64 AES-GCM ciphertext (with tag)' }),
  // Null only for messages stored before E2EE was introduced.
  iv: t.Nullable(t.String()),
  ek_pub: t.Nullable(KeyModel.publicKey),
  opk_pub: t.Nullable(KeyModel.publicKey),
  created_at: t.String()
})

export const MessageModel = {
  create: t.Object({
    receiver_name: t.String(),
    msg: t.String({ description: 'Base64 of AES-GCM(MESSAGEKEY, plaintext), including the 16-byte tag' }),
    iv: t.String({ description: 'Base64 of the random 12-byte AES-GCM IV' })
  }),
  // X3DH metadata travels in headers next to the JWT.
  createHeaders: t.Object({
    'x-ek-pub': t.String({ description: "Sender's ephemeral public key EK_A-pub" }),
    'x-opk-pub': t.Optional(
      t.String({ description: "Receiver's one-time prekey used for DH4; omit when the bundle had none" })
    )
  }, { additionalProperties: true }), // keep `authorization` for the JWT resolver
  created: t.Object({ id: t.Number(), created_at: t.String() }),
  update: t.Object({
    senders: t.Array(t.Object({ username: t.String(), count: t.Number(), last_id: t.Number() }))
  }),
  history: t.Array(read),
  sinceParams: t.Object({ since_id: t.Integer() }),
  historyParams: t.Object({ since_id: t.Integer(), receiver_name: t.String() })
}
