import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi, syncProductAvailability } from "@/lib/admin/services";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "products:view");
  if (authError) return authError;

  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "products:write");
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();
  const stockCount =
    body.stockCount !== undefined ? Number(body.stockCount) : undefined;
  const threshold =
    body.lowStockThreshold !== undefined
      ? Number(body.lowStockThreshold)
      : undefined;

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newStock = stockCount ?? existing.stockCount;
  const newThreshold = threshold ?? existing.lowStockThreshold;

  const product = await prisma.product.update({
    where: { id },
    data: {
      name: body.name ?? existing.name,
      brand: body.brand ?? existing.brand,
      category: body.category ?? existing.category,
      price: body.price !== undefined ? Number(body.price) : existing.price,
      mrp: body.mrp !== undefined ? (body.mrp ? Number(body.mrp) : null) : existing.mrp,
      sku: body.sku ?? existing.sku,
      stockCount: newStock,
      lowStockThreshold: newThreshold,
      availability: syncProductAvailability(newStock, newThreshold),
      image: body.image ?? existing.image,
      images: body.images ? JSON.stringify(body.images) : existing.images,
      description: body.description ?? existing.description,
      specifications: body.specifications
        ? JSON.stringify(body.specifications)
        : existing.specifications,
      featured: body.featured !== undefined ? Boolean(body.featured) : existing.featured,
    },
  });

  return NextResponse.json({ product });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "products:delete");
  if (authError) return authError;

  const { id } = await params;
  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
