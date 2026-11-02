function required(name: string): string {
  const value = Bun.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const config = {
  port: Number(Bun.env.PORT ?? 8000),
  databasePath: Bun.env.DATABASE_PATH ?? 'database.db',
  secretKey: required('SECRET_KEY'),
  algorithm: required('ALGORITHM'),
  accessTokenExpireMinutes: 30
} as const
