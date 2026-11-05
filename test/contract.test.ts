/**
 * API contract tests. They only speak HTTP, so they verify the same contract
 * every client relies on, against any server implementation:
 *
 *   bun test                                   # this server, in-process
 *   API_URL=http://127.0.0.1:8000 bun test     # any running server (e.g. the Python one)
 */
import { beforeAll, describe, expect, it } from 'bun:test'
import { addOneTimePrekeys, createAccount, type PublicBundle } from './client'

const API_URL = Bun.env.API_URL?.replace(/\/$/, '')

let send: (path: string, init?: RequestInit) => Promise<Response>

beforeAll(async () => {
  if (API_URL) {
    send = (path, init) => fetch(`${API_URL}${path}`, init)
  } else {
    const { app } = await import('../src/app')
    send = (path, init) => app.handle(new Request(`http://localhost${path}`, init))
  }
})

const suffix = Math.random().toString(36).slice(2, 8)
const alice = `alice_${suffix}`
const bob = `bob_${suffix}`
const password = 'secret-pw'

const post = (path: string, body: unknown, token?: string) =>
  send(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body)
  })
// Private key material of each test user (stays client-side).
const accounts = { alice: await createAccount(3), bob: await createAccount(3) }
const register = (login: string, account = accounts.alice, pw = password) =>
  post('/auth/register', { login, password: pw, ...account.bundle })

const get = (path: string, token?: string) =>
  send(path, token ? { headers: { authorization: `Bearer ${token}` } } : undefined)

const login = (username: string, pw = password) =>
  send('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password: pw })
  })
const token = async (username: string) => ((await (await login(username)).json()) as { access_token: string }).access_token

describe('auth', () => {
  it('registers users and rejects duplicates', async () => {
    const res = await register(alice, accounts.alice)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: expect.any(Number), username: alice })
    expect((await register(bob, accounts.bob)).status).toBe(201)

    const dup = await register(alice, accounts.alice)
    expect(dup.status).toBe(400)
    expect(await dup.json()).toEqual({ detail: 'Użytkownik już istnieje' })
  })

  it('rejects registrations with an invalid key bundle', async () => {
    const other = await createAccount(1)
    const { bundle } = accounts.alice
    const cases: [object, string][] = [
      [{ ...bundle, ik_pub: 'not-a-key' }, 'Nieprawidłowy klucz publiczny'],
      [{ ...bundle, opk_pub: [...bundle.opk_pub, 'AAAA'] }, 'Nieprawidłowy klucz publiczny'],
      // SPK signed by someone else's identity key.
      [{ ...bundle, sig: other.bundle.sig }, 'Nieprawidłowy podpis klucza'],
      [{ ...bundle, spk_pub: other.bundle.spk_pub }, 'Nieprawidłowy podpis klucza']
    ]
    for (const [keys, detail] of cases) {
      const res = await post('/auth/register', { login: `carol_${suffix}`, password, ...keys })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ detail })
    }
    expect((await login(`carol_${suffix}`)).status).toBe(401)
  })

  it('logs in via form data and returns a bearer token', async () => {
    const res = await login(alice)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { access_token: string; token_type: string }
    expect(body.token_type).toBe('bearer')
    expect(body.access_token.split('.')).toHaveLength(3)
  })

  it('rejects bad credentials', async () => {
    const res = await login(alice, 'wrong')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ detail: 'Zły login lub hasło' })
  })
})

