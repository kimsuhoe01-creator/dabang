const SAPPORO_ONE_PLUS_ONE_ID = "52c29562-ac31-42c7-9f24-956d348de02a";
const STORE_TIME_ZONE = "Asia/Ho_Chi_Minh";
const DAILY_CUTOFF_MINUTES = 19 * 60;
const SPACE_PIZZA_DAY_OFF_DATE = "2026-09-03";
const SPACE_PIZZA_CATEGORY = "스페이스 피자";
const SPACE_PIZZA_MENU_IDS = [
  "c0f16b37-ff76-4d8e-a5a8-3ead5fd7b0a5",
  "d902dc7b-b6b7-402d-aa90-4edb1e5cfbc2",
  "433a6207-b8cf-4333-aa33-f344d6bfeb31",
  "a84fa28e-bac3-45c2-9e00-5138b660ecd7",
  "646d2461-e692-4275-97a0-0ba277913e92",
  "5e53f8d3-3b1e-4c08-82d0-136726552c5b",
  "89116940-5e7e-4e1e-b808-a0a2fdb5798e",
  "18c2eb1b-5a99-459e-98b2-8c630036442a",
];
const CHICKEN_PIZZA_SET_IDS = [
  "e1cf1187-b643-4b90-9f6f-9a7458eaf037",
  "1ffd639e-dd8f-4185-9ab9-4b187835b21c",
];
const AVAILABILITY_OBJECT_NAME = "__dabang_menu_availability__";
const INTERNAL_URL = "https://availability.internal/state";

export async function handleAvailabilityApi(request, env, allowedOrigins) {
  const url = new URL(request.url);
  if (url.pathname === "/api/tablet/availability" && request.method === "GET") {
    if (!allowedOrigins.has(request.headers.get("Origin") || "")) {
      return json({ ok: false, code: "ORIGIN_NOT_ALLOWED", message: "허용되지 않은 판매상태 조회 요청입니다." }, 403);
    }
    return json({ ok: true, ...(await getAvailabilitySnapshot(env)) });
  }
  if (url.pathname !== "/api/admin/menu-availability" || request.method !== "POST") return null;
  if (!allowedOrigins.has(request.headers.get("Origin") || "")) {
    return json({ ok: false, code: "ORIGIN_NOT_ALLOWED", message: "허용되지 않은 관리자 요청입니다." }, 403);
  }
  if (!(await verifyAdminToken(request, env.MENU_ADMIN_TOKEN))) {
    return json({ ok: false, code: "UNAUTHORIZED", message: "관리자 인증키가 올바르지 않습니다." }, 401);
  }
  try {
    const payload = await request.json();
    const menuId = cleanGuid(payload?.menuId);
    if (!menuId || typeof payload?.available !== "boolean") {
      return json({ ok: false, code: "INVALID_AVAILABILITY", message: "메뉴와 판매상태를 확인해 주세요." }, 400);
    }
    const state = await writeManualAvailability(env, menuId, payload.available);
    return json({ ok: true, ...buildAvailabilitySnapshot(state.manualUnavailableMenuIds) });
  } catch (error) {
    return json({ ok: false, code: "AVAILABILITY_UPDATE_FAILED", message: "판매상태를 저장하지 못했습니다." }, 502);
  }
}

export async function getAvailabilitySnapshot(env, now = new Date()) {
  const state = await readManualAvailability(env);
  return buildAvailabilitySnapshot(state.manualUnavailableMenuIds, now);
}

