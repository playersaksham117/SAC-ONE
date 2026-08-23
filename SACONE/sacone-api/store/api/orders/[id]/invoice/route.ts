import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { generateInvoicePDF } from "@/lib/pdf/generator";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const order = await prisma.order.findFirst({
      where: { OR: [{ id }, { orderNumber: id }] },
      include: {
        items: { include: { product: true } },
        invoice: true,
      },
    });

    if (!order || !order.invoice) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const pdfBuffer = await generateInvoicePDF({
      invoiceNumber: order.invoice.invoiceNumber,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      phone: order.phone,
      address: [order.address, order.city, order.state, order.pincode]
        .filter(Boolean)
        .join(", "),
      gstNumber: order.gstNumber,
      items: order.items.map((item) => ({
        name: item.product.name,
        sku: item.product.sku,
        brand: item.product.brand,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
      subtotal: order.subtotal,
      gstAmount: order.gstAmount,
      total: order.total,
      createdAt: order.createdAt,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${order.invoice.invoiceNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Invoice PDF failed:", error);
    return NextResponse.json({ error: "Failed to generate invoice" }, { status: 500 });
  }
}
