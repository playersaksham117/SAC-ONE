import prisma from "@/lib/db";
import { COMPANY } from "@/lib/constants";

export type PlatformSettings = {
  company_name: string;
  company_tagline: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_gstin: string;
  company_website: string;
  admin_allowed_hosts: string;
  erp_url: string;
  ceo_dashboard_url: string;
  ceo_enabled: boolean;
  webstore_enabled: boolean;
  sacone_store_enabled: boolean;
  sacvolt_store_enabled: boolean;
  sacone_storefront_url: string;
  sacvolt_storefront_url: string;
  currency: string;
  currency_symbol: string;
  timezone: string;
  date_format: string;
  low_stock_threshold: number;
  dead_stock_days: number;
  pin_lock_minutes: number;
  sync_api_key: string;
  sync_enabled: boolean;
  sync_registered_email: string;
  last_sync_at: string;
  erp_link_api_key: string;
  erp_inventory_linked: boolean;
  erp_last_product_sync_at: string;
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  company_name: COMPANY.name,
  company_tagline: COMPANY.tagline,
  company_address: COMPANY.address,
  company_phone: COMPANY.phone,
  company_email: COMPANY.email,
  company_gstin: COMPANY.gstin,
  company_website: COMPANY.website,
  admin_allowed_hosts:
    process.env.ADMIN_ALLOWED_HOSTS ||
    process.env.ADMIN_DOMAIN ||
    "localhost:3000,127.0.0.1:3000",
  erp_url: process.env.NEXT_PUBLIC_ERP_URL || "/erp",
  ceo_dashboard_url: "/erp/ceo-dashboard",
  ceo_enabled: true,
  webstore_enabled: true,
  sacone_store_enabled: false,
  sacvolt_store_enabled: false,
  sacone_storefront_url: "",
  sacvolt_storefront_url: "",
  currency: "INR",
  currency_symbol: "₹",
  timezone: "Asia/Kolkata",
  date_format: "dd/MM/yyyy",
  low_stock_threshold: 10,
  dead_stock_days: 60,
  pin_lock_minutes: 10,
  sync_api_key: "",
  sync_enabled: false,
  sync_registered_email: "",
  last_sync_at: "",
  erp_link_api_key: "",
  erp_inventory_linked: false,
  erp_last_product_sync_at: "",
};

type Row = {
  companyName: string;
  companyTagline: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyGstin: string;
  companyWebsite: string;
  adminAllowedHosts: string;
  erpUrl: string;
  ceoDashboardUrl: string;
  ceoEnabled: boolean;
  webstoreEnabled: boolean;
  saconeStoreEnabled?: boolean;
  sacvoltStoreEnabled?: boolean;
  saconeStorefrontUrl?: string;
  sacvoltStorefrontUrl?: string;
  currency: string;
  currencySymbol: string;
  timezone: string;
  dateFormat: string;
  lowStockThreshold: number;
  deadStockDays: number;
  pinLockMinutes: number;
  syncApiKey: string;
  syncEnabled: boolean;
  syncRegisteredEmail: string;
  lastSyncAt: string;
  erpLinkApiKey?: string;
  erpInventoryLinked?: boolean;
  erpLastProductSyncAt?: string;
};

function mapRow(row: Row | null): PlatformSettings {
  if (!row) return { ...DEFAULT_PLATFORM_SETTINGS };
  const erpUrl = row.erpUrl?.includes("localhost:5173") ? "/erp" : row.erpUrl;
  return {
    company_name: row.companyName || DEFAULT_PLATFORM_SETTINGS.company_name,
    company_tagline: row.companyTagline || DEFAULT_PLATFORM_SETTINGS.company_tagline,
    company_address: row.companyAddress || DEFAULT_PLATFORM_SETTINGS.company_address,
    company_phone: row.companyPhone || DEFAULT_PLATFORM_SETTINGS.company_phone,
    company_email: row.companyEmail || DEFAULT_PLATFORM_SETTINGS.company_email,
    company_gstin: row.companyGstin || DEFAULT_PLATFORM_SETTINGS.company_gstin,
    company_website: row.companyWebsite || DEFAULT_PLATFORM_SETTINGS.company_website,
    admin_allowed_hosts:
      row.adminAllowedHosts || DEFAULT_PLATFORM_SETTINGS.admin_allowed_hosts,
    erp_url: erpUrl || DEFAULT_PLATFORM_SETTINGS.erp_url,
    ceo_dashboard_url: row.ceoDashboardUrl || DEFAULT_PLATFORM_SETTINGS.ceo_dashboard_url,
    ceo_enabled: Boolean(row.ceoEnabled),
    webstore_enabled: Boolean(row.webstoreEnabled),
    sacone_store_enabled: row.saconeStoreEnabled !== false,
    sacvolt_store_enabled: row.sacvoltStoreEnabled !== false,
    sacone_storefront_url:
      row.saconeStorefrontUrl || DEFAULT_PLATFORM_SETTINGS.sacone_storefront_url,
    sacvolt_storefront_url:
      row.sacvoltStorefrontUrl || DEFAULT_PLATFORM_SETTINGS.sacvolt_storefront_url,
    currency: row.currency || DEFAULT_PLATFORM_SETTINGS.currency,
    currency_symbol: row.currencySymbol || DEFAULT_PLATFORM_SETTINGS.currency_symbol,
    timezone: row.timezone || DEFAULT_PLATFORM_SETTINGS.timezone,
    date_format: row.dateFormat || DEFAULT_PLATFORM_SETTINGS.date_format,
    low_stock_threshold: Number(
      row.lowStockThreshold ?? DEFAULT_PLATFORM_SETTINGS.low_stock_threshold
    ),
    dead_stock_days: Number(
      row.deadStockDays ?? DEFAULT_PLATFORM_SETTINGS.dead_stock_days
    ),
    pin_lock_minutes: Number(
      row.pinLockMinutes ?? DEFAULT_PLATFORM_SETTINGS.pin_lock_minutes
    ),
    sync_api_key: row.syncApiKey || "",
    sync_enabled: Boolean(row.syncEnabled),
    sync_registered_email: row.syncRegisteredEmail || "",
    last_sync_at: row.lastSyncAt || "",
    erp_link_api_key: row.erpLinkApiKey || "",
    erp_inventory_linked: Boolean(row.erpInventoryLinked),
    erp_last_product_sync_at: row.erpLastProductSyncAt || "",
  };
}

