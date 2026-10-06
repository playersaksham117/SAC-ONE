import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { noStore, rateLimit } from '../core/rate-limit.js';
import { documentLinkService } from '../services/document-links.js';

/**
 * Public (no sign-in) access to a document through a short-lived share link.
 * The token is POSTed in the body, never put in a URL, so it stays out of access logs.
 */
export const sharedDocumentRouter = Router();
sharedDocumentRouter.use(noStore);

sharedDocumentRouter.post(
  '/resolve',
  rateLimit({ name: 'shared-document', windowMs: 60_000, max: 30, key: (req) => req.ip }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, documentLinkService.resolve(req.body?.token, req));
  }),
);
