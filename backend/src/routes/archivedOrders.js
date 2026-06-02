import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import {
  assignArchivedOrderToPacker,
  listActivePackers,
  listArchivedOrders,
  updateArchivedOrderStatus,
  archiveOrderById,
} from '../services/archivedOrdersService.js';

const router = Router();

router.use(authRequired, requireRole('operator', 'warehouse_admin', 'superuser'));

function canManageOrders(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'warehouse_admin' || role === 'superuser') return true;
  if (Number(req.user?.role_id) === 1) return true;
  return false;
}

function sendServiceError(res, err) {
  const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({ error: err?.message || 'Xatolik' });
}

router.get('/', (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const role = String(req.user?.role || '').toLowerCase();
    const operatorUserId = role === 'operator' ? req.user.id : null;
    const orders = listArchivedOrders({ operatorUserId, search });
    res.json({ orders, can_manage: canManageOrders(req) });
  } catch (err) {
    sendServiceError(res, err);
  }
});

router.get('/packers', (req, res) => {
  if (!canManageOrders(req)) {
    return res.status(403).json({ error: 'Ruxsat yo\'q.' });
  }
  try {
    res.json({ packers: listActivePackers() });
  } catch (err) {
    sendServiceError(res, err);
  }
});

router.patch('/:id/status', (req, res) => {
  if (!canManageOrders(req)) {
    return res.status(403).json({ error: 'Faqat ombor admini yoki superuser holatni o\'zgartira oladi.' });
  }
  try {
    const updated = updateArchivedOrderStatus(req.params.id, req.body?.status);
    res.json(updated);
  } catch (err) {
    sendServiceError(res, err);
  }
});

router.post('/:id/archive', (req, res) => {
  if (!canManageOrders(req)) {
    return res.status(403).json({ error: 'Ruxsat yo\'q.' });
  }
  try {
    const updated = archiveOrderById(req.params.id);
    res.json(updated);
  } catch (err) {
    sendServiceError(res, err);
  }
});

router.post('/:id/assign-packer', (req, res) => {
  if (!canManageOrders(req)) {
    return res.status(403).json({ error: 'Faqat ombor admini yoki superuser packerga yubora oladi.' });
  }
  try {
    const updated = assignArchivedOrderToPacker(req.params.id, req.body?.packer_id);
    res.json(updated);
  } catch (err) {
    sendServiceError(res, err);
  }
});

export default router;
