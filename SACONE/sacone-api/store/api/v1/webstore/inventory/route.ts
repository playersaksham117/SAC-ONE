import { NextRequest, NextResponse } from "next/server";
import {
  extractApiKey,
  fetchErpInventoryItems,
  fetchErpStockByItem,
} from "@/lib/erpInventory";
import {
  getPlatformSettings,
  isErpInventoryLinked,
} from "@/lib/platformSettings";

function unauthorized() {
  return NextResponse.json({ error: "Invalid or missing ERP API key" }, { status: 401 });
}

async function requireLinkKey(request: NextRequest) {
  const settings = await getPlatformSettings();
  if (!isErpInventoryLinked(settings)) {
    return {
      error: NextResponse.json(
        { error: "ERP inventory is not linked in Control Center" },
        { status: 409 }
      ),
    };
  }
  const key = extractApiKey(request.headers);
  if (!key || key !== settings.erp_link_api_key) {
    return { error: unauthorized() };
  }
  return { settings };
}

/** Key-authenticated ERP catalog for the webstore / integrations. */
export async function GET(request: NextRequest) {
  const auth = await requireLinkKey(request);
  if (auth.error) return auth.error;

  try {
    const items = fetchErpInventoryItems();
    const stock = fetchErpStockByItem();
    const products = items.map((item) => {
      const stockCount = Math.max(0, Math.round(stock.get(item.id) || 0));
      return {
        id: item.id,
        sku: item.sku,
        name: item.name,
        brand: item.brand || "Generic",
        category: item.category || "General",
        price: Math.round(Number(item.selling_price) || 0),
        description: item.description || item.name,
        stockCount,
        availability:
          stockCount <= 0
            ? "out_of_stock"
            : stockCount <= 10
              ? "low_stock"
              : "in_stock",
      };
    });
    return NextResponse.json({
      ok: true,
      source: "erp",
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("[webstore/inventory]", error);
    return NextResponse.json(
      { error: "Failed to load ERP inventory" },
      { status: 500 }
    );
  }
}
