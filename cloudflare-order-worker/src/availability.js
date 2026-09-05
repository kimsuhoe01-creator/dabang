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
const MAX_AUDIT_EVENTS = 100;
const MAX_MANUAL_HOLD_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_MANUAL_ENTRIES = 200;

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
    const state = await setManualAvailability(env, menuId, payload.available, {
      actor: "tablet-admin",
      reason: payload?.reason,
      menuName: payload?.menuName,
      expiresAt: payload?.expiresAt,
      requestId: payload?.requestId,
    });
    return json({ ok: true, ...buildAvailabilitySnapshot(state) });
  } catch (error) {
    return json({ ok: false, code: "AVAILABILITY_UPDATE_FAILED", message: "판매상태를 저장하지 못했습니다." }, 502);
  }
}

export async function getAvailabilitySnapshot(env, now = new Date()) {
  const state = await readManualAvailability(env, now);
  return buildAvailabilitySnapshot(state, now);
}

export async function getManualAvailabilityState(env, now = new Date()) {
  return readManualAvailability(env, now);
}

export async function setManualAvailability(env, menuId, available, options = {}) {
  if (!env.TABLE_ORDERS?.getByName) throw new Error("availability storage unavailable");
  const coordinator = env.TABLE_ORDERS.getByName(AVAILABILITY_OBJECT_NAME);
  const response = await coordinator.fetch(INTERNAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ menuId, available, ...options }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const error = new Error(result?.message || "availability storage update failed");
    error.status = response.status;
    error.code = result?.code || "AVAILABILITY_UPDATE_FAILED";
    throw error;
  }
  return response.json();
}

export async function setManualVisibility(env, menuId, visible, options = {}) {
  if (!env.TABLE_ORDERS?.getByName) throw new Error("availability storage unavailable");
  const coordinator = env.TABLE_ORDERS.getByName(AVAILABILITY_OBJECT_NAME);
  const response = await coordinator.fetch(INTERNAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ menuId, visible, ...options }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const error = new Error(result?.message || "visibility storage update failed");
    error.status = response.status;
    error.code = result?.code || "VISIBILITY_UPDATE_FAILED";
    throw error;
  }
  return response.json();
}

