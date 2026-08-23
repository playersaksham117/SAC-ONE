import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi } from "@/lib/admin/services";
import { hasPermission } from "@/lib/admin/permissions";
import {
  ADMIN_HOSTS_COOKIE,
  generateErpLinkApiKey,
  generatePosApiKey,
  getPlatformSettings,
  savePlatformSettings,
  type PlatformSettings,
} from "@/lib/platformSettings";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "settings:view");
  if (authError) return authError;

  const settings = await getPlatformSettings();
  return NextResponse.json({
    settings,
    role: session!.role,
    canWrite: hasPermission(session!.role, "settings:write"),
    canAdmin: hasPermission(session!.role, "settings:admin"),
  });
}

export async function PUT(request: NextRequest) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "settings:write");
  if (authError) return authError;

  try {
    const body = (await request.json()) as Partial<PlatformSettings> & {
      action?: string;
    };

    if (body.action === "generate_pos_key") {
      if (!hasPermission(session!.role, "settings:admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const key = generatePosApiKey();
      const settings = await savePlatformSettings({
        sync_api_key: key,
        sync_enabled: true,
      });
      return NextResponse.json({
        success: true,
        settings,
        message: "POS API key generated",
      });
    }

    if (body.action === "generate_erp_link_key") {
      if (!hasPermission(session!.role, "settings:admin")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const key = generateErpLinkApiKey();
      const settings = await savePlatformSettings({
        erp_link_api_key: key,
        erp_inventory_linked: true,
      });
      return NextResponse.json({
        success: true,
        settings,
        message: "ERP link API key generated — webstore inventory is linked",
      });
    }

    const current = await getPlatformSettings();
    const isAdmin = hasPermission(session!.role, "settings:admin");

    // Managers can edit company + ERP ops; only SUPER_ADMIN edits domain/modules/POS/security hosts
    const allowed: Partial<PlatformSettings> = {
      company_name: body.company_name,
      company_tagline: body.company_tagline,
      company_address: body.company_address,
      company_phone: body.company_phone,
      company_email: body.company_email,
      company_gstin: body.company_gstin,
      company_website: body.company_website,
      currency: body.currency,
      currency_symbol: body.currency_symbol,
      timezone: body.timezone,
      date_format: body.date_format,
      low_stock_threshold: body.low_stock_threshold,
      dead_stock_days: body.dead_stock_days,
    };

    if (isAdmin) {
      Object.assign(allowed, {
        admin_allowed_hosts: body.admin_allowed_hosts,
        erp_url: body.erp_url,
        ceo_dashboard_url: body.ceo_dashboard_url,
        ceo_enabled: body.ceo_enabled,
        webstore_enabled: body.webstore_enabled,
        sacone_store_enabled: body.sacone_store_enabled,
        sacvolt_store_enabled: body.sacvolt_store_enabled,
        sacone_storefront_url: body.sacone_storefront_url,
        sacvolt_storefront_url: body.sacvolt_storefront_url,
        pin_lock_minutes: body.pin_lock_minutes,
        sync_api_key: body.sync_api_key,
        sync_enabled: body.sync_enabled,
        sync_registered_email: body.sync_registered_email,
        erp_link_api_key: body.erp_link_api_key,
        erp_inventory_linked: body.erp_inventory_linked,
      });
    }

    const settings = await savePlatformSettings(allowed);
    const res = NextResponse.json({
      success: true,
      settings,
      message: "Settings saved for Control Center, ERP, and Web Store",
    });

    if (isAdmin && settings.admin_allowed_hosts !== current.admin_allowed_hosts) {
      res.cookies.set(ADMIN_HOSTS_COOKIE, settings.admin_allowed_hosts, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return res;
  } catch (err) {
    console.error("Save platform settings failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to save settings",
      },
      { status: 500 }
    );
  }
}