async function readErpLinkColumns(): Promise<{
  erp_link_api_key: string;
  erp_inventory_linked: boolean;
  erp_last_product_sync_at: string;
} | null> {
  try {
    const rows = await prisma.$queryRaw<
      {
        erpLinkApiKey: string | null;
        erpInventoryLinked: number | boolean | null;
        erpLastProductSyncAt: string | null;
      }[]
    >`SELECT erpLinkApiKey, erpInventoryLinked, erpLastProductSyncAt
      FROM PlatformSettings WHERE id = 'singleton'`;
    const extra = rows[0];
    if (!extra) return null;
    return {
      erp_link_api_key: extra.erpLinkApiKey || "",
      erp_inventory_linked: Boolean(extra.erpInventoryLinked),
      erp_last_product_sync_at: extra.erpLastProductSyncAt || "",
    };
  } catch {
    return null;
  }
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const row = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
    });
    const mapped = mapRow(row as Row | null);
    const extra = await readErpLinkColumns();
    return extra ? { ...mapped, ...extra } : mapped;
  } catch (err) {
    console.warn("[platform-settings] read failed, using defaults", err);
    return { ...DEFAULT_PLATFORM_SETTINGS };
  }
}

/** Push company/ERP fields into ERP app_settings (same API host). */
async function syncToErpAppSettings(settings: PlatformSettings) {
  try {
    const res = await fetch(
      `${process.env.SACONE_API_URL || "http://localhost:4000"}/api/db/query`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "upsert",
          table: "app_settings",
          body: {
            id: "singleton",
            company_name: settings.company_name,
            company_tagline: settings.company_tagline,
            company_address: settings.company_address,
            company_phone: settings.company_phone,
            company_email: settings.company_email,
            company_gstin: settings.company_gstin,
            company_website: settings.company_website,
            currency: settings.currency,
            currency_symbol: settings.currency_symbol,
            timezone: settings.timezone,
            date_format: settings.date_format,
            low_stock_threshold: settings.low_stock_threshold,
            dead_stock_days: settings.dead_stock_days,
            pin_lock_minutes: settings.pin_lock_minutes,
            sync_api_key: settings.sync_api_key || null,
            sync_enabled: settings.sync_enabled,
            sync_registered_email: settings.sync_registered_email || null,
            updated_at: new Date().toISOString(),
          },
          single: true,
        }),
      }
    );
    if (!res.ok) {
      console.warn("[platform-settings] ERP sync HTTP", res.status);
    }
  } catch (err) {
    console.warn("[platform-settings] ERP sync skipped", err);
  }
}

