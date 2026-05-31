const MANILA_LOCALE = "en-PH";
const MANILA_TIME_ZONE = "Asia/Manila";

function normalizeUtcTimestamp(timestamp: string) {
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(timestamp);
  return hasTimezone ? timestamp : `${timestamp}Z`;
}

export function formatManilaDateTime(timestamp: string) {
  return new Intl.DateTimeFormat(MANILA_LOCALE, {
    timeZone: MANILA_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(normalizeUtcTimestamp(timestamp)));
}

export function formatManilaTime(timestamp: string) {
  return new Intl.DateTimeFormat(MANILA_LOCALE, {
    timeZone: MANILA_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(normalizeUtcTimestamp(timestamp)));
}

export function formatManilaDateInput(timestamp: string) {
  const parts = new Intl.DateTimeFormat(MANILA_LOCALE, {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(normalizeUtcTimestamp(timestamp)));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

export function getUtcTimestampMs(timestamp: string) {
  return new Date(normalizeUtcTimestamp(timestamp)).getTime();
}

export function createUtcTimestamp() {
  return new Date().toISOString();
}
