import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

const GSTIN_RE =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;

/**
 * Key-authenticated customer registration used by an external webstore.
 * Account types: gst_firm | individual — no admin auth on this route.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accountType =
      body.accountType === "individual" ? "individual" : "gst_firm";
    const name = String(body.name || body.contactPerson || "").trim();
    const phone = String(body.phone || "").replace(/\D/g, "");
    const email = String(body.email || "").trim() || null;
    const company = String(body.company || body.businessName || "").trim() || null;
    const address = String(body.address || "").trim() || null;
    const gstNumber = String(body.gstNumber || "")
      .trim()
      .toUpperCase()
      .replace(/\s/g, "");

    if (!name || phone.length < 10) {
      return NextResponse.json(
        { error: "Name and a valid 10-digit phone are required" },
        { status: 400 }
      );
    }

    if (accountType === "gst_firm") {
      if (!company) {
        return NextResponse.json(
          { error: "Firm / business name is required for GST Firm registration" },
          { status: 400 }
        );
      }
      if (!gstNumber || !GSTIN_RE.test(gstNumber)) {
        return NextResponse.json(
          { error: "Valid GSTIN is required for GST Firm registration" },
          { status: 400 }
        );
      }
    }

    const notes = [
      `accountType=${accountType}`,
      body.cityState ? `cityState=${body.cityState}` : null,
    ]
      .filter(Boolean)
      .join("; ");

    const customer = await prisma.customer.upsert({
      where: { phone },
      create: {
        name,
        phone,
        email,
        company: accountType === "gst_firm" ? company : company || null,
        address,
        gstNumber: gstNumber || null,
        gstVerified: false,
        source: `webstore-register:${accountType}`,
        notes: notes || null,
      },
      update: {
        name,
        email: email ?? undefined,
        company: company ?? undefined,
        address: address ?? undefined,
        gstNumber: gstNumber || undefined,
        source: `webstore-register:${accountType}`,
        notes: notes || undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Registration received",
      customerId: customer.id,
      accountType,
    });
  } catch (error) {
    console.error("[store/register]", error);
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
