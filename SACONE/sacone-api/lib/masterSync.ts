import prisma from '@/lib/db'

/** Upsert web-store customer (local SQLite / shared master when Postgres is enabled). */
export async function upsertMasterCustomer(input: {
  name: string
  phone: string
  email?: string | null
  company?: string | null
  address?: string | null
  gstNumber?: string | null
}) {
  const phone = input.phone.trim()
  if (!phone) return null

  return prisma.customer.upsert({
    where: { phone },
    create: {
      name: input.name,
      phone,
      email: input.email || undefined,
      company: input.company || undefined,
      address: input.address || undefined,
      gstNumber: input.gstNumber || undefined,
      source: 'webstore',
    },
    update: {
      name: input.name || undefined,
      email: input.email || undefined,
      company: input.company || undefined,
      address: input.address || undefined,
      gstNumber: input.gstNumber || undefined,
    },
  })
}

/**
 * Sync ERP inventory → store products (Control Center catalog).
 * Reads the live ERP master (Postgres / pg-mem) and upserts Prisma products.
 */
export async function syncProductsFromErpInventory() {
  const { fetchErpInventoryItems, fetchErpStockByItem } = await import(
    '@/lib/erpInventory'
  )

  let items
  let stockMap: Map<string, number>
  try {
    items = fetchErpInventoryItems()
    stockMap = fetchErpStockByItem()
  } catch (err) {
    console.warn('[masterSync] ERP inventory unavailable — sync skipped', err)
    throw new Error(
      'ERP inventory is not reachable. Start sacone-api and confirm the ERP database is up.'
    )
  }

  const image =
    'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&h=400&fit=crop'

  let synced = 0
  for (const item of items) {
    if (!item?.sku) continue
    const price = Math.round(Number(item.selling_price) || 0)
    const stockCount = Math.max(0, Math.round(stockMap.get(item.id) || 0))
    const availability =
      stockCount <= 0 ? 'out_of_stock' : stockCount <= 10 ? 'low_stock' : 'in_stock'

    await prisma.product.upsert({
      where: { sku: item.sku },
      update: {
        erpItemId: item.id,
        name: item.name,
        brand: item.brand || 'Generic',
        category: item.category || 'General',
        price,
        stockCount,
        availability,
        description: item.description || item.name,
        storeBrand: 'sacvolt',
      },
      create: {
        id: item.id,
        erpItemId: item.id,
        storeBrand: 'sacvolt',
        name: item.name,
        brand: item.brand || 'Generic',
        category: item.category || 'General',
        price,
        sku: item.sku,
        availability,
        stockCount,
        lowStockThreshold: 10,
        image,
        images: JSON.stringify([image]),
        description: item.description || item.name,
        specifications: JSON.stringify({ sku: item.sku }),
        rating: 0,
        reviewCount: 0,
        featured: false,
      },
    })
    synced++
  }

  return synced
}
