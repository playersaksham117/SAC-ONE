from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///tracinvent.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Enable CORS for Flutter desktop app
CORS(app, resources={r"/api/*": {"origins": "*"}})

db = SQLAlchemy(app)

# ==================== MODELS ====================

class InventoryItem(db.Model):
    __tablename__ = 'inventory_items'
    
    id = db.Column(db.String(36), primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    sku = db.Column(db.String(100), unique=True, nullable=False)
    barcode = db.Column(db.String(100))
    category = db.Column(db.String(100), nullable=False)
    unit = db.Column(db.String(50), nullable=False)
    reorder_level = db.Column(db.Float, default=0)
    min_stock_level = db.Column(db.Float, default=0)
    cost_price = db.Column(db.Float, default=0)
    selling_price = db.Column(db.Float, default=0)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = db.Column(db.DateTime)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'sku': self.sku,
            'barcode': self.barcode,
            'category': self.category,
            'unit': self.unit,
            'reorderLevel': self.reorder_level,
            'minStockLevel': self.min_stock_level,
            'costPrice': self.cost_price,
            'sellingPrice': self.selling_price,
            'description': self.description,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'deletedAt': self.deleted_at.isoformat() if self.deleted_at else None,
        }

class Warehouse(db.Model):
    __tablename__ = 'warehouses'
    
    id = db.Column(db.String(36), primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    code = db.Column(db.String(50), unique=True, nullable=False)
    address = db.Column(db.Text)
    city = db.Column(db.String(100))
    state = db.Column(db.String(100))
    country = db.Column(db.String(100))
    postal_code = db.Column(db.String(20))
    phone = db.Column(db.String(20))
    email = db.Column(db.String(255))
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = db.Column(db.DateTime)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'code': self.code,
            'address': self.address,
            'city': self.city,
            'state': self.state,
            'country': self.country,
            'postalCode': self.postal_code,
            'phone': self.phone,
            'email': self.email,
            'isActive': self.is_active,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'deletedAt': self.deleted_at.isoformat() if self.deleted_at else None,
        }

class Stock(db.Model):
    __tablename__ = 'stock'
    
    id = db.Column(db.String(36), primary_key=True)
    item_id = db.Column(db.String(36), db.ForeignKey('inventory_items.id'), nullable=False)
    warehouse_id = db.Column(db.String(36), db.ForeignKey('warehouses.id'), nullable=False)
    location_id = db.Column(db.String(36))
    quantity = db.Column(db.Float, default=0)
    batch_number = db.Column(db.String(100))
    expiry_date = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'itemId': self.item_id,
            'warehouseId': self.warehouse_id,
            'locationId': self.location_id,
            'quantity': self.quantity,
            'batchNumber': self.batch_number,
            'expiryDate': self.expiry_date.isoformat() if self.expiry_date else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
        }

class Transaction(db.Model):
    __tablename__ = 'transactions'
    
    id = db.Column(db.String(36), primary_key=True)
    item_id = db.Column(db.String(36), db.ForeignKey('inventory_items.id'), nullable=False)
    warehouse_id = db.Column(db.String(36), db.ForeignKey('warehouses.id'), nullable=False)
    type = db.Column(db.String(50), nullable=False)  # purchase, sale, transfer, adjustment
    quantity = db.Column(db.Float, nullable=False)
    reference = db.Column(db.String(100))
    notes = db.Column(db.Text)
    transaction_date = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'itemId': self.item_id,
            'warehouseId': self.warehouse_id,
            'type': self.type,
            'quantity': self.quantity,
            'reference': self.reference,
            'notes': self.notes,
            'transactionDate': self.transaction_date.isoformat() if self.transaction_date else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
        }

# ==================== API ROUTES ====================

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})

# ========== Inventory Items ==========

@app.route('/api/inventory', methods=['GET'])
def get_inventory_items():
    since = request.args.get('since')
    query = InventoryItem.query.filter(InventoryItem.deleted_at.is_(None))
    
    if since:
        try:
            since_date = datetime.fromisoformat(since.replace('Z', '+00:00'))
            query = query.filter(InventoryItem.updated_at > since_date)
        except ValueError:
            pass
    
    items = query.all()
    return jsonify([item.to_dict() for item in items])

@app.route('/api/inventory/<item_id>', methods=['GET'])
def get_inventory_item(item_id):
    item = InventoryItem.query.get_or_404(item_id)
    return jsonify(item.to_dict())

