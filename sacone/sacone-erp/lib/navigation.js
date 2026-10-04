/**
 * Single source of truth for SACONE ERP navigation.
 * Used by: home landing, sidebar, breadcrumbs, route guards.
 */

export const NAV_SECTIONS = [
  {
    id: 'operations',
    label: 'Operations',
    cardTitle: 'OPERATIONS',
    cardDescription: 'Purchases, products, stock, warehouse and SAC-POS phones.',
    cardIcon: '⚙️',
    cardAccent: 'from-blue-500 to-indigo-600',
    tone: 'blue',
  },
  {
    id: 'business',
    label: 'Business',
    cardTitle: 'BUSINESS',
    cardDescription: 'Customers & suppliers, banking, commissions and reports.',
    cardIcon: '📈',
    cardAccent: 'from-emerald-500 to-teal-600',
    tone: 'emerald',
  },
  {
    id: 'administration',
    label: 'Administration',
    cardTitle: 'ADMINISTRATION',
    cardDescription: 'Users, security, company setup, and system configuration.',
    cardIcon: '🛡️',
    cardAccent: 'from-violet-500 to-purple-600',
    tone: 'violet',
  },
];

export const ERP_MODULES = [
  // ── OPERATIONS ──────────────────────────────────────────
  {
    id: 'pos-devices',
    section: 'operations',
    label: 'POS Devices & Sync',
    description: 'SAC-POS phones, device keys and sync inbox',
    href: '/admin/pos-devices',
    permission: 'pos.devices.view',
    icon: '📲',
    placeholder: false,
  },
  {
    id: 'sales',
    section: 'operations',
    label: 'Sales',
    description: 'Invoices: print receipts / A5 / A4, PDF and CSV',
    href: '/operations/sales',
    permission: 'pos.sales.view',
    permissions: ['pos.sales.view', 'sales.orders.view'],
    icon: '💰',
    placeholder: false,
  },
  {
    id: 'purchases',
    section: 'operations',
    label: 'Purchases',
    description: 'Purchase orders and supplier bills',
    href: '/operations/purchases',
    permission: 'purchases.orders.view',
    icon: '📦',
    placeholder: false,
  },
  {
    id: 'products',
    section: 'operations',
    label: 'Products',
    description: 'Central product master',
    href: '/operations/products',
    permission: 'products.products.view',
    icon: '🏷️',
    placeholder: false,
  },
  {
    id: 'inventory',
    section: 'operations',
    label: 'Inventory',
    description: 'Stock levels and movements',
    href: '/operations/inventory',
    permission: 'inventory.stock.view',
    permissions: [
      'inventory.stock.view',
      'inventory.movements.view',
      'inventory.adjustments.view',
    ],
    icon: '📊',
    placeholder: false,
  },
  {
    id: 'warehouse',
    section: 'operations',
    label: 'Warehouse',
    description: 'Warehouses, locations, and transfers',
    href: '/operations/warehouse',
    permission: 'warehouse.warehouses.view',
    icon: '🏭',
    placeholder: false,
  },

  // ── BUSINESS ──────────────────────────────────────────
  {
    id: 'crm',
    section: 'business',
    label: 'Customers & Suppliers',
    description: 'Customer/supplier master, receipts, payments, statements',
    href: '/business/crm',
    permission: 'parties.customers.view',
    permissions: ['parties.customers.view', 'parties.suppliers.view'],
    icon: '🤝',
    placeholder: false,
  },
  {
    id: 'finance',
    section: 'business',
    label: 'Banking & Cash',
    description: 'Cash/bank/UPI books, bank import, party payments, accounts',
    href: '/business/finance',
    permission: 'finance.ledger.view',
    icon: '🏦',
    placeholder: false,
  },
  {
    id: 'commissions',
    section: 'business',
    label: 'Sales Agents & Commissions',
    description: 'Agents, commission ledger, payments and performance',
    href: '/business/commissions',
    permission: 'sales.agents.view',
    permissions: ['sales.agents.view', 'sales.commissions.view', 'sales.commission_reports.view'],
    icon: '🎯',
    placeholder: false,
  },
  {
    id: 'reports',
    section: 'business',
    label: 'Reports',
    description: 'Module reports hub and upcoming exports',
    href: '/business/reports',
    permission: 'reports.reports.view',
    icon: '📑',
    placeholder: false,
  },

  // ── ADMINISTRATION ──────────────────────────────────────
  {
    id: 'users',
    section: 'administration',
    label: 'Users',
    description: 'Manage team members',
    href: '/admin/users',
    permission: 'core.users.view',
    icon: '👥',
    placeholder: false,
  },
  {
    id: 'roles',
    section: 'administration',
    label: 'Roles and Permissions',
    description: 'Access control and approval rules',
    href: '/admin/roles',
    permission: 'core.roles.view',
    icon: '🔐',
    placeholder: false,
  },
  {
    id: 'approval-rules',
    section: 'administration',
    label: 'Approval Rules',
    description: 'Configurable authorization thresholds',
    href: '/admin/approval-rules',
    permission: 'core.approvals.view',
    icon: '📋',
    placeholder: false,
  },
  {
    id: 'company',
    section: 'administration',
    label: 'Company Settings',
    description: 'Business profile and GST',
    href: '/admin/company',
    permission: 'core.company.view',
    icon: '🏢',
    placeholder: false,
  },
  {
    id: 'approvals',
    section: 'administration',
    label: 'Approvals',
    description: 'Pending approval queue',
    href: '/admin/approvals',
    permission: 'core.approvals.view',
    icon: '✅',
    placeholder: false,
  },
  {
    id: 'audit',
    section: 'administration',
    label: 'Audit Logs',
    description: 'System activity trail',
    href: '/admin/audit',
    permission: 'core.audit_log.view',
    icon: '📝',
    placeholder: false,
  },
  {
    id: 'opening-balances',
    section: 'administration',
    label: 'Opening Stock & Balances',
    description: 'Go-live stock, customer dues, supplier payables, cash & bank',
    href: '/admin/opening-balances',
    permission: 'inventory.movements.create',
    permissions: ['inventory.movements.create', 'parties.customers.edit', 'parties.suppliers.edit', 'finance.ledger.edit'],
    icon: '🧾',
    placeholder: false,
  },
  {
    id: 'api-keys',
    section: 'administration',
    label: 'Web Store API',
    description: 'API keys and integration logs',
    href: '/admin/api-keys',
    permission: 'webstore.api_settings.view',
    icon: '🔗',
    placeholder: false,
  },
  {
    id: 'settings',
    section: 'administration',
    label: 'System Settings',
    description: 'Application configuration',
    href: '/admin/settings',
    permission: 'core.system_settings.view',
    icon: '⚙️',
    placeholder: false,
  },
  {
    id: 'document-numbering',
    section: 'administration',
    label: 'Document Numbering',
    description: 'Firm prefix, FY series, quotation & invoice formats',
    href: '/admin/document-numbering',
    permission: 'core.document_numbering.view',
    icon: '🔢',
    placeholder: false,
  },
];

