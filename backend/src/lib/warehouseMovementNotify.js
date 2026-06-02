import { notifyAccountantsBell } from './accountantBell.js';
import { notifySuperusersBell } from './superuserBell.js';

/** Ombor kirim/chiqim tasdiqlanganda superuser va buxgalteriyaga xabar. */
export function notifyWarehouseMovement(payload) {
  notifySuperusersBell(payload);
  notifyAccountantsBell(payload);
}
