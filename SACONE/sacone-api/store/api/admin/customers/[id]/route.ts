import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi } from "@/lib/admin/services";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "customers:view");
  if (authError) return authError;

  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      orders: { orderBy: { createdAt: "desc" }, include: { items: true } },
      quotes: { orderBy: { createdAt: "desc" }, include: { items: true } },
    },
  });

  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ customer });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "customers:write");
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone,
      company: body.company,
      address: body.address,
      gstNumber: body.gstNumber,
      gstVerified: body.gstVerified,
      notes: body.notes,
    },
  });

  return NextResponse.json({ customer });
}
