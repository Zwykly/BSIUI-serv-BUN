import { swagger } from '@elysiajs/swagger'
import { Elysia } from 'elysia'
import { auth } from './modules/auth'
import { messages } from './modules/messages'
import { errors } from './plugins/errors'

export const app = new Elysia()
  .use(errors)
  .use(swagger({ path: '/docs', documentation: { info: { title: 'Moje API', version: '0.1.0' } } }))
  .use(auth)
  .use(messages)

export type App = typeof app
