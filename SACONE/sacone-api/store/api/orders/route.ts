import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { generateOrderNumber, generateInvoiceNumber } from "@/lib/constants";
import { upsertCustomer, deductStockForOrder } from "@/lib/admin/services";

interface OrderItemInput {
  productId: string;
  quantity: number;
}

interface CreateOrderBody {
  customerName: string;
  phone: string;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstNumber?: string;
  paymentMethod?: string;
  items: OrderItemInput[];
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateOrderBody = await request.json();

    if (!body.customerName || !body.phone || !body.address || !body.items?.length) {
      return NextResponse.json(
        { error: "Name, phone, address, and items are required" },
        { status: 400 }
      );
    }

    const productIds = body.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      return NextResponse.json({ error: "Invalid product in cart" }, { status: 400 });
    }

    const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

    const orderItems = body.items.map((item) => {
      const product = productMap[item.productId];
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
        totalPrice: product.price * item.quantity,
      };
    });

    const subtotal = orderItems.reduce((sum, i) => sum + i.totalPrice, 0);
    const gstAmount = Math.round(subtotal * 0.18);
    const total = subtotal + gstAmount;

    const orderNumber = await generateOrderNumber();
    const invoiceNumber = await generateInvoiceNumber();

    const customer = await upsertCustomer({
      name: body.customerName,
      phone: body.phone,
      address: body.address,
      gstNumber: body.gstNumber,
    });

    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        customerName: body.customerName,
        phone: body.phone,
        address: body.address,
        city: body.city,
        state: body.state,
        pincode: body.pincode,
        gstNumber: body.gstNumber || null,
        paymentMethod: body.paymentMethod || "cod",
        subtotal,
        gstAmount,
        total,
        status: "pending",
        items: { create: orderItems },
        invoice: {
          create: { invoiceNumber },
        },
      },
      include: {
        items: { include: { product: true } },
        invoice: true,
      },
    });

    await deductStockForOrder(
      orderItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      order.id
    );

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        invoiceNumber: order.invoice!.invoiceNumber,
        total: order.total,
      },
    });
  } catch (error) {
    console.error("Order creation failed:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        items: { include: { product: true } },
        invoice: true,
      },
    });
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Orders fetch failed:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
