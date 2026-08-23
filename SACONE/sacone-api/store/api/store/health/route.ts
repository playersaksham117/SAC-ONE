import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/** Storefront health + revision for live UI refresh. */
export async function GET() {
  try {
    const [productCount, orderCount] = await Promise.all([
      prisma.product.count(),
      prisma.order.count(),
    ]);

    return NextResponse.json({
      ok: true,
      service: "webstore",
      linkedBackends: ["sacone-api", "erp-db", "webstore-db"],
      productCount,
      orderCount,
      revision: Date.now(),
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[store/health]", error);
    return NextResponse.json(
      { ok: false, error: "Store backend unavailable" },
      { status: 503 }
    );
  }
}
