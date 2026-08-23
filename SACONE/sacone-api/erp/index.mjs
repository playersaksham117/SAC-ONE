import express from 'express'
import cors from 'cors'
import { getDb, resetDb, blankDb } from './db.mjs'
import { executeQuery, executeRpc } from './queryEngine.mjs'
import { handlePosSyncHttp } from './posSyncApi.mjs'
import { handlePosCorsPreflight } from './posSyncCors.mjs'
import { isPosSyncPath } from './posSyncRoutes.mjs'
import { handleRbacHttp } from './rbacApi.mjs'

const app = express()
const PORT = process.env.LOCAL_DB_PORT || 3001

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/db/health', (_req, res) => {
  getDb()
  res.json({ ok: true, mode: 'local-pg-mem' })
})

app.post('/api/db/query', (req, res) => {
  const result = executeQuery(req.body)
  res.json(result)
})

app.post('/api/db/rpc/:name', (req, res) => {
  const result = executeRpc(req.params.name, req.body || {})
  res.json(result)
})

app.post('/api/db/reset', (req, res) => {
  const blank = req.body?.mode === 'blank' || req.body?.blank === true
  if (blank) blankDb()
  else resetDb()
  res.json({
    ok: true,
    message: blank
      ? 'Database cleared — add your own products and warehouses'
      : 'Demo database reset with seed data',
  })
})

app.use((req, res, next) => {
  if (!isPosSyncPath(req.path)) return next()
  if (handlePosCorsPreflight(req, res)) return
  handlePosSyncHttp(req, res, req.body, req.originalUrl || req.path, req.method)
})

app.use('/api/rbac', (req, res) => {
  handleRbacHttp(req, res, req.body, req.path ? `/api/rbac${req.path}` : '/api/rbac', req.method, req.originalUrl)
})

app.listen(PORT, () => {
  getDb()
  console.log(`[local-pg] API running at http://localhost:${PORT}`)
})
