import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import prisma from "@/lib/db";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi, syncProductAvailability } from "@/lib/admin/services";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "products:write");
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "CSV file required" }, { status: 400 });
    }

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    let imported = 0;
    for (const row of parsed.data) {
      if (!row.name || !row.sku) continue;
      const stock = Number(row.stockCount) || 0;
      const threshold = Number(row.lowStockThreshold) || 10;
      const id = row.id || `prod-${row.sku.replace(/\s/g, "-").toLowerCase()}`;

      await prisma.product.upsert({
        where: { id },
        create: {
          id,
          name: row.name,
          brand: row.brand || "Generic",
          category: row.category || "electrical-spares",
          price: Number(row.price) || 0,
          mrp: row.mrp ? Number(row.mrp) : null,
          sku: row.sku,
          stockCount: stock,
          lowStockThreshold: threshold,
          availability: syncProductAvailability(stock, threshold),
          image: row.image || "/uploads/products/placeholder.jpg",
          images: JSON.stringify([row.image || "/uploads/products/placeholder.jpg"]),
          description: row.description || "",
          specifications: JSON.stringify({}),
          rating: 4,
          reviewCount: 0,
          featured: row.featured === "true",
        },
        update: {
          name: row.name,
          price: Number(row.price) || 0,
          stockCount: stock,
          availability: syncProductAvailability(stock, threshold),
        },
      });
      imported++;
    }

    return NextResponse.json({ imported, total: parsed.data.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
