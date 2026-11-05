import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'
import { auth } from './modules/auth'
import { keys } from './modules/keys'
import { messages } from './modules/messages'
import { errors } from './plugins/errors'

export const app = new Elysia()
  .use(errors)
  .use(
    openapi({
      path: '/docs',
      specPath: '/docs/json',
      documentation: { info: { title: 'BSIUI Messenger API', version: '0.1.0' } }
    })
  )
  .use(auth)
  .use(messages)
  .use(keys)

export type App = typeof app
