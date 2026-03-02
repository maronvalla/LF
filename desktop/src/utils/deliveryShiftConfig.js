export const DELIVERY_SHIFT_CONFIG_KEY = "lf_delivery_shift_config_v1";

export const DEFAULT_DELIVERY_SHIFT_CONFIG = {
  morningLabel: "MA\u00d1ANA",
  morningDepartureTime: "11:00",
  afternoonLabel: "TARDE",
  afternoonDepartureTime: "19:00",
  morningToAfternoonAt: "11:00",
  rolloverToNextDayAt: "19:30",
};

function normalizeLabel(value, fallback) {
  const cleaned = String(value || "").trim();
  return cleaned || fallback;
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || "").trim());
}

function toMinutes(value) {
  const [hh, mm] = String(value || "00:00").split(":").map(Number);
  return hh * 60 + mm;
}

function dateOnly(value) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function nextDayDate(value) {
  const next = new Date(value);
  next.setDate(value.getDate() + 1);
  return dateOnly(next);
}

export function normalizeDeliveryShiftConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const morningLabel = normalizeLabel(source.morningLabel, DEFAULT_DELIVERY_SHIFT_CONFIG.morningLabel);
  const morningDepartureTime = isValidTime(source.morningDepartureTime)
    ? source.morningDepartureTime
    : DEFAULT_DELIVERY_SHIFT_CONFIG.morningDepartureTime;
  const afternoonLabel = normalizeLabel(source.afternoonLabel, DEFAULT_DELIVERY_SHIFT_CONFIG.afternoonLabel);
  const afternoonDepartureTime = isValidTime(source.afternoonDepartureTime)
    ? source.afternoonDepartureTime
    : DEFAULT_DELIVERY_SHIFT_CONFIG.afternoonDepartureTime;
  const morningToAfternoonAt = isValidTime(source.morningToAfternoonAt)
    ? source.morningToAfternoonAt
    : DEFAULT_DELIVERY_SHIFT_CONFIG.morningToAfternoonAt;
  const rolloverToNextDayAt = isValidTime(source.rolloverToNextDayAt)
    ? source.rolloverToNextDayAt
    : DEFAULT_DELIVERY_SHIFT_CONFIG.rolloverToNextDayAt;

  return {
    morningLabel,
    morningDepartureTime,
    afternoonLabel,
    afternoonDepartureTime,
    morningToAfternoonAt,
    rolloverToNextDayAt,
  };
}

export function loadDeliveryShiftConfig() {
  try {
    const raw = localStorage.getItem(DELIVERY_SHIFT_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_DELIVERY_SHIFT_CONFIG };
    return normalizeDeliveryShiftConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DELIVERY_SHIFT_CONFIG };
  }
}

export function saveDeliveryShiftConfig(config) {
  const normalized = normalizeDeliveryShiftConfig(config);
  localStorage.setItem(DELIVERY_SHIFT_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

export function getSuggestedDeliverySchedule(config, now = new Date()) {
  const normalized = normalizeDeliveryShiftConfig(config);
  const current = now.getHours() * 60 + now.getMinutes();
  const morningToAfternoonAt = toMinutes(normalized.morningToAfternoonAt);
  const rolloverToNextDayAt = toMinutes(normalized.rolloverToNextDayAt);
  const rolloverActive = rolloverToNextDayAt > morningToAfternoonAt;

  if (rolloverActive && current >= rolloverToNextDayAt) {
    const nextDay = new Date(now);
    nextDay.setDate(now.getDate() + 1);
    return { shift: "MANIANA", scheduledDate: dateOnly(nextDay) };
  }

  if (current >= morningToAfternoonAt) {
    return { shift: "TARDE", scheduledDate: dateOnly(now) };
  }

  return { shift: "MANIANA", scheduledDate: dateOnly(now) };
}

export function getScheduledDateForShift(shift, config, now = new Date()) {
  const normalized = normalizeDeliveryShiftConfig(config);
  const current = now.getHours() * 60 + now.getMinutes();
  const morningToAfternoonAt = toMinutes(normalized.morningToAfternoonAt);
  const rolloverToNextDayAt = toMinutes(normalized.rolloverToNextDayAt);
  const normalizedShift = String(shift || "").toUpperCase();

  if (normalizedShift === "MANIANA") {
    return current >= morningToAfternoonAt ? nextDayDate(now) : dateOnly(now);
  }

  if (normalizedShift === "TARDE") {
    return current >= rolloverToNextDayAt ? nextDayDate(now) : dateOnly(now);
  }

  return dateOnly(now);
}

export function getDeliveryShiftOptions(config, now = new Date()) {
  const normalized = normalizeDeliveryShiftConfig(config);
  const current = now.getHours() * 60 + now.getMinutes();
  const morningToAfternoonAt = toMinutes(normalized.morningToAfternoonAt);
  const rolloverToNextDayAt = toMinutes(normalized.rolloverToNextDayAt);

  return [
    {
      value: "MANIANA",
      label:
        current >= morningToAfternoonAt
          ? `${normalized.morningLabel} (${normalized.morningDepartureTime}) (${normalized.morningLabel})`
          : `${normalized.morningLabel} (${normalized.morningDepartureTime})`,
    },
    {
      value: "TARDE",
      label:
        current >= rolloverToNextDayAt
          ? `${normalized.afternoonLabel} (${normalized.afternoonDepartureTime}) (${normalized.morningLabel})`
          : `${normalized.afternoonLabel} (${normalized.afternoonDepartureTime})`,
    },
  ];
}
