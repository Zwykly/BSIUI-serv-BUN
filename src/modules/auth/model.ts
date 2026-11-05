import { t } from 'elysia'
import { KeyModel } from '../keys/model'

export const AuthModel = {
  // Registration uploads the public half of the client's X3DH bundle:
  // IK_pub, SPK_pub, Sig = sign(IK_priv, SPK_pub) and the one-time prekeys.
  register: t.Object({ login: t.String(), password: t.String(), ...KeyModel.bundle.properties }),
  login: t.Object({ username: t.String(), password: t.String() }),
  user: t.Object({ id: t.Number(), username: t.String() }),
  token: t.Object({ access_token: t.String(), token_type: t.Literal('bearer') })
}
