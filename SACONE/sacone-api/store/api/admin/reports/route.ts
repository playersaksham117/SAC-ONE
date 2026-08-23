import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi } from "@/lib/admin/services";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "reports:view");
  if (authError) return authError;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [allOrders, monthOrders, dayOrders, quotes, convertedQuotes] =
    await Promise.all([
      prisma.order.findMany({
        where: { status: { not: "cancelled" } },
        select: { total: true, createdAt: true, status: true },
      }),
      prisma.order.findMany({
        where: {
          createdAt: { gte: startOfMonth },
          status: { not: "cancelled" },
        },
        select: { total: true, createdAt: true },
      }),
      prisma.order.aggregate({
        where: {
          createdAt: { gte: startOfDay },
          status: { not: "cancelled" },
        },
        _sum: { total: true },
        _count: true,
      }),
      prisma.quoteRequest.count(),
      prisma.quoteRequest.count({ where: { status: "converted" } }),
    ]);

  const monthlyByDay: Record<string, number> = {};
  monthOrders.forEach((o) => {
    const key = o.createdAt.toISOString().slice(0, 10);
    monthlyByDay[key] = (monthlyByDay[key] || 0) + o.total;
  });

  const last12Months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const total = allOrders
      .filter((o) => o.createdAt >= d && o.createdAt <= end)
      .reduce((s, o) => s + o.total, 0);
    return {
      month: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      revenue: total,
    };
  });

  return NextResponse.json({
    dailySales: dayOrders._sum.total ?? 0,
    dailyOrders: dayOrders._count,
    monthlySales: monthOrders.reduce((s, o) => s + o.total, 0),
    monthlyOrders: monthOrders.length,
    totalRevenue: allOrders.reduce((s, o) => s + o.total, 0),
    quoteConversionRate:
      quotes > 0 ? Math.round((convertedQuotes / quotes) * 100) : 0,
    monthlyByDay,
    last12Months,
  });
}
