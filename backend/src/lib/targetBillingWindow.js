const UZ_TIMEZONE = 'Asia/Tashkent';

export function getUzCalendarParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: UZ_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = {};
  for (const { type, value } of parts) {
    if (type !== 'literal') map[type] = value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    iso: `${map.year}-${map.month}-${map.day}`,
  };
}

export function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Hisob faqat oyning 15-kuni va oxirgi kunida ochiq. */
export function isTargetBillingActive(date = new Date()) {
  const { year, month, day } = getUzCalendarParts(date);
  if (day === 15) return true;
  const last = lastDayOfMonth(year, month);
  return day === last;
}

function formatIsoDateUz(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const inst = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  return inst.toLocaleDateString('uz-UZ', {
    timeZone: UZ_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getNextTargetBillingActiveDate(from = new Date()) {
  for (let i = 0; i <= 62; i += 1) {
    const candidate = new Date(from.getTime() + i * 86400000);
    if (isTargetBillingActive(candidate)) {
      return getUzCalendarParts(candidate).iso;
    }
  }
  return null;
}

export function getTargetBillingWindowInfo(from = new Date()) {
  const active = isTargetBillingActive(from);
  const today = getUzCalendarParts(from);
  const nextIso = active ? getNextTargetBillingActiveDate(new Date(from.getTime() + 86400000)) : getNextTargetBillingActiveDate(from);

  return {
    active,
    timezone: UZ_TIMEZONE,
    today: today.iso,
    active_days: ['month_day_15', 'month_last_day'],
    active_days_label: 'Har oyning 15-kuni va oxirgi kuni',
    next_active_date: nextIso,
    next_active_label: nextIso ? formatIsoDateUz(nextIso) : null,
    message: active
      ? 'Hisobingiz bugun faol. Pul yechish va to\'lov amallaridan foydalanishingiz mumkin.'
      : 'Hisob vaqtincha qulflangan. Faqat har oyning 15-kuni va oxirgi kunida ochiladi.',
  };
}

export function requireTargetBillingOpen(req, res, next) {
  const info = getTargetBillingWindowInfo();
  if (!info.active) {
    return res.status(423).json({
      error: info.message,
      billing_locked: true,
      billing_window: info,
    });
  }
  return next();
}
