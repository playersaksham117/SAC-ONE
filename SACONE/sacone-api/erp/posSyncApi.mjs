import { applyPosCors } from './posSyncCors.mjs'
import { dispatchPosSyncRoute } from './posSyncRoutes.mjs'
import { validatePosApiKey } from './posSyncEngine.mjs'

export function extractApiKey(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim()
  const headerKey = req.headers?.['x-api-key'] || req.headers?.['X-API-Key']
  if (headerKey) return String(headerKey).trim()
  return null
}

export function sendPosJson(res, statusCode, payload) {
  applyPosCors(res)
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export function handlePosSyncHttp(req, res, body, urlPath, method) {
  const apiKey = extractApiKey(req)

  if (!validatePosApiKey(apiKey)) {
    sendPosJson(res, 401, { ok: false, error: 'Invalid or disabled POS API key' })
    return
  }

  try {
    const result = dispatchPosSyncRoute(
      urlPath || req.url || '',
      method || req.method || 'POST',
      body
    )
    sendPosJson(res, 200, result)
  } catch (error) {
    sendPosJson(res, 400, { ok: false, error: error.message || 'POS sync failed' })
  }
}