@app.route('/api/inventory', methods=['POST'])
def create_inventory_item():
    data = request.json
    item = InventoryItem(
        id=data['id'],
        name=data['name'],
        sku=data['sku'],
        barcode=data.get('barcode'),
        category=data['category'],
        unit=data['unit'],
        reorder_level=data.get('reorderLevel', 0),
        min_stock_level=data.get('minStockLevel', 0),
        cost_price=data.get('costPrice', 0),
        selling_price=data.get('sellingPrice', 0),
        description=data.get('description'),
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201

@app.route('/api/inventory/<item_id>', methods=['PUT'])
def update_inventory_item(item_id):
    item = InventoryItem.query.get_or_404(item_id)
    data = request.json
    
    item.name = data.get('name', item.name)
    item.sku = data.get('sku', item.sku)
    item.barcode = data.get('barcode', item.barcode)
    item.category = data.get('category', item.category)
    item.unit = data.get('unit', item.unit)
    item.reorder_level = data.get('reorderLevel', item.reorder_level)
    item.min_stock_level = data.get('minStockLevel', item.min_stock_level)
    item.cost_price = data.get('costPrice', item.cost_price)
    item.selling_price = data.get('sellingPrice', item.selling_price)
    item.description = data.get('description', item.description)
    item.updated_at = datetime.utcnow()
    
    db.session.commit()
    return jsonify(item.to_dict())

@app.route('/api/inventory/<item_id>', methods=['DELETE'])
def delete_inventory_item(item_id):
    item = InventoryItem.query.get_or_404(item_id)
    item.deleted_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Item deleted'}), 200

# ========== Warehouses ==========

@app.route('/api/warehouses', methods=['GET'])
def get_warehouses():
    since = request.args.get('since')
    query = Warehouse.query.filter(Warehouse.deleted_at.is_(None))
    
    if since:
        try:
            since_date = datetime.fromisoformat(since.replace('Z', '+00:00'))
            query = query.filter(Warehouse.updated_at > since_date)
        except ValueError:
            pass
    
    warehouses = query.all()
    return jsonify([wh.to_dict() for wh in warehouses])

@app.route('/api/warehouses', methods=['POST'])
def create_warehouse():
    data = request.json
    warehouse = Warehouse(
        id=data['id'],
        name=data['name'],
        code=data['code'],
        address=data.get('address'),
        city=data.get('city'),
        state=data.get('state'),
        country=data.get('country'),
        postal_code=data.get('postalCode'),
        phone=data.get('phone'),
        email=data.get('email'),
        is_active=data.get('isActive', True),
    )
    db.session.add(warehouse)
    db.session.commit()
    return jsonify(warehouse.to_dict()), 201

@app.route('/api/warehouses/<warehouse_id>', methods=['PUT'])
def update_warehouse(warehouse_id):
    warehouse = Warehouse.query.get_or_404(warehouse_id)
    data = request.json
    
    warehouse.name = data.get('name', warehouse.name)
    warehouse.code = data.get('code', warehouse.code)
    warehouse.address = data.get('address', warehouse.address)
    warehouse.city = data.get('city', warehouse.city)
    warehouse.state = data.get('state', warehouse.state)
    warehouse.country = data.get('country', warehouse.country)
    warehouse.postal_code = data.get('postalCode', warehouse.postal_code)
    warehouse.phone = data.get('phone', warehouse.phone)
    warehouse.email = data.get('email', warehouse.email)
    warehouse.is_active = data.get('isActive', warehouse.is_active)
    warehouse.updated_at = datetime.utcnow()
    
    db.session.commit()
    return jsonify(warehouse.to_dict())

@app.route('/api/warehouses/<warehouse_id>', methods=['DELETE'])
def delete_warehouse(warehouse_id):
    warehouse = Warehouse.query.get_or_404(warehouse_id)
    warehouse.deleted_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Warehouse deleted'}), 200

# ========== Stock ==========

@app.route('/api/stock', methods=['GET'])
def get_stock():
    since = request.args.get('since')
    query = Stock.query
    
    if since:
        try:
            since_date = datetime.fromisoformat(since.replace('Z', '+00:00'))
            query = query.filter(Stock.updated_at > since_date)
        except ValueError:
            pass
    
    stocks = query.all()
    return jsonify([stock.to_dict() for stock in stocks])

@app.route('/api/stock', methods=['POST'])
def create_stock():
    data = request.json
    stock = Stock(
        id=data['id'],
        item_id=data['itemId'],
        warehouse_id=data['warehouseId'],
        location_id=data.get('locationId'),
        quantity=data.get('quantity', 0),
        batch_number=data.get('batchNumber'),
        expiry_date=datetime.fromisoformat(data['expiryDate']) if data.get('expiryDate') else None,
    )
    db.session.add(stock)
    db.session.commit()
    return jsonify(stock.to_dict()), 201

@app.route('/api/stock/<stock_id>', methods=['PUT'])
def update_stock(stock_id):
    stock = Stock.query.get_or_404(stock_id)
    data = request.json
    
    stock.quantity = data.get('quantity', stock.quantity)
    stock.batch_number = data.get('batchNumber', stock.batch_number)
    stock.expiry_date = datetime.fromisoformat(data['expiryDate']) if data.get('expiryDate') else stock.expiry_date
    stock.updated_at = datetime.utcnow()
    
    db.session.commit()
    return jsonify(stock.to_dict())

# ========== Transactions ==========

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    since = request.args.get('since')
    query = Transaction.query
    
    if since:
        try:
            since_date = datetime.fromisoformat(since.replace('Z', '+00:00'))
            query = query.filter(Transaction.created_at > since_date)
        except ValueError:
            pass
    
    transactions = query.order_by(Transaction.created_at.desc()).all()
    return jsonify([txn.to_dict() for txn in transactions])

@app.route('/api/transactions', methods=['POST'])
def create_transaction():
    data = request.json
    transaction = Transaction(
        id=data['id'],
        item_id=data['itemId'],
        warehouse_id=data['warehouseId'],
        type=data['type'],
        quantity=data['quantity'],
        reference=data.get('reference'),
        notes=data.get('notes'),
        transaction_date=datetime.fromisoformat(data['transactionDate']) if data.get('transactionDate') else datetime.utcnow(),
    )
    db.session.add(transaction)
    db.session.commit()
    return jsonify(transaction.to_dict()), 201

# ========== Sync Endpoint ==========

@app.route('/api/sync', methods=['POST'])
def sync_data():
    """
    Bulk sync endpoint that accepts changes from client and returns server changes
    """
    data = request.json
    last_sync = data.get('lastSync')
    client_changes = data.get('changes', {})
    
    # Process client changes
    for item_data in client_changes.get('inventory', []):
        item = InventoryItem.query.get(item_data['id'])
        if item:
            # Update existing
            for key, value in item_data.items():
                if hasattr(item, key):
                    setattr(item, key, value)
        else:
            # Create new
            item = InventoryItem(**item_data)
            db.session.add(item)
    
    for warehouse_data in client_changes.get('warehouses', []):
        warehouse = Warehouse.query.get(warehouse_data['id'])
        if warehouse:
            for key, value in warehouse_data.items():
                if hasattr(warehouse, key):
                    setattr(warehouse, key, value)
        else:
            warehouse = Warehouse(**warehouse_data)
            db.session.add(warehouse)
    
    db.session.commit()
    
    # Get server changes since last sync
    server_changes = {}
    
    if last_sync:
        since_date = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
        
        inventory_changes = InventoryItem.query.filter(
            InventoryItem.updated_at > since_date
        ).all()
        server_changes['inventory'] = [item.to_dict() for item in inventory_changes]
        
        warehouse_changes = Warehouse.query.filter(
            Warehouse.updated_at > since_date
        ).all()
        server_changes['warehouses'] = [wh.to_dict() for wh in warehouse_changes]
        
        stock_changes = Stock.query.filter(
            Stock.updated_at > since_date
        ).all()
        server_changes['stock'] = [stock.to_dict() for stock in stock_changes]
        
        transaction_changes = Transaction.query.filter(
            Transaction.created_at > since_date
        ).all()
        server_changes['transactions'] = [txn.to_dict() for txn in transaction_changes]
    
    return jsonify({
        'success': True,
        'timestamp': datetime.utcnow().isoformat(),
        'changes': server_changes
    })

# ==================== INITIALIZATION ====================

def init_db():
    with app.app_context():
        db.create_all()
        print("Database initialized!")

if __name__ == '__main__':
    init_db()
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
