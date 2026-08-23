export type AdminRole = "SUPER_ADMIN" | "MANAGER" | "STAFF";

export const ADMIN_ROLES: AdminRole[] = ["SUPER_ADMIN", "MANAGER", "STAFF"];

export const ROLE_HIERARCHY: Record<AdminRole, number> = {
  SUPER_ADMIN: 3,
  MANAGER: 2,
  STAFF: 1,
};

export type Permission =
  | "dashboard:view"
  | "products:view"
  | "products:write"
  | "products:delete"
  | "customers:view"
  | "customers:write"
  | "quotes:view"
  | "quotes:write"
  | "quotes:convert"
  | "orders:view"
  | "orders:write"
  | "reports:view"
  | "users:manage"
  | "settings:view"
  | "settings:write"
  | "settings:admin";

const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  SUPER_ADMIN: [
    "dashboard:view",
    "products:view",
    "products:write",
    "products:delete",
    "customers:view",
    "customers:write",
    "quotes:view",
    "quotes:write",
    "quotes:convert",
    "orders:view",
    "orders:write",
    "reports:view",
    "users:manage",
    "settings:view",
    "settings:write",
    "settings:admin",
  ],
  MANAGER: [
    "dashboard:view",
    "products:view",
    "products:write",
    "customers:view",
    "customers:write",
    "quotes:view",
    "quotes:write",
    "quotes:convert",
    "orders:view",
    "orders:write",
    "reports:view",
    "settings:view",
    "settings:write",
  ],
  STAFF: [
    "dashboard:view",
    "products:view",
    "customers:view",
    "quotes:view",
    "orders:view",
    "orders:write",
  ],
};

export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as AdminRole];
  return perms?.includes(permission) ?? false;
}

export function canAccessModule(role: string, module: string): boolean {
  return hasPermission(role, `${module}:view` as Permission);
}

export const ORDER_STATUSES = [
  "pending",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export const QUOTE_STATUSES = [
  "pending",
  "reviewed",
  "sent",
  "converted",
  "rejected",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
