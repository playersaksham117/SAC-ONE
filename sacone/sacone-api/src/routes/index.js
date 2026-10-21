import { posPins } from '../services/pos-pins.js';
import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { firmService } from '../services/firms.js';

const signedIn = () => authenticate(true, { firm: 'optional' });
import {
  authService,
  companyService,
  userService,
  roleService,
  auditService,
} from '../services/index.js';

const router = Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password, firmId, financialYear } = req.body || {};
  const result = await authService.login(email, password, req, { firmId, financialYear });
  sendSuccess(res, result);
}));

router.post('/logout', signedIn(), asyncHandler(async (req, res) => {
  const result = authService.logout(req.token, req);
  sendSuccess(res, result);
}));

router.get('/me', signedIn(), asyncHandler(async (req, res) => {
  sendSuccess(res, req.actor);
}));

// Firm and financial year picker, shown after every sign-in and from the header switcher.
router.put('/me/password', signedIn(), asyncHandler(async (req, res) => {
  sendSuccess(res, authService.changePassword(req.actor, req.body || {}, req));
}));

// My own SAC-POS PIN (current password required); admins set other people's in Users.
router.get('/me/pos-pin', signedIn(), asyncHandler(async (req, res) => {
  sendSuccess(res, posPins.own(req.actor));
}));
router.put('/me/pos-pin', signedIn(), asyncHandler(async (req, res) => {
  sendSuccess(res, posPins.setOwn(req.actor, req.body || {}, req));
}));

router.get('/firms', signedIn(), asyncHandler(async (req, res) => {
  sendSuccess(res, firmService.choices(req.actor.user));
}));
router.post('/select-firm', signedIn(), asyncHandler(async (req, res) => {
  firmService.select(req.token, req.actor.user, req.body || {});
  sendSuccess(res, authService.getSession(req.token));
}));

export default router;

export const companyRouter = Router();
companyRouter.use(authenticate());
companyRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, companyService.get());
}));
companyRouter.put('/', asyncHandler(async (req, res) => {
  sendSuccess(res, companyService.update(req.body, req.actor, req));
}));

export const userRouter = Router();
userRouter.use(authenticate());
userRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, userService.list(req.actor));
}));
userRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, userService.getById(req.params.id, req.actor));
}));
userRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, userService.create(req.body, req.actor, req), 201);
}));
userRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, userService.update(req.params.id, req.body, req.actor, req));
}));
// SAC-POS Login ID and PIN (set only here, never on the phone). { loginId?, pin?, clear? }
userRouter.put('/:id/pos-pin', asyncHandler(async (req, res) => {
  sendSuccess(res, posPins.set(req.params.id, req.body || {}, req.actor, req));
}));
userRouter.post('/:id/deactivate', asyncHandler(async (req, res) => {
  sendSuccess(res, userService.deactivate(req.params.id, req.actor, req));
}));
userRouter.post('/:id/activate', asyncHandler(async (req, res) => {
  sendSuccess(res, userService.activate(req.params.id, req.actor, req));
}));

// Firms (owner): add a firm with its own books, rename, switch off.
export const firmRouter = Router();
firmRouter.use(signedIn());
firmRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, firmService.list(req.actor));
}));
// The open firm's full profile (Company & Firms → "This firm").
firmRouter.get('/current', authenticate(), asyncHandler(async (req, res) => {
  sendSuccess(res, firmService.current(req.actor));
}));
firmRouter.put('/current', authenticate(), asyncHandler(async (req, res) => {
  sendSuccess(res, firmService.updateCurrent(req.body || {}, req.actor, req));
}));
// Registered firms' addresses, for the Ship To picker on bills (any signed-in user).
firmRouter.get('/addresses', asyncHandler(async (req, res) => {
  sendSuccess(res, firmService.shipToAddresses());
}));
firmRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, firmService.get(req.params.id, req.actor));
}));
firmRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, firmService.create(req.body || {}, req.actor, req), 201);
}));
firmRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, firmService.update(req.params.id, req.body || {}, req.actor, req));
}));
// Group owner: create a firm's admin (each firm's users and roles are its own).
firmRouter.post('/:id/admins', asyncHandler(async (req, res) => {
  sendSuccess(res, userService.createFirmAdmin(req.params.id, req.body || {}, req.actor, req), 201);
}));

export const roleRouter = Router();
roleRouter.use(authenticate());
roleRouter.get('/permission-tree', asyncHandler(async (req, res) => {
  sendSuccess(res, roleService.getPermissionTree(req.actor));
}));
roleRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, roleService.list(req.actor));
}));
roleRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, roleService.getById(req.params.id, req.actor));
}));
roleRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, roleService.create(req.body, req.actor, req), 201);
}));
roleRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, roleService.update(req.params.id, req.body, req.actor, req));
}));
roleRouter.delete('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, roleService.delete(req.params.id, req.actor, req));
}));

export const auditRouter = Router();
auditRouter.use(authenticate());
auditRouter.get('/', asyncHandler(async (req, res) => {
  const { module, userId, limit, offset } = req.query;
  sendSuccess(res, auditService.list({
    module,
    userId,
    limit: limit ? parseInt(limit, 10) : 100,
    offset: offset ? parseInt(offset, 10) : 0,
  }, req.actor));
}));
