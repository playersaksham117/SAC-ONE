import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import {
  authService,
  companyService,
  userService,
  roleService,
  auditService,
} from '../services/index.js';

const router = Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password, req);
  sendSuccess(res, result);
}));

router.post('/logout', authenticate(), asyncHandler(async (req, res) => {
  const result = authService.logout(req.token, req);
  sendSuccess(res, result);
}));

router.get('/me', authenticate(), asyncHandler(async (req, res) => {
  sendSuccess(res, req.actor);
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
userRouter.post('/:id/deactivate', asyncHandler(async (req, res) => {
  sendSuccess(res, userService.deactivate(req.params.id, req.actor, req));
}));
userRouter.post('/:id/activate', asyncHandler(async (req, res) => {
  sendSuccess(res, userService.activate(req.params.id, req.actor, req));
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
