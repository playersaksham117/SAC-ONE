import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getRequestSession } from "@/lib/admin/auth";
import { requireAdminApi, upsertCustomer } from "@/lib/admin/services";
import {
  generateOrderNumber,
  generateInvoiceNumber,
} from "@/lib/constants";
import { generateQuotationPDF } from "@/lib/pdf/generator";
import { emailQuotePDF } from "@/lib/email";
import { deductStockForOrder } from "@/lib/admin/services";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "quotes:view");
  if (authError) return authError;

  const { id } = await params;
  const quote = await prisma.quoteRequest.findFirst({
    where: { OR: [{ id }, { quoteNumber: id }] },
    include: { items: { include: { product: true } }, customer: true },
  });

  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ quote });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getRequestSession(request);
  const authError = await requireAdminApi(session, "quotes:write");
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.quoteRequest.findFirst({
    where: { OR: [{ id }, { quoteNumber: id }] },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const quoteId = existing.id;

  if (body.items?.length) {
    await prisma.quoteItem.deleteMany({ where: { quoteId } });
    let subtotal = 0;
    for (const item of body.items) {
      const totalPrice = item.unitPrice * item.quantity;
      subtotal += totalPrice;
      await prisma.quoteItem.create({
        data: {
          quoteId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice,
        },
      });
    }
    await prisma.quoteRequest.update({
      where: { id: quoteId },
      data: {
        subtotal,
        status: body.status,
        adminNotes: body.adminNotes,
      },
    });
  } else {
    await prisma.quoteRequest.update({
      where: { id: quoteId },
      data: {
        status: body.status,
        adminNotes: body.adminNotes,
      },
    });
  }

  const quote = await prisma.quoteRequest.findUnique({
    where: { id: quoteId },
    include: { items: { include: { product: true } } },
  });

  return NextResponse.json({ quote });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getRequestSession(request);
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action ?? request.nextUrl.searchParams.get("action");

  const existing = await prisma.quoteRequest.findFirst({
    where: { OR: [{ id }, { quoteNumber: id }] },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const quoteId = existing.id;

  if (action === "email") {
    const authError = await requireAdminApi(session, "quotes:write");
    if (authError) return authError;

    const quote = await prisma.quoteRequest.findUnique({
      where: { id: quoteId },
      include: { items: { include: { product: true } } },
    });
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const pdfBuffer = await generateQuotationPDF({
      quoteNumber: quote.quoteNumber,
      customerName: quote.customerName,
      email: quote.email,
      phone: quote.phone,
      company: quote.company,
      address: quote.address,
      items: quote.items.map((i) => ({
        name: i.product.name,
        sku: i.product.sku,
        brand: i.product.brand,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
      })),
      subtotal: quote.subtotal,
      validityDate: quote.validityDate,
      createdAt: quote.createdAt,
    });

    const result = await emailQuotePDF({
      to: quote.email,
      customerName: quote.customerName,
      quoteNumber: quote.quoteNumber,
      pdfBuffer,
    });

    await prisma.quoteRequest.update({
      where: { id: quoteId },
      data: { status: "sent" },
    });

    return NextResponse.json(result);
  }

  if (action === "convert") {
    const authError = await requireAdminApi(session, "quotes:convert");
    if (authError) return authError;

    const quote = await prisma.quoteRequest.findUnique({
      where: { id: quoteId },
      include: { items: true },
    });
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (quote.status === "converted") {
      return NextResponse.json({ error: "Already converted" }, { status: 400 });
    }

    const customer = await upsertCustomer({
      name: quote.customerName,
      phone: quote.phone,
      email: quote.email,
      company: quote.company ?? undefined,
      address: quote.address ?? undefined,
    });

    const subtotal = quote.subtotal;
    const gstAmount = Math.round(subtotal * 0.18);
    const order = await prisma.order.create({
      data: {
        orderNumber: await generateOrderNumber(),
        customerId: customer.id,
        customerName: quote.customerName,
        phone: quote.phone,
        address: quote.address || "On file",
        subtotal,
        gstAmount,
        total: subtotal + gstAmount,
        status: "pending",
        items: {
          create: quote.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
          })),
        },
        invoice: { create: { invoiceNumber: await generateInvoiceNumber() } },
      },
      include: { invoice: true },
    });

    await deductStockForOrder(
      quote.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      order.id,
      session!.email
    );

    await prisma.quoteRequest.update({
      where: { id: quoteId },
      data: { status: "converted", convertedOrderId: order.id },
    });

    return NextResponse.json({
      success: true,
      order: { id: order.id, orderNumber: order.orderNumber },
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