/** Modules offered as shortcuts on Home until the user has opened some themselves. */
export const QUICK_ACCESS_DEFAULTS = ['products', 'inventory', 'purchases', 'crm', 'finance', 'warehouse'];

/**
 * CEO Dashboard and Income & Expense live in a separate web app (sacone-owner, :3001).
 * POS billing lives only in the SAC-POS mobile app.
 */
export const OWNER_PERMISSIONS = ['reports.ceo_dashboard.view', 'finance.ledger.view'];

/** Home page always accessible after login */
export const HOME_PERMISSION = 'core.dashboard.view';

export function canViewModule(checkPermission, module) {
  if (Array.isArray(module.permissions) && module.permissions.length) {
    return module.permissions.some((key) => checkPermission(key));
  }
  return checkPermission(module.permission);
}

export function getVisibleModules(checkPermission) {
  return ERP_MODULES.filter((m) => canViewModule(checkPermission, m));
}

export function getVisibleSections(checkPermission) {
  return NAV_SECTIONS.map((section) => {
    const modules = ERP_MODULES.filter(
      (m) => m.section === section.id && canViewModule(checkPermission, m)
    );
    return { ...section, modules };
  }).filter((section) => section.modules.length > 0);
}

/** Flat list for sidebar — grouped by section */
export function getSidebarNavigation(checkPermission) {
  return getVisibleSections(checkPermission).map((section) => ({
    id: section.id,
    label: section.label,
    items: section.modules.map((m) => ({
      href: m.href,
      label: m.label,
      icon: m.icon,
      permission: m.permission,
    })),
  }));
}

/** Case-insensitive search over label, description and section name. */
export function searchModules(modules, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return modules;
  return modules.filter((m) => {
    const section = NAV_SECTIONS.find((s) => s.id === m.section);
    const haystack = `${m.label} ${m.description} ${section?.label || ''}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}

export function findModuleByPath(pathname) {
  const matches = ERP_MODULES.filter(
    (m) => pathname === m.href || pathname.startsWith(`${m.href}/`)
  );
  if (!matches.length) return null;
  return matches.sort((a, b) => b.href.length - a.href.length)[0];
}

export function findSectionByModuleId(moduleId) {
  const mod = ERP_MODULES.find((m) => m.id === moduleId);
  if (!mod) return null;
  return NAV_SECTIONS.find((s) => s.id === mod.section);
}

export function getModulePermission(href) {
  return ERP_MODULES.find((m) => m.href === href || href.startsWith(m.href))?.permission;
}

/** Legacy route redirects (Phase 1 paths → Phase 2 admin paths) */
export const LEGACY_REDIRECTS = {
  '/users': '/admin/users',
  '/roles': '/admin/roles',
  '/company': '/admin/company',
  '/audit': '/admin/audit',
};
