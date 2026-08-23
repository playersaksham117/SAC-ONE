import PDFDocument from "pdfkit";
import {
  COMPANY,
  formatINR,
  formatDate,
  QUOTE_TERMS,
  GST_NOTE,
} from "@/lib/constants";

type PDFDoc = InstanceType<typeof PDFDocument>;

interface PDFItem {
  name: string;
  sku: string;
  brand: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface QuotationPDFData {
  quoteNumber: string;
  customerName: string;
  email: string;
  phone: string;
  company?: string | null;
  address?: string | null;
  items: PDFItem[];
  subtotal: number;
  validityDate: Date;
  createdAt: Date;
}

function drawLogo(doc: PDFDoc, x: number, y: number) {
  doc
    .roundedRect(x, y, 50, 50, 8)
    .fill("#0057FF");
  doc
    .fillColor("#FFFFFF")
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("TSE", x + 10, y + 18);
  doc.fillColor("#1C1C1C");
}

function drawHeader(
  doc: PDFDoc,
  title: string,
  docNumber: string,
  docDate: Date
) {
  drawLogo(doc, 50, 45);

  doc
    .fontSize(18)
    .font("Helvetica-Bold")
    .fillColor("#0057FF")
    .text(COMPANY.name, 115, 48);

  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#666666")
    .text(COMPANY.tagline, 115, 70)
    .text(COMPANY.address, 115, 82)
    .text(`Phone: ${COMPANY.phone} | Email: ${COMPANY.email}`, 115, 94)
    .text(`GSTIN: ${COMPANY.gstin}`, 115, 106);

  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .fillColor("#FF6B00")
    .text(title, 400, 48, { align: "right", width: 145 });

  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor("#1C1C1C")
    .text(`${title === "QUOTATION" ? "Quote" : "Invoice"} No: ${docNumber}`, 400, 78, {
      align: "right",
      width: 145,
    })
    .font("Helvetica")
    .fillColor("#666666")
    .text(`Date: ${formatDate(docDate)}`, 400, 94, { align: "right", width: 145 });

  doc
    .moveTo(50, 130)
    .lineTo(545, 130)
    .strokeColor("#0057FF")
    .lineWidth(2)
    .stroke();
}

function drawCustomerBlock(
  doc: PDFDoc,
  label: string,
  lines: string[],
  y: number
) {
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor("#0057FF")
    .text(label, 50, y);

  doc.font("Helvetica").fillColor("#1C1C1C");
  lines.forEach((line, i) => {
    doc.text(line, 50, y + 16 + i * 14);
  });
}

function drawProductTable(
  doc: PDFDoc,
  items: PDFItem[],
  startY: number
): number {
  const colX = [50, 90, 280, 340, 400, 470];
  const headers = ["#", "Product", "SKU", "Qty", "Rate", "Amount"];

  doc.rect(50, startY, 495, 22).fill("#0057FF");
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#FFFFFF");
  headers.forEach((h, i) => {
    doc.text(h, colX[i] + 4, startY + 7, { width: i === 1 ? 180 : 60 });
  });

  let y = startY + 22;
  items.forEach((item, index) => {
    const rowHeight = 28;
    if (index % 2 === 0) {
      doc.rect(50, y, 495, rowHeight).fill("#F4F6F9");
    }
    doc.fontSize(8).font("Helvetica").fillColor("#1C1C1C");
    doc.text(String(index + 1), colX[0] + 4, y + 10);
    doc.text(`${item.name}\n(${item.brand})`, colX[1] + 4, y + 6, { width: 180 });
    doc.text(item.sku, colX[2] + 4, y + 10, { width: 50 });
    doc.text(String(item.quantity), colX[3] + 4, y + 10);
    doc.text(formatINR(item.unitPrice), colX[4] + 4, y + 10, { width: 65 });
    doc.text(formatINR(item.totalPrice), colX[5] + 4, y + 10, { width: 70 });
    y += rowHeight;
  });

  doc
    .moveTo(50, y)
    .lineTo(545, y)
    .strokeColor("#E5E7EB")
    .lineWidth(1)
    .stroke();

  return y + 10;
}

export function generateQuotationPDF(data: QuotationPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawHeader(doc, "QUOTATION", data.quoteNumber, data.createdAt);

    const customerLines = [
      data.customerName,
      data.company ? `Company: ${data.company}` : "",
      `Email: ${data.email}`,
      `Phone: ${data.phone}`,
      data.address ? `Address: ${data.address}` : "",
    ].filter(Boolean);

    drawCustomerBlock(doc, "CUSTOMER DETAILS", customerLines, 145);

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#FF6B00")
      .text(`Valid Until: ${formatDate(data.validityDate)}`, 350, 145);

    const tableY = drawProductTable(doc, data.items, 220);

    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor("#1C1C1C")
      .text("Subtotal:", 400, tableY)
      .text(formatINR(data.subtotal), 470, tableY);

    let termsY = tableY + 30;

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#0057FF")
      .text("GST NOTE", 50, termsY);
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#666666")
      .text(GST_NOTE, 50, termsY + 16, { width: 495 });

    termsY += 50;

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#0057FF")
      .text("TERMS & CONDITIONS", 50, termsY);

    QUOTE_TERMS.forEach((term, i) => {
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#666666")
        .text(`${i + 1}. ${term}`, 50, termsY + 16 + i * 14, { width: 495 });
    });

    const footerY = 750;
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#999999")
      .text(
        `This is a computer-generated quotation from ${COMPANY.name}.`,
        50,
        footerY,
        { align: "center", width: 495 }
      );

    doc.end();
  });
}

interface InvoicePDFData {
  invoiceNumber: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  address: string;
  gstNumber?: string | null;
  items: PDFItem[];
  subtotal: number;
  gstAmount: number;
  total: number;
  createdAt: Date;
}

export function generateInvoicePDF(data: InvoicePDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawHeader(doc, "TAX INVOICE", data.invoiceNumber, data.createdAt);

    const customerLines = [
      data.customerName,
      `Phone: ${data.phone}`,
      `Address: ${data.address}`,
      data.gstNumber ? `GSTIN: ${data.gstNumber}` : "GSTIN: Unregistered",
    ];

    drawCustomerBlock(doc, "BILL TO", customerLines, 145);

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#1C1C1C")
      .text(`Order No: ${data.orderNumber}`, 350, 145);

    const tableY = drawProductTable(doc, data.items, 210);

    let summaryY = tableY;
    doc.fontSize(10).font("Helvetica").fillColor("#666666");
    doc.text("Subtotal:", 400, summaryY).text(formatINR(data.subtotal), 470, summaryY);
    summaryY += 18;
    doc.text("GST (18%):", 400, summaryY).text(formatINR(data.gstAmount), 470, summaryY);
    summaryY += 18;
    doc
      .font("Helvetica-Bold")
      .fillColor("#0057FF")
      .text("Total:", 400, summaryY)
      .text(formatINR(data.total), 470, summaryY);

    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#999999")
      .text(
        `Thank you for your business! | ${COMPANY.name} | ${COMPANY.gstin}`,
        50,
        750,
        { align: "center", width: 495 }
      );

    doc.end();
  });
}
