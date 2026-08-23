import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Phase 1 retail tables — suppliers, customers, PO, sales, ledger, reservations.
class RetailSchema {
  static Future<void> createTables(Database db) async {
    await _createSuppliersTable(db);
    await _createCustomersTable(db);
    await _createPurchaseOrdersTable(db);
    await _createPurchaseOrderLinesTable(db);
    await _createSalesInvoicesTable(db);
    await _createSaleLinesTable(db);
    await _createLedgerEntriesTable(db);
    await _createStockReservationsTable(db);
    await _migrateStocksReservedColumn(db);
    await _createRetailIndices(db);
    await _initializeRetailSequences(db);
  }

  static Future<void> _createSuppliersTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        contactPerson TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        gstin TEXT,
        creditLimit REAL NOT NULL DEFAULT 0,
        creditBalance REAL NOT NULL DEFAULT 0,
        paymentTermsDays INTEGER NOT NULL DEFAULT 30,
        isActive INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'local',
        serverId TEXT
      )
    ''');
  }

  static Future<void> _createCustomersTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        gstin TEXT,
        customerType TEXT NOT NULL DEFAULT 'retail',
        creditLimit REAL NOT NULL DEFAULT 0,
        outstandingBalance REAL NOT NULL DEFAULT 0,
        totalPurchases REAL NOT NULL DEFAULT 0,
        isActive INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'local',
        serverId TEXT
      )
    ''');
  }

  static Future<void> _createPurchaseOrdersTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        poNumber TEXT NOT NULL UNIQUE,
        supplierId TEXT NOT NULL,
        supplierName TEXT NOT NULL,
        warehouseId TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        orderDate TEXT NOT NULL,
        expectedDate TEXT,
        receivedDate TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        taxAmount REAL NOT NULL DEFAULT 0,
        discountAmount REAL NOT NULL DEFAULT 0,
        totalAmount REAL NOT NULL DEFAULT 0,
        paidAmount REAL NOT NULL DEFAULT 0,
        dueAmount REAL NOT NULL DEFAULT 0,
        invoiceNumber TEXT,
        notes TEXT,
        createdBy TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'local',
        serverId TEXT,
        FOREIGN KEY (supplierId) REFERENCES suppliers(id)
      )
    ''');
  }

  static Future<void> _createPurchaseOrderLinesTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS purchase_order_lines (
        id TEXT PRIMARY KEY,
        purchaseOrderId TEXT NOT NULL,
        itemId TEXT NOT NULL,
        itemName TEXT NOT NULL,
        sku TEXT NOT NULL,
        orderedQty REAL NOT NULL DEFAULT 0,
        receivedQty REAL NOT NULL DEFAULT 0,
        unitCost REAL NOT NULL DEFAULT 0,
        taxRate REAL NOT NULL DEFAULT 0,
        taxAmount REAL NOT NULL DEFAULT 0,
        lineTotal REAL NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (purchaseOrderId) REFERENCES purchase_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (itemId) REFERENCES inventory_items(id)
      )
    ''');
  }

  static Future<void> _createSalesInvoicesTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS sales_invoices (
        id TEXT PRIMARY KEY,
        invoiceNumber TEXT NOT NULL UNIQUE,
        customerId TEXT,
        customerName TEXT,
        customerPhone TEXT,
        customerGstin TEXT,
        warehouseId TEXT NOT NULL,
        invoiceDate TEXT NOT NULL,
        subtotal REAL NOT NULL DEFAULT 0,
        taxAmount REAL NOT NULL DEFAULT 0,
        discountAmount REAL NOT NULL DEFAULT 0,
        totalAmount REAL NOT NULL DEFAULT 0,
        paidAmount REAL NOT NULL DEFAULT 0,
        dueAmount REAL NOT NULL DEFAULT 0,
        paymentMode TEXT NOT NULL DEFAULT 'cash',
        paymentStatus TEXT NOT NULL DEFAULT 'paid',
        status TEXT NOT NULL DEFAULT 'completed',
        notes TEXT,
        createdBy TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'local',
        serverId TEXT,
        FOREIGN KEY (customerId) REFERENCES customers(id)
      )
    ''');
  }

  static Future<void> _createSaleLinesTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS sale_lines (
        id TEXT PRIMARY KEY,
        invoiceId TEXT NOT NULL,
        itemId TEXT NOT NULL,
        itemName TEXT NOT NULL,
        sku TEXT NOT NULL,
        barcode TEXT,
        quantity REAL NOT NULL DEFAULT 1,
        unitPrice REAL NOT NULL DEFAULT 0,
        taxRate REAL NOT NULL DEFAULT 0,
        taxAmount REAL NOT NULL DEFAULT 0,
        discountAmount REAL NOT NULL DEFAULT 0,
        lineTotal REAL NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (invoiceId) REFERENCES sales_invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (itemId) REFERENCES inventory_items(id)
      )
    ''');
  }

  static Future<void> _createLedgerEntriesTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id TEXT PRIMARY KEY,
        partyType TEXT NOT NULL,
        partyId TEXT NOT NULL,
        partyName TEXT NOT NULL,
        entryType TEXT NOT NULL,
        referenceType TEXT NOT NULL,
        referenceId TEXT NOT NULL,
        referenceNumber TEXT,
        debitAmount REAL NOT NULL DEFAULT 0,
        creditAmount REAL NOT NULL DEFAULT 0,
        balanceAfter REAL NOT NULL DEFAULT 0,
        paymentMode TEXT,
        notes TEXT,
        entryDate TEXT NOT NULL,
        createdBy TEXT,
        createdAt TEXT NOT NULL,
        syncStatus TEXT NOT NULL DEFAULT 'local'
      )
    ''');
  }

  static Future<void> _createStockReservationsTable(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS stock_reservations (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        warehouseId TEXT NOT NULL,
        stockId TEXT,
        quantity REAL NOT NULL DEFAULT 0,
        referenceType TEXT NOT NULL,
        referenceId TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        expiresAt TEXT,
        createdAt TEXT NOT NULL,
        releasedAt TEXT,
        FOREIGN KEY (itemId) REFERENCES inventory_items(id),
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id)
      )
    ''');
  }

  static Future<void> _migrateStocksReservedColumn(Database db) async {
    final info = await db.rawQuery('PRAGMA table_info(stocks)');
    final columns = info.map((c) => c['name'] as String).toList();
    if (!columns.contains('reservedQty')) {
      await db.execute(
        'ALTER TABLE stocks ADD COLUMN reservedQty REAL NOT NULL DEFAULT 0',
      );
    }
  }

  static Future<void> _createRetailIndices(Database db) async {
    await db.execute('CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(code)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_suppliers_gstin ON suppliers(gstin)');

    await db.execute('CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)');

    await db.execute('CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplierId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_orders(orderDate)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_po_lines_po ON purchase_order_lines(purchaseOrderId)');

    await db.execute('CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales_invoices(customerId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_invoices(invoiceDate)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sales_status ON sales_invoices(paymentStatus)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sale_lines_invoice ON sale_lines(invoiceId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_sale_lines_item ON sale_lines(itemId)');

    await db.execute('CREATE INDEX IF NOT EXISTS idx_ledger_party ON ledger_entries(partyType, partyId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(entryDate)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_ledger_ref ON ledger_entries(referenceType, referenceId)');

    await db.execute('CREATE INDEX IF NOT EXISTS idx_reservations_item ON stock_reservations(itemId, warehouseId)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_reservations_ref ON stock_reservations(referenceType, referenceId)');
  }

  static Future<void> _initializeRetailSequences(Database db) async {
    final now = DateTime.now().toIso8601String();
    final sequences = [
      {'name': 'PO', 'prefix': 'PO', 'padding': 6},
      {'name': 'SALE', 'prefix': 'INV', 'padding': 6},
      {'name': 'SUPPLIER', 'prefix': 'SUP', 'padding': 4},
      {'name': 'CUSTOMER', 'prefix': 'CUS', 'padding': 4},
    ];

    for (final seq in sequences) {
      await db.execute('''
        INSERT OR IGNORE INTO sequences (name, prefix, currentValue, padding, updatedAt)
        VALUES (?, ?, 1000, ?, ?)
      ''', [seq['name'], seq['prefix'], seq['padding'], now]);
    }
  }
}
