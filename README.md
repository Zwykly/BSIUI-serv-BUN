# BSIUI-serv-BUN

Messaging server written in TypeScript on the [Bun](https://bun.sh) runtime, using
[ElysiaJS](https://elysiajs.com) and SQLite (`bun:sqlite`). It is a port of the Python
(FastAPI) server in `BSIUI-Serv` and exposes the same HTTP API. Clients register,
log in to get a JWT, send messages, and poll for new ones using a `since_id` cursor.

The two backends are **cross-compatible**: they can be swapped, or even run against the
same `database.db`, without clients or data noticing.

> **Planned:** end-to-end encrypted messaging. See [E2EE roadmap](#e2ee-roadmap).

## Running it

Requires [Bun](https://bun.sh) 1.3+.

```bash
bun install
cp .env.example .env     # then set SECRET_KEY
bun run dev              # watch mode; or `bun run start`
```

The server listens on `http://localhost:8000` (override with `PORT`).
Interactive API docs (Swagger) are at `http://localhost:8000/docs`.
The SQLite database (`database.db`) is created automatically on first start.

Other scripts: `bun test`, `bun run typecheck`.

### Configuration (`.env`)

| Variable        | Required | Description                                             |
| --------------- | -------- | ------------------------------------------------------- |
| `SECRET_KEY`    | yes      | JWT signing key. Use the same value as the Python server |
| `ALGORITHM`     | yes      | JWT algorithm, `HS256`                                  |
| `PORT`          | no       | Default `8000`                                          |
| `DATABASE_PATH` | no       | Default `database.db`                                   |

## API

Identical to the Python server. Error bodies are `{"detail": "..."}`.

| Method | Path                                    | Auth | Description                                                  |
| ------ | --------------------------------------- | ---- | ------------------------------------------------------------ |
| POST   | `/auth/register`                        | no   | JSON `{login, password}` → `201 {id, username}`              |
| POST   | `/auth/login`                           | no   | Form `username`, `password` → `{access_token, token_type}`   |
| POST   | `/messages`                             | yes  | JSON `{receiver_name, msg}` → `201 {id, created_at}`         |
| GET    | `/messages/update/{since_id}`           | yes  | Senders with new messages: `{senders: [{username, count, last_id}]}` |
| GET    | `/messages/history/{since_id}/{user}`   | yes  | Conversation with `user`, messages with `id > since_id`      |

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
├── db/index.ts         # SQLite connection + schema
├── plugins/            # Shared Elysia plugins
│   ├── database.ts     #   injects `db` into the context
│   ├── auth.ts         #   JWT + `currentUser` resolver
│   └── errors.ts       #   FastAPI-style error responses
└── modules/            # Feature modules: index (routes), service, model
    ├── auth/           #   register / login
    ├── messages/       #   send / update / history
    └── keys/           #   reserved for E2EE (not implemented)
test/                   # bun test suites
```

Each module follows the Elysia convention: `index.ts` is the controller (routes),
`service.ts` holds the logic, `model.ts` holds the validation schemas.

## Cross-compatibility with the Python backend

Both servers must keep behaving identically. What is shared, and must stay that way:

- **Database schema:** same `user` and `message` tables and indexes as SQLModel creates.
  Timestamps are stored as `YYYY-MM-DD HH:MM:SS.ffffff` (UTC).
- **Passwords:** Argon2id hashes (same parameters as pwdlib); each server can verify
  hashes written by the other.
- **JWT:** HS256 with `sub` (username) and `exp`; a token from one server is valid on
  the other when `SECRET_KEY` matches.
- **Responses:** same paths, status codes, Polish error messages and field names. Note
  that `created_at` ends with `+00:00` on `POST /messages` but `Z` in history, as in Python.

Known difference: request-validation errors (`422`) have the same status but a simpler body.

When you change the API, schema, or token/hash format, change both backends.

## E2EE roadmap

An end-to-end encrypted communicator is planned as an extension. The design keeps the
server blind to content:

- Clients generate key pairs; private keys never leave the device.
- The server stores a public-key directory (see `src/modules/keys/`) and relays
  messages, storing `message.msg` as opaque ciphertext. Message endpoints stay unchanged.
- The same key endpoints and table must be added to the Python backend to preserve
  cross-compatibility.
