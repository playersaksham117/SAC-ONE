import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { categories } from "@/data/categories";
import { syncProductAvailability } from "@/lib/admin/services";
import { parseStoreBrand } from "@/lib/storeBrands";

function mapProduct(row: {
  id: string;
  erpItemId: string | null;
  storeBrand?: string | null;
  name: string;
  brand: string;
  category: string;
  price: number;
  mrp: number | null;
  sku: string;
  availability: string;
  stockCount: number;
  lowStockThreshold: number;
  image: string;
  images: string;
  description: string;
  specifications: string;
  rating: number;
  reviewCount: number;
  featured: boolean;
}) {
  let images: string[] = [];
  let specifications: Record<string, string> = {};
  try {
    images = JSON.parse(row.images || "[]");
  } catch {
    images = row.image ? [row.image] : [];
  }
  try {
    specifications = JSON.parse(row.specifications || "{}");
  } catch {
    specifications = {};
  }

  const availability = syncProductAvailability(
    row.stockCount,
    row.lowStockThreshold
  );

  return {
    id: row.id,
    erpItemId: row.erpItemId,
    storeBrand: parseStoreBrand(row.storeBrand),
    name: row.name,
    brand: row.brand,
    category: row.category,
    price: row.price,
    mrp: row.mrp,
    sku: row.sku,
    availability,
    stockCount: row.stockCount,
    image: row.image,
    images: images.length ? images : [row.image],
    description: row.description,
    specifications,
    rating: row.rating,
    reviewCount: row.reviewCount,
    featured: row.featured,
  };
}

/** Public catalog scoped by store brand (sacone | sacvolt). */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") ?? "";
    const category = searchParams.get("category") ?? "";
    const featured = searchParams.get("featured");
    const ids = searchParams.get("ids");
    const storeBrand = parseStoreBrand(
      searchParams.get("brand") ||
        request.headers.get("x-store-brand") ||
        "sacvolt"
    );

    if (ids) {
      const idList = ids.split(",").map((s) => s.trim()).filter(Boolean);
      const rows = await prisma.product.findMany({
        where: { id: { in: idList }, storeBrand },
      });
      return NextResponse.json({
        products: rows.map(mapProduct),
        storeBrand,
        revision: Date.now(),
      });
    }

    const rows = await prisma.product.findMany({
      where: {
        AND: [
          { storeBrand },
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
          featured === "1" || featured === "true" ? { featured: true } : {},
        ],
      },
      orderBy: [{ featured: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({
      products: rows.map(mapProduct),
      categories,
      storeBrand,
      revision: Date.now(),
      source: "webstore-db",
    });
  } catch (error) {
    console.error("[store/products]", error);
    return NextResponse.json(
      { error: "Failed to load products", products: [], categories },
      { status: 500 }
    );
  }
}