export function buildAvailabilitySnapshot(manualUnavailableMenuIds = [], now = new Date()) {
  const manual = [...new Set((Array.isArray(manualUnavailableMenuIds) ? manualUnavailableMenuIds : []).map(cleanGuid).filter(Boolean))];
  const schedule = scheduleAt(now);
  const scheduled = schedule.closed ? [SAPPORO_ONE_PLUS_ONE_ID] : [];
  const categoryClosures = storeDateAt(now) === SPACE_PIZZA_DAY_OFF_DATE ? [{
    key: `space-pizza-day-off-${SPACE_PIZZA_DAY_OFF_DATE}`,
    categoryName: SPACE_PIZZA_CATEGORY,
    menuIds: [...SPACE_PIZZA_MENU_IDS, ...CHICKEN_PIZZA_SET_IDS],
    hiddenMenuIds: [...SPACE_PIZZA_MENU_IDS, ...CHICKEN_PIZZA_SET_IDS],
    title: {
      ko: "스페이스 피자 금일 휴무",
      vi: "Space Pizza hôm nay nghỉ",
      zh: "Space Pizza 今日休息",
      en: "Space Pizza is closed today",
    },
    message: {
      ko: "오늘은 피자 메뉴를 주문하실 수 없습니다.",
      vi: "Hôm nay không thể gọi các món pizza.",
      zh: "今天暂时无法订购披萨类菜单。",
      en: "Pizza items are unavailable to order today.",
    },
  }] : [];
  const closureUnavailable = categoryClosures.flatMap(closure => closure.menuIds);
  return {
    timeZone: STORE_TIME_ZONE,
    generatedAt: now.toISOString(),
    manualUnavailableMenuIds: manual,
    scheduledUnavailableMenuIds: scheduled,
    closureUnavailableMenuIds: closureUnavailable,
    unavailableMenuIds: [...new Set([...manual, ...scheduled, ...closureUnavailable])],
    categoryClosures,
    nextScheduleChangeInMs: Math.min(schedule.nextChangeInMs, millisecondsUntilNextStoreDay(now)),
  };
}

export function applyAvailabilityToMenuData(menuData, snapshot) {
  const unavailable = new Set(snapshot?.unavailableMenuIds || []);
  return {
    ...menuData,
    menus: (menuData?.menus || []).map(menu => ({
      ...menu,
      available: menu.available !== false && !unavailable.has(String(menu.id)),
    })),
  };
}

export async function readAvailabilityStorage(storage) {
  const state = await storage.get("menuAvailability");
  return normalizeState(state);
}

export async function writeAvailabilityStorage(storage, menuIdValue, available) {
  const menuId = cleanGuid(menuIdValue);
  if (!menuId || typeof available !== "boolean") throw new Error("invalid availability state");
  const state = await readAvailabilityStorage(storage);
  const unavailable = new Set(state.manualUnavailableMenuIds);
  if (available) unavailable.delete(menuId);
  else unavailable.add(menuId);
  const next = { manualUnavailableMenuIds: [...unavailable], updatedAt: new Date().toISOString() };
  await storage.put("menuAvailability", next);
  return next;
}

async function readManualAvailability(env) {
  if (!env.TABLE_ORDERS?.getByName) return normalizeState(null);
  const coordinator = env.TABLE_ORDERS.getByName(AVAILABILITY_OBJECT_NAME);
  const response = await coordinator.fetch(INTERNAL_URL, { method: "GET" });
  if (!response.ok) throw new Error("availability storage unavailable");
  return normalizeState(await response.json());
}

async function writeManualAvailability(env, menuId, available) {
  if (!env.TABLE_ORDERS?.getByName) throw new Error("availability storage unavailable");
  const coordinator = env.TABLE_ORDERS.getByName(AVAILABILITY_OBJECT_NAME);
  const response = await coordinator.fetch(INTERNAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ menuId, available }),
  });
  if (!response.ok) throw new Error("availability storage update failed");
  return normalizeState(await response.json());
}

function scheduleAt(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STORE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: Number(part.value) }), {});
  const milliseconds = ((parts.hour || 0) * 60 * 60 + (parts.minute || 0) * 60 + (parts.second || 0)) * 1000 + now.getMilliseconds();
  const cutoff = DAILY_CUTOFF_MINUTES * 60 * 1000;
  const day = 24 * 60 * 60 * 1000;
  return milliseconds >= cutoff
    ? { closed: true, nextChangeInMs: Math.max(1000, day - milliseconds) }
    : { closed: false, nextChangeInMs: Math.max(1000, cutoff - milliseconds) };
}

function storeDateAt(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function millisecondsUntilNextStoreDay(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STORE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: Number(part.value) }), {});
  const elapsed = ((parts.hour || 0) * 60 * 60 + (parts.minute || 0) * 60 + (parts.second || 0)) * 1000 + now.getMilliseconds();
  return Math.max(1000, 24 * 60 * 60 * 1000 - elapsed);
}

async function verifyAdminToken(request, expected) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !expected) return false;
  const [left, right] = await Promise.all([digest(token), digest(expected)]);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function normalizeState(value) {
  return {
    manualUnavailableMenuIds: [...new Set((Array.isArray(value?.manualUnavailableMenuIds) ? value.manualUnavailableMenuIds : []).map(cleanGuid).filter(Boolean))],
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null,
  };
}

function cleanGuid(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
