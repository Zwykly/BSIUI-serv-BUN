# BSIUI-serv-BUN

Messaging server written in TypeScript on the [Bun](https://bun.sh) runtime, using
[ElysiaJS](https://elysiajs.com) and SQLite (`bun:sqlite`) accessed through [Drizzle ORM](https://orm.drizzle.team). It is a port of the Python
(FastAPI) server in `BSIUI-Serv` and exposes the same HTTP API. Clients register,
log in to get a JWT, send messages, and poll for new ones using a `since_id` cursor.

Messages are **end-to-end encrypted** (X3DH key agreement + AES-256-GCM): the server stores
public keys and ciphertext only and cannot read messages. See [End-to-end encryption](#end-to-end-encryption).

The two backends are **cross-compatible at the API level**: a client written for one works
unchanged against the other. Each backend owns its own database and schema, so they do not
share a `database.db`.

## Running it

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
cp .env.example .env     # then set SECRET_KEY
bun run dev              # watch mode; or `bun run start`
```

The server listens on `http://localhost:8000` (override with `PORT`).
Interactive API docs are at `http://localhost:8000/docs`; the OpenAPI spec is at `/docs/json` (and committed as `openapi.json`) for generating clients.
The SQLite database (`database.db`) is created automatically on first start.

| Script                | What it does                                                      |
| --------------------- | ----------------------------------------------------------------- |
| `bun test`            | Runs the tests (API contract suite, in-process)                   |
| `bun run typecheck`   | Type-checks the project                                           |
| `bun run db:generate` | Generates a SQL migration after editing `src/db/schema.ts`        |
| `bun run db:studio`   | Opens Drizzle Studio to browse the database                       |
| `bun run openapi`     | Exports the OpenAPI spec to `openapi.json`                        |

Migrations in `drizzle/` are applied automatically on startup.

### Configuration (`.env`)

| Variable        | Required | Description                                             |
| --------------- | -------- | ------------------------------------------------------- |
| `SECRET_KEY`    | yes      | JWT signing key. Use the same value as the Python server |
| `ALGORITHM`     | yes      | JWT algorithm, `HS256`                                  |
| `PORT`          | no       | Default `8000`                                          |
| `DATABASE_PATH` | no       | Default `database.db`                                   |

## API

Error bodies are `{"detail": "..."}`.

| Method | Path                                    | Auth | Description                                                  |
| ------ | --------------------------------------- | ---- | ------------------------------------------------------------ |
| POST   | `/auth/register`                        | no   | JSON `{login, password, ik_pub, spk_pub, sig, opk_pub[]}` → `201 {id, username}` |
| POST   | `/auth/login`                           | no   | Form `username`, `password` → `{access_token, token_type}`   |
| GET    | `/{username}/keys`                      | yes  | Key bundle `{username, ik_pub, spk_pub, sig, opk_pub}`; consumes one OPK |
| GET    | `/keys/opk`                             | yes  | `{count}` of your one-time prekeys left on the server         |
| POST   | `/keys/opk`                             | yes  | JSON `{opk_pub[]}` adds one-time prekeys → `{count}` (max 100 stored) |
| POST   | `/messages`                             | yes  | Headers `X-EK-Pub`, optional `X-OPK-Pub`; JSON `{receiver_name, msg, iv}` → `201 {id, created_at}` |
| GET    | `/messages/update/{since_id}`           | yes  | Senders with new messages: `{senders: [{username, count, last_id}]}` |
| GET    | `/messages/history/{since_id}/{user}`   | yes  | Conversation with `user`, messages with `id > since_id`, each with `msg, iv, ek_pub, opk_pub` |

Authenticated routes need `Authorization: Bearer <token>`; tokens last 30 minutes.
The server is stateless: clients keep their own `since_id` and should advance it only
after a successful `/history` fetch. The full endpoint reference is in the Python
project's README.

## Project structure

```
src/
├── index.ts            # Entrypoint: starts the server
├── app.ts              # Builds the Elysia app (plugins + modules)
├── config.ts           # Environment configuration
├── db/
│   ├── schema.ts       #   Drizzle table definitions (source of truth)
│   └── index.ts        #   connection, auto-migration, timestamp helper
├── plugins/            # Shared Elysia plugins
│   ├── database.ts     #   injects `db` into the context
│   ├── auth.ts         #   JWT + `currentUser` resolver
│   └── errors.ts       #   FastAPI-style error responses
└── modules/            # Feature modules: index (routes), service, model
    ├── auth/           #   register / login
    ├── messages/       #   send / update / history
    └── keys/           #   public key directory (bundles, one-time prekeys)
drizzle/                # Generated SQL migrations (drizzle-kit)
scripts/                # Helper scripts (OpenAPI export)
test/                   # bun test suites; client.ts = reference client crypto
```

Each module follows the Elysia convention: `index.ts` is the controller (routes),
`service.ts` holds the logic, `model.ts` holds the validation schemas.

## Cross-compatibility with the Python backend

The **HTTP API is the contract**, not the database. Each backend can change its schema,
ORM or storage freely as long as clients see the same behaviour:

- **Endpoints:** same paths, methods, status codes, field names and Polish error messages.
- **Auth:** HS256 JWT with `sub` (username) and `exp`, 30 minutes. A token from one server
  is valid on the other when `SECRET_KEY` matches.
- **Passwords:** Argon2id. Hashes written by the Python server verify here (covered by a
  test), so users can be migrated between backends.
- **Timestamps:** ISO 8601 UTC. `created_at` ends with `+00:00` on `POST /messages` and `Z`
  in history, as in Python.

The contract test suite (`test/contract.test.ts`) speaks only HTTP, so it can check any server:

```bash
bun test                                    # this server, in-process
API_URL=http://127.0.0.1:8000 bun test test/contract.test.ts   # any running server, e.g. Python
```

The E2EE changes (key bundle on registration, `/{username}/keys`, `/keys/opk`, encrypted
message fields) are not yet in the Python backend, so the suite passes only here until it is
updated. Run it against both whenever the API changes,
and change both backends together.

Known difference: request-validation errors (`422`) have the same status but a simpler body.

## End-to-end encryption

The server is a public-key directory and a blind relay. Clients generate all key pairs and
keep the private halves; the server only ever sees public keys and ciphertext. There is no
multi-device sync: one account = one device, and a sender keeps its own plaintext locally
(it cannot decrypt what it sent). Sessions are still authenticated with the JWT.

**Crypto suite** (the contract every client must follow; `test/client.ts` is a working
reference using only Web Crypto):

- Keys: NIST P-256, sent as Base64 of the SPKI (DER) encoding.
- `IK` (identity key) is one P-256 key used for both ECDSA (signing `SPK`) and ECDH.
- `sig`: Base64 ECDSA-SHA256 signature in raw `r||s` form (64 bytes, Web Crypto's format)
  over the SPKI bytes of `spk_pub`, made with `IK_priv`.
- `MESSAGEKEY = HKDF-SHA256(DH1 || DH2 || DH3 [|| DH4], salt = 32 zero bytes, info = "BSIUI-X3DH")`, 256 bits.
- `msg = Base64(AES-256-GCM(MESSAGEKEY, iv, plaintext))` including the 16-byte tag; `iv` is 12 random bytes, Base64.

**Registration** (`POST /auth/register`)

1. The client generates `IK`, `SPK` and 100 `OPK` key pairs.
2. It signs `SPK_pub` with `IK_priv` → `sig`.
3. It sends `{login, password, sig, ik_pub, spk_pub, opk_pub: [OPK_pub1 … OPK_pub100]}`.
4. The server checks the key formats and the signature, stores the public keys and answers `201`.

**Sending a message** (A → B)

1. A fetches B's keys with `GET /{B}/keys` unless it already has them locally.
2. The server returns B's `ik_pub`, `spk_pub`, `sig` and one `opk_pub`, and deletes that OPK
   so it is never handed out again (`null` once B's pool is empty).
3. A verifies `sig` with `IK_B-pub` and generates an ephemeral key `EK_A`.
4. A derives the message key:
   ```
   DH1 = ECDH(IK_A-priv, SPK_B-pub)
   DH2 = ECDH(EK_A-priv, IK_B-pub)
   DH3 = ECDH(EK_A-priv, SPK_B-pub)
   DH4 = ECDH(EK_A-priv, OPK_B-pub)        # omitted if opk_pub was null (3-DH fallback)
   MESSAGEKEY = HKDF(DH1 || DH2 || DH3 || DH4)
   msg = AES-GCM(MESSAGEKEY, iv, "content")
   ```
5. A sends `POST /messages` with headers `Authorization: Bearer <JWT>`, `X-EK-Pub: EK_A-pub`
   and `X-OPK-Pub: OPK_B-pub` (omit when there was none), body `{receiver_name, msg, iv}`.
6. The server stores the message with its metadata.

**Receiving:** B reads `/messages/history`, gets `IK_A-pub` from `GET /{A}/keys` (needed
anyway to reply, then kept locally), looks up the private key of `opk_pub` and mirrors the
ECDH operations (`DH1 = ECDH(SPK_B-priv, IK_A-pub)`, `DH2 = ECDH(IK_B-priv, EK_A-pub)`,
`DH3 = ECDH(SPK_B-priv, EK_A-pub)`, `DH4 = ECDH(OPK_B-priv, EK_A-pub)`). Because A caches
B's keys, several messages can reference the same `opk_pub`, so B keeps OPK private keys it
has seen in messages. Clients should top up their pool with `POST /keys/opk` when
`GET /keys/opk` reports it is running low.

The server validates formats (Base64, P-256 keys, signature, 12-byte IV, ciphertext at least
one GCM tag long) so broken clients fail early, but security never depends on it: clients
must verify `sig` themselves.

Messages stored before E2EE are returned with `iv`, `ek_pub` and `opk_pub` set to `null`.

**Cross-compatibility:** the Python backend must implement the same key endpoints and
payload formats to stay compatible; the contract tests cover them.
