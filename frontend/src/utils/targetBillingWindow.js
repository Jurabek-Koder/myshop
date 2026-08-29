import { getDateTimePartsInUzbekistan, formatIsoDateLabelUz } from './uzbekistanTime.js';

export function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isTargetBillingActive(date = new Date()) {
  const p = getDateTimePartsInUzbekistan(date);
  if (!p) return false;
  const day = Number(p.day);
  const year = Number(p.year);
  const month = Number(p.month);
  if (day === 15) return true;
  return day === lastDayOfMonth(year, month);
}

export function getNextTargetBillingActiveIso(from = new Date()) {
  for (let i = 0; i <= 62; i += 1) {
    const candidate = new Date(from.getTime() + i * 86400000);
    if (isTargetBillingActive(candidate)) {
      const p = getDateTimePartsInUzbekistan(candidate);
      return p ? `${p.year}-${p.month}-${p.day}` : null;
    }
  }
  return null;
}

export function buildTargetBillingWindowClient(from = new Date()) {
  const active = isTargetBillingActive(from);
  const todayParts = getDateTimePartsInUzbekistan(from);
  const today = todayParts ? `${todayParts.year}-${todayParts.month}-${todayParts.day}` : '';
  const nextIso = active
    ? getNextTargetBillingActiveIso(new Date(from.getTime() + 86400000))
    : getNextTargetBillingActiveIso(from);

  return {
    active,
    today,
    next_active_date: nextIso,
    next_active_label: nextIso ? formatIsoDateLabelUz(nextIso) : null,
    active_days_label: 'Har oyning 15-kuni va oxirgi kuni',
    message: active
      ? 'Hisobingiz bugun faol.'
      : 'Hisob vaqtincha qulflangan. Faqat har oyning 15-kuni va oxirgi kunida ochiladi.',
  };
}
