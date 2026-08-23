import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

interface CartItemInput {
  productId: string;
  quantity: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: { sessionId: string; items: CartItemInput[] } =
      await request.json();

    if (!body.sessionId || !body.items) {
      return NextResponse.json({ error: "sessionId and items required" }, { status: 400 });
    }

    const cart = await prisma.cart.upsert({
      where: { sessionId: body.sessionId },
      create: { sessionId: body.sessionId },
      update: {},
    });

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    if (body.items.length > 0) {
      await prisma.cartItem.createMany({
        data: body.items.map((item) => ({
          cartId: cart.id,
          productId: item.productId,
          quantity: item.quantity,
        })),
      });
    }

    const updated = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: { include: { product: true } } },
    });

    return NextResponse.json({ cart: updated });
  } catch (error) {
    console.error("Cart sync failed:", error);
    return NextResponse.json({ error: "Failed to sync cart" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const cart = await prisma.cart.findUnique({
      where: { sessionId },
      include: { items: { include: { product: true } } },
    });

    return NextResponse.json({ cart });
  } catch (error) {
    console.error("Cart fetch failed:", error);
    return NextResponse.json({ error: "Failed to fetch cart" }, { status: 500 });
  }
}
