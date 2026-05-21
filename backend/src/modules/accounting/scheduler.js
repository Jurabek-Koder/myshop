import { runAccountingAutomation } from './service.js';

let schedulerStarted = false;
let intervalHandle = null;

export function startAccountingScheduler() {
  if (schedulerStarted) return intervalHandle;
  schedulerStarted = true;

  void runAccountingAutomation({ source: 'startup' }).catch((error) => {
    console.error('[accounting] startup automation failed:', error);
  });

  const everyMinutes = Math.max(5, Number(process.env.ACCOUNTING_AUTOMATION_INTERVAL_MINUTES) || 15);
  intervalHandle = setInterval(() => {
    void runAccountingAutomation({ source: 'interval' }).catch((error) => {
      console.error('[accounting] scheduled automation failed:', error);
    });
  }, everyMinutes * 60 * 1000);

  if (typeof intervalHandle?.unref === 'function') {
    intervalHandle.unref();
  }

  return intervalHandle;
}
