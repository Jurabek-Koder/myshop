import cron from 'node-cron';
import { db } from '../../db/database.js';
import { recalculatePayrollCycleStatuses } from './accountingSchema.js';

let started = false;

export function scheduleAccountingCronJobs() {
  if (started) return;
  started = true;

  cron.schedule('*/30 * * * *', () => {
    try {
      recalculatePayrollCycleStatuses(db);
    } catch (err) {
      console.error('[accounting] payroll cron failed:', err);
    }
  });

  cron.schedule('0 8 * * *', () => {
    try {
      recalculatePayrollCycleStatuses(db);
    } catch (err) {
      console.error('[accounting] daily payroll refresh failed:', err);
    }
  });
}
