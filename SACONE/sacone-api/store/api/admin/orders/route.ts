import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi } from "@/lib/admin/services";
import { ORDER_STATUSES } from "@/lib/admin/permissions";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "orders:view");
  if (authError) return authError;

  const status = request.nextUrl.searchParams.get("status") ?? "";
  const search = request.nextUrl.searchParams.get("search") ?? "";

  const orders = await prisma.order.findMany({
    where: {
      AND: [
        status ? { status } : {},
        search
          ? {
              OR: [
                { orderNumber: { contains: search } },
                { customerName: { contains: search } },
                { phone: { contains: search } },
              ],
            }
          : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { product: true } }, invoice: true },
  });

  return NextResponse.json({ orders, statuses: ORDER_STATUSES });
}
