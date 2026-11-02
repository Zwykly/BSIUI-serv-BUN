import { beforeAll, describe, expect, it } from 'bun:test'
import type { App } from '../src/app'

// Must be set before the app (and its config) is imported.
Bun.env.SECRET_KEY ??= 'test-secret'
Bun.env.ALGORITHM ??= 'HS256'
Bun.env.DATABASE_PATH = ':memory:'

let app: App

beforeAll(async () => {
  app = (await import('../src/app')).app
})

const json = (body: unknown, token?: string) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
  body: JSON.stringify(body)
})
const get = (path: string, token: string) =>
  app.handle(new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${token}` } }))

async function register(login: string, password = 'secret') {
  return app.handle(new Request('http://localhost/auth/register', json({ login, password })))
}

async function login(username: string, password = 'secret'): Promise<string> {
  const res = await app.handle(
    new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password })
    })
  )
  return ((await res.json()) as { access_token: string }).access_token
}

describe('auth', () => {
  it('registers a user and rejects duplicates', async () => {
    const res = await register('alice')
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 1, username: 'alice' })

    const dup = await register('alice')
    expect(dup.status).toBe(400)
    expect(await dup.json()).toEqual({ detail: 'Użytkownik już istnieje' })
  })

  it('logs in with form data and rejects bad credentials', async () => {
    expect((await login('alice')).split('.')).toHaveLength(3)

    const bad = await app.handle(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: 'alice', password: 'wrong' })
      })
    )
    expect(bad.status).toBe(401)
    expect(await bad.json()).toEqual({ detail: 'Zły login lub hasło' })
  })
})

describe('messages', () => {
  it('requires a valid token', async () => {
    const none = await app.handle(new Request('http://localhost/messages/update/0'))
    expect(none.status).toBe(401)
    const bad = await get('/messages/update/0', 'garbage')
    expect(bad.status).toBe(401)
    expect(await bad.json()).toEqual({ detail: 'Nieprawidłowy token' })
  })

  it('sends, polls and reads history', async () => {
    await register('bob')
    const alice = await login('alice')
    const bob = await login('bob')

    const sent = await app.handle(new Request('http://localhost/messages', json({ receiver_name: 'bob', msg: 'hej' }, alice)))
    expect(sent.status).toBe(201)
    const { id, created_at } = (await sent.json()) as { id: number; created_at: string }
    expect(created_at).toEndWith('+00:00')

    expect(await (await get('/messages/update/0', bob)).json()).toEqual({
      senders: [{ username: 'alice', count: 1, last_id: id }]
    })
    expect(await (await get(`/messages/update/${id}`, bob)).json()).toEqual({ senders: [] })

    const history = (await (await get('/messages/history/0/alice', bob)).json()) as Record<string, unknown>[]
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ id, sender_name: 'alice', receiver_name: 'bob', msg: 'hej' })
    expect(history[0]!.created_at).toEndWith('Z')
  })

  it('validates sends', async () => {
    const alice = await login('alice')
    const send = (body: object) => app.handle(new Request('http://localhost/messages', json(body, alice)))

    expect((await send({ receiver_name: 'bob', msg: '   ' })).status).toBe(400)
    expect((await send({ receiver_name: 'alice', msg: 'x' })).status).toBe(400)
    expect((await send({ receiver_name: 'nobody', msg: 'x' })).status).toBe(404)
    expect((await get('/messages/history/0/nobody', alice)).status).toBe(404)
  })
})
