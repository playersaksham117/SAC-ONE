import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi } from "@/lib/admin/services";
import { syncProductsFromErpInventory } from "@/lib/masterSync";
import {
  getPlatformSettings,
  isErpInventoryLinked,
  savePlatformSettings,
} from "@/lib/platformSettings";
import { extractApiKey } from "@/lib/erpInventory";

async function authorizeSync(request: NextRequest) {
  const settings = await getPlatformSettings();
  const apiKey = extractApiKey(request.headers);
  if (
    settings.erp_link_api_key &&
    apiKey &&
    apiKey === settings.erp_link_api_key
  ) {
    if (!settings.erp_inventory_linked) {
      return {
        error: NextResponse.json(
          { error: "ERP inventory link is disabled. Enable it in Control Center Settings." },
          { status: 409 }
        ),
      };
    }
    return { settings };
  }

  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "products:write");
  if (authError) return { error: authError };
  return { settings };
}

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "products:view");
  if (authError) return authError;

  const settings = await getPlatformSettings();
  return NextResponse.json({
    linked: isErpInventoryLinked(settings),
    keyConfigured: Boolean(settings.erp_link_api_key),
    lastSyncAt: settings.erp_last_product_sync_at || null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeSync(request);
  if (auth.error) return auth.error;

  if (!isErpInventoryLinked(auth.settings)) {
    return NextResponse.json(
      {
        error:
          "Link ERP first: generate or paste an API key in Control Center Settings → Web Store ↔ ERP.",
      },
      { status: 409 }
    );
  }

  try {
    const synced = await syncProductsFromErpInventory();
    const saved = await savePlatformSettings(
      { erp_last_product_sync_at: new Date().toISOString() },
      { syncErp: false }
    );
    return NextResponse.json({
      success: true,
      synced,
      lastSyncAt: saved.erp_last_product_sync_at,
      message: `${synced} products synced from ERP inventory`,
    });
  } catch (error) {
    console.error("ERP catalog sync failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "ERP catalog sync failed",
      },
      { status: 500 }
    );
  }
}
