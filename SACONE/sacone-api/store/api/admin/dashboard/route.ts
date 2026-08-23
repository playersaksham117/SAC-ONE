import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi } from "@/lib/admin/services";
import { formatPrice } from "@/data/products";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "dashboard:view");
  if (authError) return authError;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    totalOrders,
    totalQuotes,
    pendingQuotes,
    monthOrders,
    dayOrders,
    convertedQuotes,
    recentOrders,
    recentQuotes,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.quoteRequest.count(),
    prisma.quoteRequest.count({ where: { status: "pending" } }),
    prisma.order.findMany({
      where: { createdAt: { gte: startOfMonth }, status: { not: "cancelled" } },
      select: { total: true, createdAt: true },
    }),
    prisma.order.aggregate({
      where: { createdAt: { gte: startOfDay }, status: { not: "cancelled" } },
      _sum: { total: true },
    }),
    prisma.quoteRequest.count({ where: { status: "converted" } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { items: true },
    }),
    prisma.quoteRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  // Low stock - SQLite compatible query
  const lowStock = await prisma.product.findMany({
    orderBy: { stockCount: "asc" },
    take: 20,
  });
  const lowStockAlerts = lowStock.filter(
    (p) => p.stockCount <= p.lowStockThreshold
  ).slice(0, 8);

  const monthRevenue = monthOrders.reduce((s, o) => s + o.total, 0);
  const dayRevenue = dayOrders._sum.total ?? 0;
  const conversionRate =
    totalQuotes > 0 ? Math.round((convertedQuotes / totalQuotes) * 100) : 0;

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const revenueChart = last7Days.map((date) => {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const dayTotal = monthOrders
      .filter((o) => o.createdAt >= date && o.createdAt < next)
      .reduce((s, o) => s + o.total, 0);
    return {
      date: date.toLocaleDateString("en-IN", { weekday: "short" }),
      revenue: dayTotal,
    };
  });

  return NextResponse.json({
    stats: {
      totalOrders,
      totalQuotes,
      pendingQuotes,
      monthRevenue,
      dayRevenue,
      conversionRate,
      lowStockCount: lowStockAlerts.length,
    },
    lowStockAlerts: lowStockAlerts.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      stockCount: p.stockCount,
      threshold: p.lowStockThreshold,
    })),
    revenueChart,
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      total: o.total,
      status: o.status,
      createdAt: o.createdAt,
    })),
    recentQuotes: recentQuotes.map((q) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      customerName: q.customerName,
      subtotal: q.subtotal,
      status: q.status,
      createdAt: q.createdAt,
    })),
    formatted: {
      monthRevenue: formatPrice(monthRevenue),
      dayRevenue: formatPrice(dayRevenue),
    },
  });
}
