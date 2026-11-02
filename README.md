# BSIUI-serv-BUN

Messaging server written in TypeScript on the [Bun](https://bun.sh) runtime, using
[ElysiaJS](https://elysiajs.com) and SQLite (`bun:sqlite`) accessed through [Drizzle ORM](https://orm.drizzle.team). It is a port of the Python
(FastAPI) server in `BSIUI-Serv` and exposes the same HTTP API. Clients register,
log in to get a JWT, send messages, and poll for new ones using a `since_id` cursor.

The two backends are **cross-compatible at the API level**: a client written for one works
unchanged against the other. Each backend owns its own database and schema, so they do not
share a `database.db`.

> **Planned:** end-to-end encrypted messaging. See [E2EE roadmap](#e2ee-roadmap).

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
    └── keys/           #   reserved for E2EE (not implemented)
drizzle/                # Generated SQL migrations (drizzle-kit)
scripts/                # Helper scripts (OpenAPI export)
test/                   # bun test suites
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

It currently passes against both backends. Run it against both whenever the API changes,
and change both backends together.

Known difference: request-validation errors (`422`) have the same status but a simpler body.

## E2EE roadmap

An end-to-end encrypted communicator is planned as an extension. The design keeps the
server blind to content:

- Clients generate key pairs; private keys never leave the device.
- The server stores a public-key directory (see `src/modules/keys/`) and relays
  messages, storing `message.msg` as opaque ciphertext. Message endpoints stay unchanged.
- The same key endpoints must be added to the Python backend and to the contract tests
  to preserve cross-compatibility.
