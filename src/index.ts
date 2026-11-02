import { app } from './app'
import { config } from './config'

app.listen(config.port)

console.log(`Server running at http://${app.server?.hostname}:${app.server?.port} (docs: /docs)`)
