import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi } from "@/lib/admin/services";
import { QUOTE_STATUSES } from "@/lib/admin/permissions";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "quotes:view");
  if (authError) return authError;

  const status = request.nextUrl.searchParams.get("status") ?? "";

  const quotes = await prisma.quoteRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: { items: { include: { product: true } } },
  });

  return NextResponse.json({ quotes, statuses: QUOTE_STATUSES });
}
