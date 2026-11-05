import { t } from 'elysia'

/** Upper bound of one-time prekeys a user may have stored at once. */
export const MAX_ONE_TIME_PREKEYS = 100

const publicKey = t.String({ description: 'Base64 of a P-256 public key in SPKI (DER) form' })

const bundle = t.Object({
  ik_pub: publicKey,
  spk_pub: publicKey,
  sig: t.String({
    description: 'Base64 ECDSA P-256/SHA-256 signature (r||s, 64 bytes) over the SPKI bytes of spk_pub, made with IK_priv'
  }),
  opk_pub: t.Array(publicKey, { maxItems: MAX_ONE_TIME_PREKEYS })
})

export const KeyModel = {
  publicKey,
  bundle,
  /** Bundle handed to a sender. `opk_pub` is null once the user's pool is empty. */
  publicBundle: t.Object({
    username: t.String(),
    ik_pub: publicKey,
    spk_pub: publicKey,
    sig: t.String(),
    opk_pub: t.Nullable(publicKey)
  }),
  usernameParams: t.Object({ username: t.String() }),
  oneTimePrekeys: t.Object({
    opk_pub: t.Array(publicKey, { minItems: 1, maxItems: MAX_ONE_TIME_PREKEYS })
  }),
  count: t.Object({ count: t.Number() })
}

export type KeyBundle = typeof bundle.static
