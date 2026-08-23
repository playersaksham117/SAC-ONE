import prisma from "@/lib/db";
import type { AdminSession } from "./auth";
import { hasPermission, type Permission } from "./permissions";
import { NextResponse } from "next/server";

export async function requireAdminApi(
  session: AdminSession | null,
  permission?: Permission
) {
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (permission && !hasPermission(session.role, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export function syncProductAvailability(stockCount: number, threshold: number) {
  if (stockCount <= 0) return "out-of-stock";
  if (stockCount <= threshold) return "low-stock";
  return "in-stock";
}

export async function adjustStock(params: {
  productId: string;
  quantity: number;
  type: "IN" | "OUT" | "ADJUSTMENT" | "ORDER" | "RETURN";
  reason?: string;
  referenceId?: string;
  createdBy?: string;
}) {
  const product = await prisma.product.findUnique({
    where: { id: params.productId },
  });
  if (!product) throw new Error("Product not found");

  const stockBefore = product.stockCount;
  const stockAfter = Math.max(0, stockBefore + params.quantity);

  await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        productId: params.productId,
        type: params.type,
        quantity: params.quantity,
        stockBefore,
        stockAfter,
        reason: params.reason,
        referenceId: params.referenceId,
        createdBy: params.createdBy,
      },
    }),
    prisma.product.update({
      where: { id: params.productId },
      data: {
        stockCount: stockAfter,
        availability: syncProductAvailability(
          stockAfter,
          product.lowStockThreshold
        ),
      },
    }),
  ]);

  return stockAfter;
}

export async function deductStockForOrder(
  items: { productId: string; quantity: number }[],
  orderId: string,
  createdBy?: string
) {
  for (const item of items) {
    await adjustStock({
      productId: item.productId,
      quantity: -item.quantity,
      type: "ORDER",
      reason: "Order placed",
      referenceId: orderId,
      createdBy,
    });
  }
}

export async function upsertCustomer(data: {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  address?: string;
  gstNumber?: string;
}) {
  return prisma.customer.upsert({
    where: { phone: data.phone },
    create: {
      name: data.name,
      phone: data.phone,
      email: data.email,
      company: data.company,
      address: data.address,
      gstNumber: data.gstNumber,
      gstVerified: false,
      source: "webstore",
    },
    update: {
      name: data.name,
      email: data.email ?? undefined,
      company: data.company ?? undefined,
      address: data.address ?? undefined,
      gstNumber: data.gstNumber ?? undefined,
    },
  });
}
