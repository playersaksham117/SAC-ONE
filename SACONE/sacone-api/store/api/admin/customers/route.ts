import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi } from "@/lib/admin/services";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "customers:view");
  if (authError) return authError;

  const search = request.nextUrl.searchParams.get("search") ?? "";

  const customers = await prisma.customer.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search } },
            { phone: { contains: search } },
            { email: { contains: search } },
            { company: { contains: search } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { orders: true, quotes: true } },
    },
  });

  return NextResponse.json({ customers });
}
