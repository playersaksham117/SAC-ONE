import { AppError } from '../core/http.js';
import { repos } from '../repositories/index.js';
import { authService, isFirmAdmin } from './index.js';
import { generateFirmPrefix } from '../core/firm-prefix.js';

const numberingRepo = repos.documentNumbering;

function getRequestMeta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

export class DocumentNumberingService {
  getSettings(actor) {
    authService.checkPermission(actor.permissions, 'core.document_numbering.view');
    const status = numberingRepo.getSequenceStatus();
    return status;
  }

  updateFirmSettings(data, actor, req) {
    authService.checkPermission(actor.permissions, 'core.document_numbering.edit');
    const firm = numberingRepo.getFirm();
    if (!firm) throw new AppError('Company not configured', 400);

    let firmPrefix = data.firmPrefix;
    if (firmPrefix != null) {
      firmPrefix = String(firmPrefix).trim().toUpperCase().slice(0, 8);
    } else if (data.businessName && !firm.firmPrefixManual) {
      firmPrefix = generateFirmPrefix(data.businessName);
    }

    const updated = numberingRepo.updateFirmSettings(firm.id, {
      firmPrefix,
      firmPrefixManual: data.firmPrefix != null ? true : firm.firmPrefixManual,
      documentNumberFormat: data.documentNumberFormat,
      simpleNumberFormat: data.simpleNumberFormat,
      numberPadding: data.numberPadding != null ? parseInt(data.numberPadding, 10) : undefined,
      fyResetNumbering: data.fyResetNumbering,
      authorizedSignatory: data.authorizedSignatory,
      documentStampUrl: data.documentStampUrl,
    });

    numberingRepo.ensureDefaultSeries(firm.id);

    repos.auditLogs.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'core',
      recordType: 'document_numbering',
      recordId: firm.id,
      newValue: updated,
      ...getRequestMeta(req),
    });

    return numberingRepo.getSequenceStatus(firm.id);
  }

  #assertAdmin(actor) {
    authService.checkPermission(actor.permissions, 'core.document_numbering.edit');
    if (!isFirmAdmin(actor.user)) throw new AppError('Only the firm admin or the group owner can change document series', 403, 'OWNER_ONLY');
  }

  /** Admin only: the number the next document of this series gets (opening number). */
  setNextNumber(documentType, data, actor, req) {
    this.#assertAdmin(actor);
    const n = Number(data?.nextNumber);
    if (!Number.isInteger(n) || n < 1 || n > 99999999) throw new AppError('Next number must be a whole number from 1', 400);
    const firm = numberingRepo.getFirm();
    if (!firm) throw new AppError('Company not configured', 400);
    const res = numberingRepo.setNextNumber(firm.id, documentType, n);
    if (res.taken) throw new AppError(`${res.taken} is already used by a bill. Choose a number after the bills already made.`, 409, 'NUMBER_TAKEN');
    repos.auditLogs.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'core',
      recordType: 'document_series',
      recordId: documentType,
      newValue: { nextNumber: n, next: res.next },
      ...getRequestMeta(req),
    });
    return numberingRepo.getSequenceStatus(firm.id);
  }

  updateSeries(documentType, data, actor, req) {
    this.#assertAdmin(actor);
    const firm = numberingRepo.getFirm();
    if (!firm) throw new AppError('Company not configured', 400);
    const series = numberingRepo.upsertSeries(firm.id, documentType, {
      docPrefix: data.docPrefix,
      formatTemplate: data.formatTemplate,
      startingNumber: data.startingNumber != null ? parseInt(data.startingNumber, 10) : undefined,
      resetEachFy: data.resetEachFy,
      isActive: data.isActive,
    });
    repos.auditLogs.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'core',
      recordType: 'document_series',
      recordId: series.id,
      newValue: series,
      ...getRequestMeta(req),
    });
    return series;
  }

  allocate(documentType, documentDate, actor) {
    const firm = numberingRepo.getFirm();
    if (!firm) throw new AppError('Company not configured', 400);
    return numberingRepo.allocateNumber(firm.id, documentType, documentDate);
  }
}

export const documentNumberingService = new DocumentNumberingService();
