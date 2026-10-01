export const MOVEMENT_TYPES = {
  OPENING_STOCK: 'opening_stock',
  PURCHASE: 'purchase',
  POS_SALE: 'pos_sale',
  SALES_RETURN: 'sales_return',
  PURCHASE_RETURN: 'purchase_return',
  ADJUSTMENT_INCREASE: 'adjustment_increase',
  ADJUSTMENT_DECREASE: 'adjustment_decrease',
  TRANSFER_OUT: 'transfer_out',
  TRANSFER_IN: 'transfer_in',
  RESERVED_STOCK: 'reserved_stock',
  RELEASED_STOCK: 'released_stock',
};

export const MOVEMENT_TYPE_META = {
  opening_stock: { label: 'Opening Stock', direction: 'in', affectsOnHand: true, affectsReserved: false, requiresApproval: false },
  purchase: { label: 'Purchase', direction: 'in', affectsOnHand: true, affectsReserved: false, requiresApproval: false },
  pos_sale: { label: 'POS Sale', direction: 'out', affectsOnHand: true, affectsReserved: false, requiresApproval: false },
  sales_return: { label: 'Sales Return', direction: 'in', affectsOnHand: true, affectsReserved: false, requiresApproval: false },
  purchase_return: { label: 'Purchase Return', direction: 'out', affectsOnHand: true, affectsReserved: false, requiresApproval: false },
  adjustment_increase: { label: 'Stock Adjustment Increase', direction: 'in', affectsOnHand: true, affectsReserved: false, requiresApproval: true },
  adjustment_decrease: { label: 'Stock Adjustment Decrease', direction: 'out', affectsOnHand: true, affectsReserved: false, requiresApproval: true },
  transfer_out: { label: 'Warehouse Transfer Out', direction: 'out', affectsOnHand: true, affectsReserved: false, requiresApproval: false },
  transfer_in: { label: 'Warehouse Transfer In', direction: 'in', affectsOnHand: true, affectsReserved: false, requiresApproval: false },
  reserved_stock: { label: 'Reserved Stock', direction: 'reserve', affectsOnHand: false, affectsReserved: true, requiresApproval: false },
  released_stock: { label: 'Released Stock', direction: 'release', affectsOnHand: false, affectsReserved: true, requiresApproval: false },
};

export const MOVEMENT_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/** Statuses that have already been applied to stock_levels */
export const APPLIED_STATUSES = new Set(['completed']);

/**
 * Movement types allowed from the Inventory UI "Record Movement" form.
 * POS/transfer/reserve types must go through their own modules.
 */
export const MANUAL_MOVEMENT_TYPES = [
  MOVEMENT_TYPES.OPENING_STOCK,
  MOVEMENT_TYPES.PURCHASE,
  MOVEMENT_TYPES.PURCHASE_RETURN,
  MOVEMENT_TYPES.SALES_RETURN,
  MOVEMENT_TYPES.ADJUSTMENT_INCREASE,
  MOVEMENT_TYPES.ADJUSTMENT_DECREASE,
];

export const ADJUSTMENT_MOVEMENT_TYPES = new Set([
  MOVEMENT_TYPES.ADJUSTMENT_INCREASE,
  MOVEMENT_TYPES.ADJUSTMENT_DECREASE,
]);