describe('keys', () => {
  const bundleOf = async (username: string, tok: string) => {
    const res = await get(`/${username}/keys`, tok)
    expect(res.status).toBe(200)
    return (await res.json()) as PublicBundle
  }

  it('requires a valid token', async () => {
    expect((await get(`/${bob}/keys`)).status).toBe(401)
    expect((await get('/keys/opk')).status).toBe(401)
  })

  it('hands out the bundle with a different one-time prekey each time, then none', async () => {
    const a = await token(alice)
    const { ik_pub, spk_pub, sig, opk_pub } = accounts.bob.bundle

    const issued = [await bundleOf(bob, a), await bundleOf(bob, a), await bundleOf(bob, a)]
    for (const b of issued) expect(b).toMatchObject({ username: bob, ik_pub, spk_pub, sig })
    expect(issued.map((b) => b.opk_pub).sort()).toEqual([...opk_pub].sort())

    expect((await bundleOf(bob, a)).opk_pub).toBeNull()
    expect(await (await get('/keys/opk', await token(bob))).json()).toEqual({ count: 0 })
  })

  it('lets users upload fresh one-time prekeys', async () => {
    const b = await token(bob)
    const fresh = await addOneTimePrekeys(accounts.bob, 2)
    const res = await post('/keys/opk', { opk_pub: fresh }, b)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 2 })
    // Duplicates are ignored.
    expect(await (await post('/keys/opk', { opk_pub: fresh }, b)).json()).toEqual({ count: 2 })

    const tooMany = await post('/keys/opk', { opk_pub: await addOneTimePrekeys(accounts.bob, 99) }, b)
    expect(tooMany.status).toBe(400)
    expect(await tooMany.json()).toEqual({ detail: 'Za dużo kluczy jednorazowych' })

    const invalid = await post('/keys/opk', { opk_pub: ['bm9wZQ=='] }, b)
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ detail: 'Nieprawidłowy klucz publiczny' })
  })

  it('rejects unknown users and own keys', async () => {
    const a = await token(alice)
    const missing = await get(`/nobody_${suffix}/keys`, a)
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ detail: 'Taki użytkownik nie istnieje' })

    const own = await get(`/${alice}/keys`, a)
    expect(own.status).toBe(400)
    expect(await own.json()).toEqual({ detail: 'Nie możesz pobrać własnych kluczy' })
  })
})

describe('messages', () => {
  it('requires a valid token', async () => {
    expect((await get('/messages/update/0')).status).toBe(401)
    const bad = await get('/messages/update/0', 'garbage')
    expect(bad.status).toBe(401)
    expect(await bad.json()).toEqual({ detail: 'Nieprawidłowy token' })
  })

  it('sends a message, then exposes it via update and history', async () => {
    const [a, b] = [await token(alice), await token(bob)]

    const sent = await post('/messages', { receiver_name: bob, msg: 'hej' }, a)
    expect(sent.status).toBe(201)
    const { id, created_at } = (await sent.json()) as { id: number; created_at: string }
    expect(created_at).toMatch(/\+00:00$/)

    expect(await (await get('/messages/update/0', b)).json()).toEqual({
      senders: [{ username: alice, count: 1, last_id: id }]
    })
    expect(await (await get(`/messages/update/${id}`, b)).json()).toEqual({ senders: [] })

    const history = (await (await get(`/messages/history/0/${alice}`, b)).json()) as Record<string, unknown>[]
    expect(history).toEqual([
      { id, sender_name: alice, receiver_name: bob, msg: 'hej', created_at: expect.stringMatching(/Z$/) }
    ])
    expect(await (await get(`/messages/history/${id}/${alice}`, b)).json()).toEqual([])
  })

  it('orders history oldest first for both directions', async () => {
    const [a, b] = [await token(alice), await token(bob)]
    await post('/messages', { receiver_name: alice, msg: 'odp' }, b)
    const history = (await (await get(`/messages/history/0/${bob}`, a)).json()) as { msg: string; id: number }[]
    expect(history.map((m) => m.msg)).toEqual(['hej', 'odp'])
    expect(history[0]!.id).toBeLessThan(history[1]!.id)
  })

  it('rejects invalid sends', async () => {
    const a = await token(alice)
    const cases: [object, number, string][] = [
      [{ receiver_name: bob, msg: '   ' }, 400, 'Pusta wiadomość'],
      [{ receiver_name: alice, msg: 'x' }, 400, 'Nie możesz pisać do siebie'],
      [{ receiver_name: `nobody_${suffix}`, msg: 'x' }, 404, 'Odbiorca nie istnieje']
    ]
    for (const [body, status, detail] of cases) {
      const res = await post('/messages', body, a)
      expect(res.status).toBe(status)
      expect(await res.json()).toEqual({ detail })
    }
    const missing = await get(`/messages/history/0/nobody_${suffix}`, a)
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ detail: 'Taki użytkownik nie istnieje' })
  })
})