export function buildAvailabilitySnapshot(manualStateOrIds = [], now = new Date()) {
  const state = normalizeState(manualStateOrIds, now);
  const manual = state.manualUnavailableMenuIds;
  const manualHidden = state.manualHiddenMenuIds;
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
  const closureHidden = categoryClosures.flatMap(closure => closure.hiddenMenuIds || []);
  const manualExpiryChangeInMs = state.manualEntries.reduce((soonest, entry) => {
    if (!entry.expiresAt) return soonest;
    return Math.min(soonest, Math.max(1000, Date.parse(entry.expiresAt) - now.getTime()));
  }, Number.POSITIVE_INFINITY);
  return {
    timeZone: STORE_TIME_ZONE,
    generatedAt: now.toISOString(),
    manualUnavailableMenuIds: manual,
    manualHiddenMenuIds: manualHidden,
    scheduledUnavailableMenuIds: scheduled,
    closureUnavailableMenuIds: closureUnavailable,
    unavailableMenuIds: [...new Set([...manual, ...scheduled, ...closureUnavailable])],
    hiddenMenuIds: [...new Set([...manualHidden, ...closureHidden])],
    categoryClosures,
    nextScheduleChangeInMs: Math.min(schedule.nextChangeInMs, millisecondsUntilNextStoreDay(now), manualExpiryChangeInMs),
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

export async function readAvailabilityStorage(storage, now = new Date()) {
  const state = await storage.get("menuAvailability");
  return normalizeState(state, now);
}

export async function writeAvailabilityStorage(storage, menuIdValue, available, options = {}, now = new Date()) {
  const menuId = cleanGuid(menuIdValue);
  if (!menuId || typeof available !== "boolean") throw new Error("invalid availability state");
  const state = await readAvailabilityStorage(storage, now);
  const requestId = cleanLimitedText(options?.requestId, 100);
  if (requestId && !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new Error("invalid request id");
  const replay = requestId ? state.auditLog.find(event => event.requestId === requestId) : null;
  if (replay) {
    if (replay.menuId !== menuId || replay.operationType !== "availability" || replay.available !== available) {
      throw new Error("request id was already used for another availability operation");
    }
    return { ...state, replayed: true, operation: replay };
  }

  const entries = new Map(state.manualEntries.map(entry => [entry.menuId, entry]));
  if (!available && !entries.has(menuId) && entries.size >= MAX_MANUAL_ENTRIES) throw new Error("too many active availability entries");
  const changedAt = now.toISOString();
  const expiresAt = available ? null : normalizeFutureExpiry(options?.expiresAt, now);
  const reason = cleanLimitedText(options?.reason, 200);
  const menuName = cleanLimitedText(options?.menuName, 160);
  const actor = cleanLimitedText(options?.actor, 80) || "unknown";
  const previous = entries.get(menuId) || null;
  const hidden = previous?.hidden === true;
  if (available && !hidden) entries.delete(menuId);
  else entries.set(menuId, {
    menuId,
    menuName: menuName || previous?.menuName || "",
    held: !available,
    hidden,
    expiresAt,
    reason,
    actor,
    changedAt,
  });

  const operation = { operationType: "availability", requestId: requestId || null, menuId, menuName, available, visible: null, expiresAt, reason, actor, changedAt };
  const next = {
    manualEntries: [...entries.values()],
    auditLog: [...state.auditLog, operation].slice(-MAX_AUDIT_EVENTS),
    updatedAt: changedAt,
  };
  await storage.put("menuAvailability", next);
  return { ...normalizeState(next, now), replayed: false, operation };
}

export async function writeVisibilityStorage(storage, menuIdValue, visible, options = {}, now = new Date()) {
  const menuId = cleanGuid(menuIdValue);
  if (!menuId || typeof visible !== "boolean") throw new Error("invalid visibility state");
  const state = await readAvailabilityStorage(storage, now);
  const requestId = cleanLimitedText(options?.requestId, 100);
  if (requestId && !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new Error("invalid request id");
  const replay = requestId ? state.auditLog.find(event => event.requestId === requestId) : null;
  if (replay) {
    if (replay.menuId !== menuId || replay.operationType !== "visibility" || replay.visible !== visible) {
      throw new Error("request id was already used for another menu control operation");
    }
    return { ...state, replayed: true, operation: replay };
  }

  const entries = new Map(state.manualEntries.map(entry => [entry.menuId, entry]));
  if (!visible && !entries.has(menuId) && entries.size >= MAX_MANUAL_ENTRIES) throw new Error("too many active menu control entries");
  const previous = entries.get(menuId) || null;
  const changedAt = now.toISOString();
  const reason = cleanLimitedText(options?.reason, 200);
  const menuName = cleanLimitedText(options?.menuName, 160);
  const actor = cleanLimitedText(options?.actor, 80) || "unknown";
  const held = previous?.held === true;
  if (visible && !held) entries.delete(menuId);
  else entries.set(menuId, {
    menuId,
    menuName: menuName || previous?.menuName || "",
    held,
    hidden: !visible,
    expiresAt: held ? previous?.expiresAt || null : null,
    reason,
    actor,
    changedAt,
  });

  const operation = { operationType: "visibility", requestId: requestId || null, menuId, menuName, available: null, visible, expiresAt: null, reason, actor, changedAt };
  const next = {
    manualEntries: [...entries.values()],
    auditLog: [...state.auditLog, operation].slice(-MAX_AUDIT_EVENTS),
    updatedAt: changedAt,
  };
  await storage.put("menuAvailability", next);
  return { ...normalizeState(next, now), replayed: false, operation };
}

async function readManualAvailability(env, now = new Date()) {
  if (!env.TABLE_ORDERS?.getByName) return normalizeState(null);
  const coordinator = env.TABLE_ORDERS.getByName(AVAILABILITY_OBJECT_NAME);
  const response = await coordinator.fetch(INTERNAL_URL, { method: "GET" });
  if (!response.ok) throw new Error("availability storage unavailable");
  return normalizeState(await response.json(), now);
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

function normalizeState(value, now = new Date()) {
  const legacyIds = Array.isArray(value)
    ? value
    : (Array.isArray(value?.manualUnavailableMenuIds) ? value.manualUnavailableMenuIds : []);
  const rawEntries = Array.isArray(value?.manualEntries)
    ? value.manualEntries
    : legacyIds.map(menuId => ({ menuId, expiresAt: null, reason: "", actor: "legacy", changedAt: value?.updatedAt || null }));
  const entries = new Map();
  for (const raw of rawEntries) {
    const menuId = cleanGuid(raw?.menuId);
    if (!menuId) continue;
    const expiryText = typeof raw?.expiresAt === "string" ? raw.expiresAt.trim() : "";
    const expiryMs = expiryText ? Date.parse(expiryText) : Number.NaN;
    const legacyHeld = raw?.held === undefined ? true : raw.held === true;
    const held = legacyHeld && !(Number.isFinite(expiryMs) && expiryMs <= now.getTime());
    const hidden = raw?.hidden === true;
    if (!held && !hidden) continue;
    entries.set(menuId, {
      menuId,
      menuName: cleanLimitedText(raw?.menuName, 160),
      held,
      hidden,
      expiresAt: held && expiryText && Number.isFinite(expiryMs) ? new Date(expiryMs).toISOString() : null,
      reason: cleanLimitedText(raw?.reason, 200),
      actor: cleanLimitedText(raw?.actor, 80) || "unknown",
      changedAt: normalizeIso(raw?.changedAt),
    });
  }
  const auditLog = (Array.isArray(value?.auditLog) ? value.auditLog : []).slice(-MAX_AUDIT_EVENTS).map(event => ({
    operationType: event?.operationType === "visibility" ? "visibility" : "availability",
    requestId: cleanLimitedText(event?.requestId, 100) || null,
    menuId: cleanGuid(event?.menuId),
    menuName: cleanLimitedText(event?.menuName, 160),
    available: typeof event?.available === "boolean" ? event.available : null,
    visible: typeof event?.visible === "boolean" ? event.visible : null,
    expiresAt: normalizeIso(event?.expiresAt),
    reason: cleanLimitedText(event?.reason, 200),
    actor: cleanLimitedText(event?.actor, 80) || "unknown",
    changedAt: normalizeIso(event?.changedAt),
  })).filter(event => event.menuId);
  return {
    manualUnavailableMenuIds: [...entries.values()].filter(entry => entry.held || entry.hidden).map(entry => entry.menuId),
    manualHiddenMenuIds: [...entries.values()].filter(entry => entry.hidden).map(entry => entry.menuId),
    manualEntries: [...entries.values()],
    auditLog,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null,
  };
}

function normalizeFutureExpiry(value, now) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim())) throw new Error("expiresAt must include a timezone");
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time <= now.getTime()) throw new Error("expiresAt must be in the future");
  if (time - now.getTime() > MAX_MANUAL_HOLD_MS) throw new Error("expiresAt is too far in the future");
  return new Date(time).toISOString();
}

function normalizeIso(value) {
  const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function cleanLimitedText(value, maxLength) {
  return typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maxLength) : "";
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
