export const MONDAY_POCHA_MENU_ID = "899a8524-b720-4828-b7fc-1f2472ce962a";
export const MONDAY_POCHA_REGULAR_PRICE = 540000;
export const MONDAY_POCHA_DISCOUNT_PRICE = 378000;

export function mondayPochaActiveAt(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).map(part => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return date >= "2026-11-16" && parts.weekday === "Mon" && minutes >= 16 * 60 && minutes < 23 * 60;
}

export function mondayPochaDisplayPrice(menu, now = new Date()) {
  return String(menu?.id) === MONDAY_POCHA_MENU_ID
    && Number(menu?.price) === MONDAY_POCHA_REGULAR_PRICE
    && mondayPochaActiveAt(now)
    ? MONDAY_POCHA_DISCOUNT_PRICE
    : Number(menu?.price) || 0;
}
