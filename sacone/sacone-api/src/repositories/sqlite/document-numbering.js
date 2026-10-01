import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';
import { getFinancialYear } from '../../core/financial-year.js';
import { generateFirmPrefix } from '../../core/firm-prefix.js';

export const DOCUMENT_TYPES = {
  quotation: { docPrefix: 'Q', label: 'Quotation' },
  proforma: { docPrefix: 'PI', label: 'Proforma Invoice' },
  tax_invoice: { docPrefix: 'INV', label: 'Tax Invoice' },
  cash_invoice: { docPrefix: 'CASH', label: 'Cash Invoice' },
  sales_return: { docPrefix: 'SR', label: 'Sales Return' },
  purchase_order: { docPrefix: 'PO', label: 'Purchase Order' },
  purchase_bill: { docPrefix: 'PB', label: 'Purchase Bill' },
  customer_receipt: { docPrefix: 'RV', label: 'Customer Receipt' },
  supplier_payment: { docPrefix: 'PV', label: 'Supplier Payment' },
  commission_payment: { docPrefix: 'CP', label: 'Commission Payment' },
};

function mapSeries(row) {
  if (!row) return null;
  return {
    id: row.id,
    firmId: row.firm_id,
    documentType: row.document_type,
    docPrefix: row.doc_prefix,
    formatTemplate: row.format_template,
    startingNumber: row.starting_number,
    resetEachFy: Boolean(row.reset_each_fy),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCompany(row) {
  if (!row) return null;
  return {
    id: row.id,
    businessName: row.business_name,
    firmPrefix: row.firm_prefix,
    firmPrefixManual: Boolean(row.firm_prefix_manual),
    documentNumberFormat: row.document_number_format,
    simpleNumberFormat: row.simple_number_format,
    numberPadding: row.number_padding,
    fyResetNumbering: Boolean(row.fy_reset_numbering),
    authorizedSignatory: row.authorized_signatory,
    documentStampUrl: row.document_stamp_url,
    gstNumber: row.gst_number,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    phone: row.phone,
    email: row.email,
    logoUrl: row.logo_url,
  };
}

export class DocumentNumberingRepository {
  getFirm(firmId) {
    const db = getDatabase();
    const row = firmId
      ? db.prepare('SELECT * FROM companies WHERE id = ?').get(firmId)
      : db.prepare('SELECT * FROM companies ORDER BY created_at ASC LIMIT 1').get();
    return mapCompany(row);
  }

  updateFirmSettings(firmId, data) {
    const db = getDatabase();
    const firm = this.getFirm(firmId);
    if (!firm) return null;
    const now = nowIso();
    db.prepare(`
      UPDATE companies SET
        firm_prefix = COALESCE(?, firm_prefix),
        firm_prefix_manual = COALESCE(?, firm_prefix_manual),
        document_number_format = COALESCE(?, document_number_format),
        simple_number_format = COALESCE(?, simple_number_format),
        number_padding = COALESCE(?, number_padding),
        fy_reset_numbering = COALESCE(?, fy_reset_numbering),
        authorized_signatory = COALESCE(?, authorized_signatory),
        document_stamp_url = COALESCE(?, document_stamp_url),
        updated_at = ?
      WHERE id = ?
    `).run(
      data.firmPrefix ?? null,
      data.firmPrefixManual != null ? (data.firmPrefixManual ? 1 : 0) : null,
      data.documentNumberFormat ?? null,
      data.simpleNumberFormat ?? null,
      data.numberPadding ?? null,
      data.fyResetNumbering != null ? (data.fyResetNumbering ? 1 : 0) : null,
      data.authorizedSignatory ?? null,
      data.documentStampUrl ?? null,
      now,
      firm.id,
    );
    return this.getFirm(firm.id);
  }

  ensureFirmPrefix(firmId) {
    const firm = this.getFirm(firmId);
    if (!firm) return null;
    if (firm.firmPrefix) return firm;
    const prefix = generateFirmPrefix(firm.businessName);
    return this.updateFirmSettings(firm.id, { firmPrefix: prefix, firmPrefixManual: false });
  }

  listSeries(firmId) {
    const firm = this.getFirm(firmId);
    if (!firm) return [];
    return getDatabase().prepare(`
      SELECT * FROM document_series WHERE firm_id = ? ORDER BY document_type
    `).all(firm.id).map(mapSeries);
  }

  ensureDefaultSeries(firmId) {
    const firm = this.ensureFirmPrefix(firmId);
    if (!firm) return [];
    const db = getDatabase();
    const now = nowIso();
    const existing = new Set(this.listSeries(firm.id).map((s) => s.documentType));

    for (const [type, meta] of Object.entries(DOCUMENT_TYPES)) {
      if (existing.has(type)) continue;
      db.prepare(`
        INSERT INTO document_series (
          id, firm_id, document_type, doc_prefix, format_template,
          starting_number, reset_each_fy, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, 1, 1, 1, ?, ?)
      `).run(generateId(), firm.id, type, meta.docPrefix, now, now);
    }
    return this.listSeries(firm.id);
  }

  upsertSeries(firmId, documentType, data) {
    const firm = this.ensureFirmPrefix(firmId);
    if (!firm) return null;
    const db = getDatabase();
    const now = nowIso();
    const existing = db.prepare(`
      SELECT * FROM document_series WHERE firm_id = ? AND document_type = ?
    `).get(firm.id, documentType);

    if (existing) {
      db.prepare(`
        UPDATE document_series SET
          doc_prefix = COALESCE(?, doc_prefix),
          format_template = COALESCE(?, format_template),
          starting_number = COALESCE(?, starting_number),
          reset_each_fy = COALESCE(?, reset_each_fy),
          is_active = COALESCE(?, is_active),
          updated_at = ?
        WHERE id = ?
      `).run(
        data.docPrefix ?? null,
        data.formatTemplate ?? null,
        data.startingNumber ?? null,
        data.resetEachFy != null ? (data.resetEachFy ? 1 : 0) : null,
        data.isActive != null ? (data.isActive ? 1 : 0) : null,
        now,
        existing.id,
      );
      return mapSeries(db.prepare('SELECT * FROM document_series WHERE id = ?').get(existing.id));
    }

    const meta = DOCUMENT_TYPES[documentType] || { docPrefix: 'DOC' };
    const id = generateId();
    db.prepare(`
      INSERT INTO document_series (
        id, firm_id, document_type, doc_prefix, format_template,
        starting_number, reset_each_fy, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      firm.id,
      documentType,
      data.docPrefix || meta.docPrefix,
      data.formatTemplate || null,
      data.startingNumber ?? 1,
      data.resetEachFy != null ? (data.resetEachFy ? 1 : 0) : 1,
      now,
      now,
    );
    return mapSeries(db.prepare('SELECT * FROM document_series WHERE id = ?').get(id));
  }

  /**
   * Transaction-safe sequential number allocation.
   */
  allocateNumber(firmId, documentType, documentDate = new Date()) {
    const db = getDatabase();
    const firm = this.ensureFirmPrefix(firmId);
    if (!firm) throw new Error('Firm not configured');

    this.ensureDefaultSeries(firm.id);
    const fy = getFinancialYear(documentDate);

    const tx = db.transaction(() => {
      const series = db.prepare(`
        SELECT * FROM document_series WHERE firm_id = ? AND document_type = ? AND is_active = 1
      `).get(firm.id, documentType);
      if (!series) throw new Error(`Document series not configured: ${documentType}`);

      const seqKey = series.reset_each_fy ? fy : 'ALL';
      let seq = db.prepare(`
        SELECT * FROM document_sequences WHERE series_id = ? AND financial_year = ?
      `).get(series.id, seqKey);

      if (!seq) {
        const seqId = generateId();
        db.prepare(`
          INSERT INTO document_sequences (id, series_id, financial_year, last_number)
          VALUES (?, ?, ?, ?)
        `).run(seqId, series.id, seqKey, series.starting_number - 1);
        seq = db.prepare('SELECT * FROM document_sequences WHERE id = ?').get(seqId);
      }

      const nextNum = seq.last_number + 1;
      db.prepare(`
        UPDATE document_sequences SET last_number = ? WHERE id = ?
      `).run(nextNum, seq.id);

      const padded = String(nextNum).padStart(firm.numberPadding || 4, '0');
      const template = series.format_template || firm.documentNumberFormat || '{FIRM}/{DOC}/{NUMBER}/{FY}';
      const docNumber = template
        .replace(/\{FIRM\}/g, firm.firmPrefix || 'CO')
        .replace(/\{DOC\}/g, series.doc_prefix)
        .replace(/\{NUMBER\}/g, padded)
        .replace(/\{FY\}/g, fy);

      return {
        documentNumber: docNumber,
        sequenceNumber: nextNum,
        financialYear: fy,
        firmId: firm.id,
        documentType,
        seriesId: series.id,
      };
    });

    return tx();
  }

  getSequenceStatus(firmId) {
    const firm = this.ensureFirmPrefix(firmId);
    if (!firm) return { firm: null, series: [] };
    const series = this.ensureDefaultSeries(firm.id);
    const db = getDatabase();
    const fy = getFinancialYear();
    return {
      firm,
      financialYear: fy,
      series: series.map((s) => {
        const seqKey = s.resetEachFy ? fy : 'ALL';
        const seq = db.prepare(`
          SELECT last_number FROM document_sequences WHERE series_id = ? AND financial_year = ?
        `).get(s.id, seqKey);
        return {
          ...s,
          currentNumber: seq?.last_number || 0,
          nextNumber: (seq?.last_number || 0) + 1,
          financialYear: seqKey,
        };
      }),
    };
  }
}

export class DocumentShareLogRepository {
  create(data) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    db.prepare(`
      INSERT INTO document_share_log (
        id, document_type, document_id, document_number, action, channel,
        recipient, status, message, metadata_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.documentType,
      data.documentId,
      data.documentNumber || null,
      data.action,
      data.channel || null,
      data.recipient || null,
      data.status || 'attempted',
      data.message || null,
      data.metadataJson ? JSON.stringify(data.metadataJson) : null,
      data.createdBy || null,
      now,
    );
    return { id, ...data, createdAt: now };
  }

  listForDocument(documentType, documentId) {
    return getDatabase().prepare(`
      SELECT * FROM document_share_log
      WHERE document_type = ? AND document_id = ?
      ORDER BY created_at DESC
    `).all(documentType, documentId).map((row) => ({
      id: row.id,
      documentType: row.document_type,
      documentId: row.document_id,
      documentNumber: row.document_number,
      action: row.action,
      channel: row.channel,
      recipient: row.recipient,
      status: row.status,
      message: row.message,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));
  }
}

export class EmailSendLogRepository {
  create(data) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    db.prepare(`
      INSERT INTO email_send_log (
        id, document_type, document_id, to_email, subject, body_preview,
        status, error_message, created_by, created_at, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.documentType || null,
      data.documentId || null,
      data.toEmail,
      data.subject,
      data.bodyPreview || null,
      data.status || 'queued',
      data.errorMessage || null,
      data.createdBy || null,
      now,
      data.sentAt || null,
    );
    return { id, ...data, createdAt: now };
  }

  updateStatus(id, status, errorMessage = null, sentAt = null) {
    getDatabase().prepare(`
      UPDATE email_send_log SET status = ?, error_message = ?, sent_at = COALESCE(?, sent_at) WHERE id = ?
    `).run(status, errorMessage, sentAt, id);
  }
}
