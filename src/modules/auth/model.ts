import { t } from 'elysia'

export const AuthModel = {
  register: t.Object({ login: t.String(), password: t.String() }),
  login: t.Object({ username: t.String(), password: t.String() }),
  user: t.Object({ id: t.Number(), username: t.String() }),
  token: t.Object({ access_token: t.String(), token_type: t.Literal('bearer') })
}
