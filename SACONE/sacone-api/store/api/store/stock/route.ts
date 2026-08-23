import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { syncProductAvailability } from "@/lib/admin/services";

/**
 * Lightweight stock snapshot for storefront polling / realtime UI.
 * Optional ERP enrichment via SACONE_API internal query when erpItemId is set.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const idsParam = searchParams.get("ids");
    const idList = idsParam
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const products = await prisma.product.findMany({
      where: idList ? { id: { in: idList } } : undefined,
      select: {
        id: true,
        sku: true,
        erpItemId: true,
        stockCount: true,
        lowStockThreshold: true,
        availability: true,
      },
    });

    // Attempt ERP live stock for linked items (best-effort, non-blocking failure)
    const erpLinked = products.filter((p) => p.erpItemId);
    const erpStock = new Map<string, number>();

    if (erpLinked.length > 0) {
      try {
        const { fetchErpStockByItem } = await import("@/lib/erpInventory");
        const live = fetchErpStockByItem();
        for (const p of erpLinked) {
          if (p.erpItemId && live.has(p.erpItemId)) {
            erpStock.set(p.erpItemId, live.get(p.erpItemId)!);
          }
        }
      } catch {
        // Store DB stock remains authoritative if ERP unreachable
      }
    }

    const stock = products.map((p) => {
      const live =
        p.erpItemId && erpStock.has(p.erpItemId)
          ? erpStock.get(p.erpItemId)!
          : p.stockCount;
      return {
        id: p.id,
        sku: p.sku,
        erpItemId: p.erpItemId,
        stockCount: live,
        availability: syncProductAvailability(live, p.lowStockThreshold),
        fromErp: Boolean(p.erpItemId && erpStock.has(p.erpItemId)),
      };
    });

    return NextResponse.json({
      stock,
      revision: Date.now(),
      polledAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[store/stock]", error);
    return NextResponse.json({ error: "Failed to load stock", stock: [] }, { status: 500 });
  }
}