export async function savePlatformSettings(
  input: Partial<PlatformSettings>,
  opts?: { syncErp?: boolean }
): Promise<PlatformSettings> {
  const current = await getPlatformSettings();
  const next: PlatformSettings = {
    company_name:
      (input.company_name ?? current.company_name).trim() ||
      DEFAULT_PLATFORM_SETTINGS.company_name,
    company_tagline: (input.company_tagline ?? current.company_tagline).trim(),
    company_address: (input.company_address ?? current.company_address).trim(),
    company_phone: (input.company_phone ?? current.company_phone).trim(),
    company_email: (input.company_email ?? current.company_email).trim(),
    company_gstin: (input.company_gstin ?? current.company_gstin).trim(),
    company_website: (input.company_website ?? current.company_website).trim(),
    admin_allowed_hosts: (input.admin_allowed_hosts ?? current.admin_allowed_hosts)
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean)
      .join(","),
    erp_url: (input.erp_url ?? current.erp_url).trim() || "/erp",
    ceo_dashboard_url: (input.ceo_dashboard_url ?? current.ceo_dashboard_url).trim(),
    ceo_enabled: Boolean(input.ceo_enabled ?? current.ceo_enabled),
    webstore_enabled: Boolean(input.webstore_enabled ?? current.webstore_enabled),
    sacone_store_enabled: Boolean(
      input.sacone_store_enabled ?? current.sacone_store_enabled
    ),
    sacvolt_store_enabled: Boolean(
      input.sacvolt_store_enabled ?? current.sacvolt_store_enabled
    ),
    sacone_storefront_url: (
      input.sacone_storefront_url ?? current.sacone_storefront_url
    ).trim() || DEFAULT_PLATFORM_SETTINGS.sacone_storefront_url,
    sacvolt_storefront_url: (
      input.sacvolt_storefront_url ?? current.sacvolt_storefront_url
    ).trim() || DEFAULT_PLATFORM_SETTINGS.sacvolt_storefront_url,
    currency: (input.currency ?? current.currency).trim() || "INR",
    currency_symbol:
      (input.currency_symbol ?? current.currency_symbol).trim() || "₹",
    timezone: (input.timezone ?? current.timezone).trim() || "Asia/Kolkata",
    date_format: (input.date_format ?? current.date_format).trim() || "dd/MM/yyyy",
    low_stock_threshold: Number(
      input.low_stock_threshold ?? current.low_stock_threshold
    ),
    dead_stock_days: Number(input.dead_stock_days ?? current.dead_stock_days),
    pin_lock_minutes: Number(input.pin_lock_minutes ?? current.pin_lock_minutes),
    sync_api_key: (input.sync_api_key ?? current.sync_api_key).trim(),
    sync_enabled: Boolean(input.sync_enabled ?? current.sync_enabled),
    sync_registered_email: (
      input.sync_registered_email ?? current.sync_registered_email
    ).trim(),
    last_sync_at: (input.last_sync_at ?? current.last_sync_at).trim(),
    erp_link_api_key: (input.erp_link_api_key ?? current.erp_link_api_key).trim(),
    erp_inventory_linked: Boolean(
      input.erp_inventory_linked ?? current.erp_inventory_linked
    ),
    erp_last_product_sync_at: (
      input.erp_last_product_sync_at ?? current.erp_last_product_sync_at
    ).trim(),
  };

  const data = {
    companyName: next.company_name,
    companyTagline: next.company_tagline,
    companyAddress: next.company_address,
    companyPhone: next.company_phone,
    companyEmail: next.company_email,
    companyGstin: next.company_gstin,
    companyWebsite: next.company_website,
    adminAllowedHosts: next.admin_allowed_hosts,
    erpUrl: next.erp_url,
    ceoDashboardUrl: next.ceo_dashboard_url,
    ceoEnabled: next.ceo_enabled,
    webstoreEnabled: next.webstore_enabled,
    saconeStoreEnabled: next.sacone_store_enabled,
    sacvoltStoreEnabled: next.sacvolt_store_enabled,
    saconeStorefrontUrl: next.sacone_storefront_url,
    sacvoltStorefrontUrl: next.sacvolt_storefront_url,
    currency: next.currency,
    currencySymbol: next.currency_symbol,
    timezone: next.timezone,
    dateFormat: next.date_format,
    lowStockThreshold: next.low_stock_threshold,
    deadStockDays: next.dead_stock_days,
    pinLockMinutes: next.pin_lock_minutes,
    syncApiKey: next.sync_api_key,
    syncEnabled: next.sync_enabled,
    syncRegisteredEmail: next.sync_registered_email,
    lastSyncAt: next.last_sync_at,
  };

  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  try {
    await prisma.$executeRaw`
      UPDATE PlatformSettings
      SET erpLinkApiKey = ${next.erp_link_api_key},
          erpInventoryLinked = ${next.erp_inventory_linked ? 1 : 0},
          erpLastProductSyncAt = ${next.erp_last_product_sync_at}
      WHERE id = 'singleton'
    `;
  } catch (err) {
    console.warn("[platform-settings] ERP link columns not written", err);
  }

  if (opts?.syncErp !== false) {
    await syncToErpAppSettings(next);
  }

  return next;
}

export function parseHostList(hosts: string): string[] {
  return hosts
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export const ADMIN_HOSTS_COOKIE = "sacone_admin_hosts";

export function generatePosApiKey(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `sk_pos_${Date.now().toString(36)}_${rand}`;
}

export function generateErpLinkApiKey(): string {
  const rand = Math.random().toString(36).slice(2, 12);
  return `sk_erp_${Date.now().toString(36)}_${rand}`;
}

export function isErpInventoryLinked(settings?: PlatformSettings | null) {
  const row = settings;
  return Boolean(row?.erp_inventory_linked && row.erp_link_api_key);
}
