// Runs before every test file, before the app (and its config) is imported.
Bun.env.SECRET_KEY ??= 'test-secret'
Bun.env.ALGORITHM ??= 'HS256'
Bun.env.DATABASE_PATH = ':memory:'
