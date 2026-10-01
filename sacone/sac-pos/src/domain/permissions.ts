/**
 * SAC-POS capabilities mapped onto SACONE ERP permission keys.
 * Roles & permissions are managed ONLY in the ERP (Administration → Roles and Permissions);
 * the app reads the logged-in user's permission list and gates every screen/action.
 * The server re-checks the same keys when records sync (defence in depth).
 */
export const P = {
  terminal: 'pos.terminal.view',
  sell: 'pos.sales.create',
  viewSales: 'pos.sales.view',
  returns: 'pos.returns.create',
  priceOverride: 'pos.pricing.edit',
  customersView: 'parties.customers.view',
  customersCreate: 'parties.customers.create',
  collectPayment: 'parties.customer_receipts.create',
  stockView: 'inventory.stock.view',
  productsView: 'products.products.view',
  deviceAdmin: 'pos.devices.edit',
} as const;

export type Capability =
  | 'useTerminal'
  | 'sell'
  | 'viewSales'
  | 'returns'
  | 'overridePrice'
  | 'viewCustomers'
  | 'createCustomers'
  | 'collectPayment'
  | 'viewStock'
  | 'manageDevice';

const RULES: Record<Capability, string[]> = {
  useTerminal: [P.terminal],
  sell: [P.sell],
  viewSales: [P.viewSales, P.sell],
  returns: [P.returns],
  overridePrice: [P.priceOverride],
  viewCustomers: [P.customersView],
  createCustomers: [P.customersCreate],
  collectPayment: [P.collectPayment],
  viewStock: [P.stockView, P.productsView],
  manageDevice: [P.deviceAdmin],
};

/** true when the permission list grants ANY of the keys behind the capability. */
export function can(permissions: readonly string[] | null | undefined, capability: Capability): boolean {
  if (!permissions?.length) return false;
  if (permissions.includes('*')) return true;
  return RULES[capability].some((key) => permissions.includes(key));
}

export const CAPABILITY_LABELS: Record<Capability, string> = {
  useTerminal: 'Use POS terminal',
  sell: 'Create sales',
  viewSales: 'View sales',
  returns: 'Process returns',
  overridePrice: 'Change price / give discount',
  viewCustomers: 'View customers',
  createCustomers: 'Add customers',
  collectPayment: 'Collect customer payments',
  viewStock: 'View stock',
  manageDevice: 'Manage device pairing',
};
