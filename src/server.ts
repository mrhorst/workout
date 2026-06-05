import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  getDashboardSummary,
  initializeDatabase,
  openDatabase,
} from './db.js'

export type ServerOptions = {
  dbPath: string
  host: string
  port: number
}

export function startServer(options: ServerOptions): void {
  const db = openDatabase(options.dbPath)
  initializeDatabase(db)

  const app = express()
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), 'public')

  app.get('/api/summary', (_request, response) => {
    response.json(getDashboardSummary(db))
  })

  if (existsSync(publicDir)) {
    app.use(express.static(publicDir))
    app.use((_request, response) => {
      response.sendFile(join(publicDir, 'index.html'))
    })
  } else {
    app.use((_request, response) => {
      response
        .status(503)
        .send('Dashboard assets are missing. Run `npm run build` first.')
    })
  }

  app.listen(options.port, options.host, () => {
    console.log(`Workout dashboard: http://${options.host}:${options.port}`)
    console.log(`Database: ${options.dbPath}`)
  })
}
