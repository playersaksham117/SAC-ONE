/**
 * JSON (Phase 10 export) → MongoDB collection mapping strategy.
 */

export const ID_STRATEGY = {
  name: 'preserve_uuid',
  description: 'Keep SACONE string UUIDs as the document identity',
  mongoIdField: '_id',
  rules: [
    'Set MongoDB _id = source UUID string (do not generate ObjectId)',
    'Store the same value on document.id for API compatibility',
    'Foreign keys remain UUID strings (no DBRefs required)',
    'Reject import if _id collision with different payload checksum',
  ],
};

/** Ordered collections for dependency-safe import */
export const MONGO_COLLECTION_ORDER = [
  'companies',
  'roles',
  'users',
  'categories',
  'brands',
  'units',
  'products',
  'customers',
  'suppliers',
  'warehouses',
  'warehouse_locations',
  'inventory_movements',
  'stock_levels',
  'location_stock_levels',
  'pos_sales',
  'pos_sale_items',
  'pos_payments',
  'purchase_orders',
  'purchase_order_items',
  'supplier_bills',
  'supplier_bill_items',
  'supplier_payments',
  'system_settings',
];

/**
 * Map Phase 10 export `data` keys → MongoDB collection + transform notes.
 */
export const JSON_TO_MONGO_MAP = {
  company: {
    exportFile: 'company.json',
    collections: {
      companies: { collection: 'companies', idField: 'id' },
    },
  },
  products: {
    exportFile: 'products.json',
    collections: {
      categories: { collection: 'categories', idField: 'id' },
      brands: { collection: 'brands', idField: 'id' },
      units: { collection: 'units', idField: 'id' },
      products: {
        collection: 'products',
        idField: 'id',
        indexes: [
          { keys: { sku: 1 }, unique: true },
          { keys: { barcode: 1 }, unique: false, sparse: true },
          { keys: { web_store_published: 1, is_active: 1 } },
        ],
      },
    },
  },
  customers: {
    exportFile: 'customers.json',
    collections: {
      customers: {
        collection: 'customers',
        idField: 'id',
        indexes: [
          { keys: { code: 1 }, unique: true },
          { keys: { phone: 1 } },
          { keys: { source_channel: 1 } },
        ],
      },
    },
  },
  suppliers: {
    exportFile: 'suppliers.json',
    collections: {
      suppliers: { collection: 'suppliers', idField: 'id', indexes: [{ keys: { code: 1 }, unique: true }] },
    },
  },
  warehouses: {
    exportFile: 'warehouses.json',
    collections: {
      warehouses: { collection: 'warehouses', idField: 'id' },
      warehouse_locations: {
        collection: 'warehouse_locations',
        idField: 'id',
        indexes: [{ keys: { warehouse_id: 1, code: 1 }, unique: true }],
      },
    },
  },
  inventory_movements: {
    exportFile: 'inventory_movements.json',
    collections: {
      inventory_movements: {
        collection: 'inventory_movements',
        idField: 'id',
        indexes: [
          { keys: { product_id: 1, warehouse_id: 1, created_at: -1 } },
          { keys: { reference_type: 1, reference_id: 1 } },
        ],
        notes: 'Import BEFORE derived stock_levels; then rebuild stock cache if needed',
      },
    },
  },
  stock_levels: {
    exportFile: 'stock_levels.json',
    collections: {
      stock_levels: {
        collection: 'stock_levels',
        idField: 'id',
        indexes: [{ keys: { product_id: 1, warehouse_id: 1 }, unique: true }],
        notes: 'Derived cache — optional if rebuilt from inventory_movements',
      },
      location_stock_levels: {
        collection: 'location_stock_levels',
        idField: 'id',
        indexes: [{ keys: { product_id: 1, location_id: 1 }, unique: true }],
      },
    },
  },
  sales: {
    exportFile: 'sales.json',
    collections: {
      sales: { collection: 'pos_sales', idField: 'id', indexes: [{ keys: { invoice_number: 1 }, unique: true }] },
    },
  },
  sales_items: {
    exportFile: 'sales_items.json',
    collections: {
      sales_items: { collection: 'pos_sale_items', idField: 'id', indexes: [{ keys: { sale_id: 1 } }] },
    },
  },
  payments: {
    exportFile: 'payments.json',
    collections: {
      payments: { collection: 'pos_payments', idField: 'id', indexes: [{ keys: { sale_id: 1 } }] },
    },
  },
  supplier_bills: {
    exportFile: 'supplier_bills.json',
    collections: {
      supplier_bills: {
        collection: 'supplier_bills',
        idField: 'id',
        indexes: [{ keys: { bill_number: 1 }, unique: true }, { keys: { supplier_id: 1, bill_date: -1 } }],
      },
      supplier_bill_items: {
        collection: 'supplier_bill_items',
        idField: 'id',
        indexes: [{ keys: { bill_id: 1 } }],
      },
    },
  },
  supplier_payments: {
    exportFile: 'supplier_payments.json',
    collections: {
      supplier_payments: {
        collection: 'supplier_payments',
        idField: 'id',
        indexes: [{ keys: { supplier_id: 1, payment_date: -1 } }],
      },
    },
  },
  purchase_orders: {
    exportFile: 'purchase_orders.json',
    collections: {
      purchase_orders: {
        collection: 'purchase_orders',
        idField: 'id',
        indexes: [{ keys: { po_number: 1 }, unique: true }],
      },
      purchase_order_items: {
        collection: 'purchase_order_items',
        idField: 'id',
        indexes: [{ keys: { purchase_order_id: 1 } }],
      },
    },
  },
  system_settings: {
    exportFile: 'system_settings.json',
    collections: {
      system_settings: {
        collection: 'system_settings',
        idField: 'id',
        indexes: [{ keys: { key: 1 }, unique: true }],
      },
    },
  },
  users: {
    exportFile: 'users.json',
    collections: {
      roles: { collection: 'roles', idField: 'id' },
      users: {
        collection: 'users',
        idField: 'id',
        indexes: [{ keys: { email: 1 }, unique: true }],
        notes: 'password_hash is NOT in JSON export — reset passwords or use secure side-channel',
      },
    },
  },
};

/** Flat list of all mapped Mongo collections with indexes for ensureIndexes() */
export function listMappedIndexes() {
  const out = [];
  for (const map of Object.values(JSON_TO_MONGO_MAP)) {
    for (const spec of Object.values(map.collections)) {
      if (spec.indexes?.length) {
        out.push({ collection: spec.collection, indexes: spec.indexes });
      }
    }
  }
  return out;
}

export function snakeToCamelDocument(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = value;
  }
  return out;
}

/**
 * Prepare a MongoDB document from an exported row.
 * Preserves UUID as both _id and id.
 */
export function toMongoDocument(row, { idField = 'id' } = {}) {
  const id = row[idField] || row.id;
  if (!id) throw new Error('Row missing UUID id for MongoDB import');
  return {
    _id: id,
    ...row,
    id,
  };
}
