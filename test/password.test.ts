import { expect, it } from 'bun:test'

// Hash produced by the Python backend (pwdlib / argon2-cffi) for the password "pw1".
const PYTHON_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$XqDfYJTPp/jgZddrfTt4bw$a0+MM/v8gYhI9rC2KeBRqlsansQpC35fYyU1dDVGlZQ'

it('verifies password hashes created by the Python backend', async () => {
  expect(await Bun.password.verify('pw1', PYTHON_HASH)).toBe(true)
  expect(await Bun.password.verify('nope', PYTHON_HASH)).toBe(false)
})
