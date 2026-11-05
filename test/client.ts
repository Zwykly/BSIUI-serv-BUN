/**
 * Reference client-side cryptography for the E2EE flow (Web Crypto only, so it
 * also runs in browsers). The server never sees anything private from here.
 *
 * Suite: P-256 keys exchanged as Base64 SPKI; IK signs SPK with ECDSA/SHA-256
 * (raw r||s signature); MESSAGEKEY = HKDF-SHA256(DH1||DH2||DH3[||DH4],
 * salt = 32 zero bytes, info = "BSIUI-X3DH"); messages use AES-256-GCM with a
 * random 12-byte IV.
 */

const P256 = { namedCurve: 'P-256' } as const
const HKDF_INFO = new TextEncoder().encode('BSIUI-X3DH')

export const toB64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf as ArrayBuffer).toString('base64')
export const fromB64 = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'))

const generateEcdh = () =>
  crypto.subtle.generateKey({ name: 'ECDH', ...P256 }, true, ['deriveBits']) as Promise<CryptoKeyPair>
const exportPub = async (key: CryptoKey) => toB64(await crypto.subtle.exportKey('spki', key))
const importEcdhPub = (b64: string) => crypto.subtle.importKey('spki', fromB64(b64), { name: 'ECDH', ...P256 }, false, [])
const ecdh = async (priv: CryptoKey, pub: CryptoKey) =>
  new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256))

async function messageKey(parts: Uint8Array[]) {
  const ikm = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  parts.reduce((offset, p) => (ikm.set(p, offset), offset + p.length), 0)
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: HKDF_INFO },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export interface PublicBundle {
  username: string
  ik_pub: string
  spk_pub: string
  sig: string
  opk_pub: string | null
}

export interface EncryptedMessage {
  msg: string
  iv: string
  ek_pub: string
  opk_pub: string | null
}

/** Registration, step 1-2: generate IK, SPK and the OPKs, and sign SPK_pub with IK_priv. */
export async function createAccount(opkCount = 100) {
  // IK is used for both signing (ECDSA) and X3DH (ECDH): same P-256 key, imported twice.
  const ik = (await crypto.subtle.generateKey({ name: 'ECDSA', ...P256 }, true, ['sign', 'verify'])) as CryptoKeyPair
  const ikDh = await crypto.subtle.importKey(
    'pkcs8',
    await crypto.subtle.exportKey('pkcs8', ik.privateKey),
    { name: 'ECDH', ...P256 },
    false,
    ['deriveBits']
  )
  const spk = await generateEcdh()
  const spkSpki = await crypto.subtle.exportKey('spki', spk.publicKey)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ik.privateKey, spkSpki)

  const opks = new Map<string, CryptoKey>()
  for (let i = 0; i < opkCount; i++) {
    const pair = await generateEcdh()
    opks.set(await exportPub(pair.publicKey), pair.privateKey)
  }

  return {
    /** Private state that stays on the device. */
    ikPriv: ikDh,
    spkPriv: spk.privateKey,
    opks,
    /** Public part sent to POST /auth/register. */
    bundle: {
      ik_pub: await exportPub(ik.publicKey),
      spk_pub: toB64(spkSpki),
      sig: toB64(sig),
      opk_pub: [...opks.keys()]
    }
  }
}

export type Account = Awaited<ReturnType<typeof createAccount>>

/** Fresh one-time prekeys for POST /keys/opk; private halves are added to the account. */
export async function addOneTimePrekeys(account: Account, count: number) {
  const pubs: string[] = []
  for (let i = 0; i < count; i++) {
    const pair = await generateEcdh()
    const pub = await exportPub(pair.publicKey)
    account.opks.set(pub, pair.privateKey)
    pubs.push(pub)
  }
  return pubs
}

/** Sending, step 3: SPK_B must be signed by IK_B. */
export async function verifyBundle(bundle: PublicBundle) {
  const ik = await crypto.subtle.importKey('spki', fromB64(bundle.ik_pub), { name: 'ECDSA', ...P256 }, false, ['verify'])
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ik, fromB64(bundle.sig), fromB64(bundle.spk_pub))
}

/** Sending, steps 3-4: create EK_A, derive MESSAGEKEY with X3DH and encrypt. */
export async function encrypt(sender: Account, bundle: PublicBundle, plaintext: string): Promise<EncryptedMessage> {
  if (!(await verifyBundle(bundle))) throw new Error('Invalid signed prekey signature')

  const ek = await generateEcdh()
  const ikB = await importEcdhPub(bundle.ik_pub)
  const spkB = await importEcdhPub(bundle.spk_pub)
  const parts = [
    await ecdh(sender.ikPriv, spkB), // DH1 = ECDH(IK_A-priv, SPK_B-pub)
    await ecdh(ek.privateKey, ikB), // DH2 = ECDH(EK_A-priv, IK_B-pub)
    await ecdh(ek.privateKey, spkB) // DH3 = ECDH(EK_A-priv, SPK_B-pub)
  ]
  // DH4 = ECDH(EK_A-priv, OPK_B-pub); skipped when B has no one-time prekeys left.
  if (bundle.opk_pub) parts.push(await ecdh(ek.privateKey, await importEcdhPub(bundle.opk_pub)))

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await messageKey(parts),
    new TextEncoder().encode(plaintext)
  )
  return { msg: toB64(ciphertext), iv: toB64(iv), ek_pub: await exportPub(ek.publicKey), opk_pub: bundle.opk_pub }
}

/** Receiving: mirror the four ECDH operations with B's private keys and decrypt. */
export async function decrypt(receiver: Account, senderIkPub: string, message: EncryptedMessage) {
  const ikA = await importEcdhPub(senderIkPub)
  const ekA = await importEcdhPub(message.ek_pub)
  const parts = [
    await ecdh(receiver.spkPriv, ikA), // DH1
    await ecdh(receiver.ikPriv, ekA), // DH2
    await ecdh(receiver.spkPriv, ekA) // DH3
  ]
  if (message.opk_pub) {
    const opkPriv = receiver.opks.get(message.opk_pub)
    if (!opkPriv) throw new Error('Unknown one-time prekey')
    parts.push(await ecdh(opkPriv, ekA)) // DH4
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(message.iv) },
    await messageKey(parts),
    fromB64(message.msg)
  )
  return new TextDecoder().decode(plaintext)
}

/** Headers for POST /messages: the JWT plus the X3DH metadata. */
export function messageHeaders(token: string, message: EncryptedMessage): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'x-ek-pub': message.ek_pub,
    ...(message.opk_pub && { 'x-opk-pub': message.opk_pub })
  }
}
