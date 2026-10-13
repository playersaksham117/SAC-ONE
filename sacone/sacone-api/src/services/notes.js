import { AppError } from '../core/http.js';
import { financialYearOf, isFinancialYear } from '../core/financial-year.js';
import { currentFinancialYear } from '../database/context.js';
import { getDatabase } from '../database/connection.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';

/**
 * GST credit notes (customer returns, from SAC-POS or the ERP) and debit notes (returns to
 * suppliers). Each return record is its note; this service lists them by financial year and
 * gives older returns, made before notes existed, their numbers in date order.
 */

const numberingRepo = repos.documentNumbering;
const returnRepo = repos.posReturns;
const purchaseRepo = repos.purchases;

function giveNumbers(rows, documentType, dateOf, save) {
  if (!rows.length) return;
  const firm = numberingRepo.getFirm();
  if (!firm) throw new AppError('Company not configured', 400);
  for (const row of rows) {
    const date = dateOf(row);
    const note = numberingRepo.allocateNumber(firm.id, documentType, new Date(date));
    save(row.id, note.documentNumber, financialYearOf(date));
  }
}

/** Gives returns made before notes existed their numbers (date order) — run before any new note. */
export function numberOldCreditNotes() {
  giveNumbers(returnRepo.findWithoutNoteNumber(), 'credit_note', (r) => r.created_at,
    (id, number, fy) => returnRepo.setNoteNumber(id, number, fy));
}

export function numberOldDebitNotes() {
  giveNumbers(purchaseRepo.findReturnsWithoutNoteNumber(), 'debit_note', (r) => String(r.return_date).slice(0, 10),
    (id, number, fy) => purchaseRepo.setReturnNoteNumber(id, number, fy));
}

/** '2026-27' from the query, 'all' for every year, otherwise the year chosen at sign-in. */
function yearFilter(query) {
  if (query.financialYear === 'all') return '';
  if (isFinancialYear(query.financialYear)) return query.financialYear;
  return currentFinancialYear()?.code || financialYearOf(new Date());
}

const listLimit = (query) => Math.min(Math.max(parseInt(query.limit, 10) || 500, 1), 5000);

export class NoteService {
  /** Years that have notes, plus the current one, newest first. */
  financialYears(actor) {
    try {
      authService.checkPermission(actor.permissions, 'pos.returns.view');
    } catch {
      authService.checkPermission(actor.permissions, 'purchases.returns.view');
    }
    const db = getDatabase();
    const years = new Set([currentFinancialYear()?.code || financialYearOf(new Date())]);
    for (const table of ['pos_sales_returns', 'purchase_returns']) {
      db.prepare(`SELECT DISTINCT financial_year FROM ${table} WHERE financial_year IS NOT NULL`).all()
        .forEach((r) => years.add(r.financial_year));
    }
    return {
      current: currentFinancialYear()?.code || financialYearOf(new Date()),
      years: [...years].filter(isFinancialYear).sort().reverse(),
    };
  }

  listCreditNotes(query, actor) {
    authService.checkPermission(actor.permissions, 'pos.returns.view');
    numberOldCreditNotes();
    return returnRepo.findAll({
      financialYear: yearFilter(query),
      customerId: query.customerId || '',
      search: String(query.search || '').trim(),
      limit: listLimit(query),
      offset: parseInt(query.offset, 10) || 0,
    });
  }

  getCreditNote(id, actor) {
    authService.checkPermission(actor.permissions, 'pos.returns.view');
    numberOldCreditNotes();
    const note = returnRepo.findById(id);
    if (!note) throw new AppError('Credit note not found', 404);
    return note;
  }

  listDebitNotes(query, actor) {
    authService.checkPermission(actor.permissions, 'purchases.returns.view');
    numberOldDebitNotes();
    return purchaseRepo.listReturns({
      financialYear: yearFilter(query),
      supplierId: query.supplierId || '',
      search: String(query.search || '').trim(),
      limit: listLimit(query),
      offset: parseInt(query.offset, 10) || 0,
    });
  }

  getDebitNote(id, actor) {
    authService.checkPermission(actor.permissions, 'purchases.returns.view');
    numberOldDebitNotes();
    const note = purchaseRepo.findReturnById(id);
    if (!note) throw new AppError('Debit note not found', 404);
    return note;
  }
}

export const noteService = new NoteService();
