import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { generateQuotationPDF } from "@/lib/pdf/generator";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const quote = await prisma.quoteRequest.findFirst({
      where: { OR: [{ id }, { quoteNumber: id }] },
      include: {
        items: { include: { product: true } },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    const pdfBuffer = await generateQuotationPDF({
      quoteNumber: quote.quoteNumber,
      customerName: quote.customerName,
      email: quote.email,
      phone: quote.phone,
      company: quote.company,
      address: quote.address,
      items: quote.items.map((item) => ({
        name: item.product.name,
        sku: item.product.sku,
        brand: item.product.brand,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
      subtotal: quote.subtotal,
      validityDate: quote.validityDate,
      createdAt: quote.createdAt,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${quote.quoteNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Quote PDF failed:", error);
    return NextResponse.json({ error: "Failed to generate quote PDF" }, { status: 500 });
  }
}
