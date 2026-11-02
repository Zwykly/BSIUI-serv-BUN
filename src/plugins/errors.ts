import { Elysia } from 'elysia'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string
  ) {
    super(detail)
  }
}

/** Mirrors FastAPI's `{"detail": "..."}` error body. */
export const errors = new Elysia({ name: 'errors' })
  .error({ HTTP_ERROR: HttpError })
  .onError({ as: 'global' }, ({ code, error, set }) => {
    if (code === 'HTTP_ERROR') {
      set.status = error.status
      return { detail: error.detail }
    }
    if (code === 'NOT_FOUND') {
      set.status = 404
      return { detail: 'Not Found' }
    }
    if (code === 'VALIDATION') {
      set.status = 422
      return {
        detail: error.all.map((e) => ({
          loc: ['body', ...(e.path ? e.path.split('/').filter(Boolean) : [])],
          msg: e.summary ?? e.message,
          type: 'validation_error'
        }))
      }
    }
  })
