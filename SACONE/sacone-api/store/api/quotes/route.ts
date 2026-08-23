import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  generateQuoteNumber,
  addDays,
  GST_NOTE,
} from "@/lib/constants";
import { generateQuotationPDF } from "@/lib/pdf/generator";
import { emailQuotePDF, notifyAdminNewQuote } from "@/lib/email";
import { upsertCustomer } from "@/lib/admin/services";

interface QuoteItemInput {
  productId: string;
  quantity: number;
}

interface CreateQuoteBody {
  customerName: string;
  email: string;
  phone: string;
  company?: string;
  address?: string;
  message?: string;
  items: QuoteItemInput[];
  sendEmail?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateQuoteBody = await request.json();

    if (
      !body.customerName ||
      !body.email ||
      !body.phone ||
      !body.items?.length
    ) {
      return NextResponse.json(
        { error: "Customer details and items are required" },
        { status: 400 }
      );
    }

    const productIds = body.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      return NextResponse.json({ error: "Invalid product in quote" }, { status: 400 });
    }

    const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

    const quoteItems = body.items.map((item) => {
      const product = productMap[item.productId];
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
        totalPrice: product.price * item.quantity,
      };
    });

    const subtotal = quoteItems.reduce((sum, i) => sum + i.totalPrice, 0);
    const quoteNumber = await generateQuoteNumber();
    const validityDate = addDays(new Date(), 30);

    const customer = await upsertCustomer({
      name: body.customerName,
      phone: body.phone,
      email: body.email,
      company: body.company,
      address: body.address,
    });

    const quote = await prisma.quoteRequest.create({
      data: {
        quoteNumber,
        customerId: customer.id,
        customerName: body.customerName,
        email: body.email,
        phone: body.phone,
        company: body.company || null,
        address: body.address || null,
        message: body.message || null,
        validityDate,
        subtotal,
        gstNote: GST_NOTE,
        status: "pending",
        items: { create: quoteItems },
      },
      include: {
        items: { include: { product: true } },
      },
    });

    await notifyAdminNewQuote(quote.quoteNumber, quote.customerName);

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

    if (body.sendEmail !== false) {
      await emailQuotePDF({
        to: quote.email,
        customerName: quote.customerName,
        quoteNumber: quote.quoteNumber,
        pdfBuffer,
      });
    }

    return NextResponse.json({
      success: true,
      quote: {
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        subtotal: quote.subtotal,
        validityDate: quote.validityDate,
      },
    });
  } catch (error) {
    console.error("Quote creation failed:", error);
    return NextResponse.json({ error: "Failed to create quote" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const quotes = await prisma.quoteRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        items: { include: { product: true } },
      },
    });
    return NextResponse.json({ quotes });
  } catch (error) {
    console.error("Quotes fetch failed:", error);
    return NextResponse.json({ error: "Failed to fetch quotes" }, { status: 500 });
  }
}
