import {
  acknowledgeProducts,
  downloadProducts,
  handlePosPing,
  importPosPayload,
  pendingProductCount,
  processStockEvents,
  touchLastSyncAt,
} from './posSyncEngine.mjs'

export function isPosSyncPath(url) {
  const path = url?.split('?')[0] || ''
  return (
    path === '/api/pos/sync' ||
    path === '/api/sync' ||
    path.startsWith('/api/v1/sync')
  )
}

function normalizePath(urlPath) {
  const path = (urlPath || '').split('?')[0]
  if (path === '/api/pos/sync' || path === '/api/sync') return '/api/v1/sync'
  return path
}

function parseQuery(urlPath) {
  const query = {}
  const idx = (urlPath || '').indexOf('?')
  if (idx === -1) return query
  const params = new URLSearchParams(urlPath.slice(idx + 1))
  for (const [key, value] of params.entries()) query[key] = value
  return query
}

function inferRouteFromBody(body, method) {
  if (method !== 'POST' || !body || typeof body !== 'object') return null
  if (body.ping) return 'ping'
  if (body.stock_events?.length) return 'push/stock-events'
  if (body.sales?.length) return 'push/sales'
  if (body.sale) return 'push/sales'
  if (body.products?.length) return 'push/products'
  if (body.customers?.length) return 'push/customers'
  if (body.payments?.length) return 'push/payments'
  if (body.returns?.length) return 'push/returns'
  return 'push'
}

export function dispatchPosSyncRoute(urlPath, method, body) {
  const path = normalizePath(urlPath)
  const query = parseQuery(urlPath)
  const upperMethod = (method || 'POST').toUpperCase()

  if (upperMethod === 'GET' && path.endsWith('/products/pending-count')) {
    return {
      ok: true,
      message: 'OK',
      ...pendingProductCount(query.since),
    }
  }

  if (upperMethod === 'GET' && path.endsWith('/products')) {
    return {
      ok: true,
      message: 'OK',
      ...downloadProducts({
        since: query.since,
        page: Number(query.page || 1),
        limit: Number(query.limit || 100),
      }),
    }
  }

  if (upperMethod !== 'POST') {
    throw new Error('Method not allowed')
  }

  let route = path.replace('/api/v1/sync', '').replace(/^\/+/, '')
  if (!route || route === path) {
    route = inferRouteFromBody(body, upperMethod) || 'push'
  }

  if (route === 'ping' || body?.ping) {
    return handlePosPing()
  }

  if (route === 'push/sales' || body?.sale || body?.sales) {
    const sales = body?.sale ? [body.sale] : body?.sales || []
    const result = importPosPayload({ sales }, { skipStockDeduction: true })
    touchLastSyncAt()
    return {
      ok: true,
      message: 'Sales received',
      uploaded: result.salesSynced,
      skipped: result.salesSkipped,
      ...result,
    }
  }

  if (route === 'push/stock-events' || body?.stock_events) {
    const result = processStockEvents(body?.stock_events || [])
    touchLastSyncAt()
    return {
      ok: true,
      message: 'Stock events processed',
      uploaded: result.processed,
      skipped: result.skipped,
      ...result,
    }
  }

  if (route === 'push/products' || body?.products) {
    const result = importPosPayload({ products: body?.products || [] })
    touchLastSyncAt()
    return {
      ok: true,
      message: 'Products received',
      uploaded: result.productsMerged,
      ...result,
    }
  }

  if (route === 'products/ack') {
    return acknowledgeProducts(body?.uuids || [])
  }

  if (route === 'push/customers' || body?.customers) {
    touchLastSyncAt()
    return {
      ok: true,
      message: 'Customers received',
      uploaded: (body?.customers || []).length,
    }
  }

  if (route === 'push/payments' || body?.payments) {
    touchLastSyncAt()
    return {
      ok: true,
      message: 'Payments received',
      uploaded: (body?.payments || []).length,
    }
  }

  if (route === 'push/returns' || body?.returns) {
    touchLastSyncAt()
    return {
      ok: true,
      message: 'Returns received',
      uploaded: (body?.returns || []).length,
    }
  }

  if (route === 'push') {
    if (body?.stock_events?.length) {
      processStockEvents(body.stock_events)
    }
    const result = importPosPayload(body, { skipStockDeduction: Boolean(body?.stock_events?.length) })
    touchLastSyncAt()
    return { ok: true, message: 'Bulk push received', ...result }
  }

  const manualImport = importPosPayload(body)
  if (manualImport.salesSynced > 0 || manualImport.salesSkipped > 0) touchLastSyncAt()
  return { ok: true, ...manualImport }
}
