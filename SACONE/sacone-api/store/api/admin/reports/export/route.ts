import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi } from "@/lib/admin/services";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "reports:view");
  if (authError) return authError;

  const type = request.nextUrl.searchParams.get("type") ?? "orders";

  if (type === "orders") {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });
    const header =
      "Order Number,Customer,Phone,Status,Subtotal,GST,Total,Date,Items\n";
    const rows = orders
      .map((o) =>
        [
          o.orderNumber,
          `"${o.customerName}"`,
          o.phone,
          o.status,
          o.subtotal,
          o.gstAmount,
          o.total,
          o.createdAt.toISOString(),
          o.items.length,
        ].join(",")
      )
      .join("\n");
    return new NextResponse(header + rows, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="orders-export.csv"',
      },
    });
  }

  if (type === "products") {
    const products = await prisma.product.findMany();
    const header = "ID,SKU,Name,Brand,Category,Price,Stock,Threshold,Status\n";
    const rows = products
      .map((p) =>
        [
          p.id,
          p.sku,
          `"${p.name}"`,
          p.brand,
          p.category,
          p.price,
          p.stockCount,
          p.lowStockThreshold,
          p.availability,
        ].join(",")
      )
      .join("\n");
    return new NextResponse(header + rows, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="products-export.csv"',
      },
    });
  }

  return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
}
