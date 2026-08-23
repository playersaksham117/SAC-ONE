export const POS_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, X-API-Key, X-Device-Id, X-Warehouse',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function applyPosCors(res) {
  for (const [key, value] of Object.entries(POS_CORS_HEADERS)) {
    res.setHeader(key, value)
  }
}

export function handlePosCorsPreflight(req, res) {
  if (req.method !== 'OPTIONS') return false
  applyPosCors(res)
  res.statusCode = 204
  res.end()
  return true
}
