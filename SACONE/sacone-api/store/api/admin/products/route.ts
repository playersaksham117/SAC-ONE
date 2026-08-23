import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi, syncProductAvailability } from "@/lib/admin/services";
import { categories } from "@/data/categories";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "products:view");
  if (authError) return authError;

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search") ?? "";
  const category = searchParams.get("category") ?? "";
  const storeBrand = searchParams.get("brand") ?? "";

  const products = await prisma.product.findMany({
    where: {
      AND: [
        storeBrand ? { storeBrand } : {},
        search
          ? {
              OR: [
                { name: { contains: search } },
                { sku: { contains: search } },
                { brand: { contains: search } },
              ],
            }
          : {},
        category ? { category } : {},
      ],
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ products, categories, storeBrand: storeBrand || "all" });
}

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "products:write");
  if (authError) return authError;

  try {
    const body = await request.json();
    const id = body.id ?? `prod-${Date.now()}`;
    const stockCount = Number(body.stockCount) || 0;
    const threshold = Number(body.lowStockThreshold) || 10;

    const product = await prisma.product.create({
      data: {
        id,
        storeBrand: body.storeBrand === "sacone" ? "sacone" : "sacvolt",
        name: body.name,
        brand: body.brand,
        category: body.category,
        price: Number(body.price),
        mrp: body.mrp ? Number(body.mrp) : null,
        sku: body.sku,
        stockCount,
        lowStockThreshold: threshold,
        availability: syncProductAvailability(stockCount, threshold),
        image: body.image || "/uploads/products/placeholder.jpg",
        images: JSON.stringify(body.images ?? [body.image]),
        description: body.description ?? "",
        specifications: JSON.stringify(body.specifications ?? {}),
        rating: Number(body.rating) || 4,
        reviewCount: 0,
        featured: Boolean(body.featured),
      },
    });

    return NextResponse.json({ product });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
