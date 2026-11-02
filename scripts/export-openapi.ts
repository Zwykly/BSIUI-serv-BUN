import { app } from '../src/app'

const spec = await app.handle(new Request('http://localhost/docs/json')).then((r) => r.json())
await Bun.write('openapi.json', `${JSON.stringify(spec, null, 2)}\n`)
console.log('Wrote openapi.json')
