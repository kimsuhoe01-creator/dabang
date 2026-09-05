import { login } from "./order.js";
import { buildStoreReport, verifyStoreToken } from "./sales.js";
import { buildAvailabilitySnapshot, getManualAvailabilityState, setManualAvailability, setManualVisibility } from "./availability.js";

const STORE_TIME_ZONE = "Asia/Ho_Chi_Minh";
const MAX_MENU_RESULTS = 12;
const PROTECTED_ROUTES = new Set([
  "GET /api/store/report",
  "GET /api/store/menus",
  "GET /api/store/menu-availability",
  "GET /api/store/menu-audit",
  "POST /api/store/menu-hold",
  "POST /api/store/menu-resume",
  "POST /api/store/menu-hide",
  "POST /api/store/menu-show",
]);

export async function handleStoreApi(request, env, dependencies = {}) {
  const url = new URL(request.url);
  if (url.pathname === "/openapi.json" && request.method === "GET") {
    return json(openApiSchema(url.origin));
  }
  if (url.pathname === "/privacy" && request.method === "GET") {
    return new Response("DABANG CHICKEN 매장 API는 CUKCUK 매출 조회와 태블릿 메뉴 판매상태 관리에만 사용하며 요청 기록을 운영 안전 확인 목적으로 제한 보관합니다.", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const route = `${request.method} ${url.pathname}`;
  if (!PROTECTED_ROUTES.has(route)) return null;
  if (!(await verifyStoreApiToken(request, env))) {
    return json({ ok: false, code: "UNAUTHORIZED", message: "매장 GPT 인증키가 올바르지 않습니다." }, 401);
  }

  const fetcher = dependencies.fetcher || fetch;
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  try {
    if (route === "GET /api/store/report") {
      return json(await buildStoreReport(env, {
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        includeItems: url.searchParams.get("includeItems") ?? "true",
      }, dependencies.login || login, fetcher));
    }
    if (route === "GET /api/store/menus") {
      const context = await loadAvailabilityContext(env, fetcher, now);
      const matches = searchMenus(context.menuData, url.searchParams.get("query"), context.snapshot, context.state);
      return json({ ok: true, query: String(url.searchParams.get("query") || "").trim(), count: matches.length, menus: matches, generatedAt: now.toISOString() });
    }
    if (route === "GET /api/store/menu-availability") {
      const context = await loadAvailabilityContext(env, fetcher, now);
      const menuId = cleanGuid(url.searchParams.get("menuId"));
      if (url.searchParams.has("menuId") && !menuId) throw new StoreApiError("menuId를 확인해 주세요.", 400, "INVALID_MENU_ID");
      const menus = context.menuData.menus.map(menu => describeMenuAvailability(menu, context.snapshot, context.state));
      const filtered = menuId ? menus.filter(menu => menu.id === menuId) : menus.filter(menu => !menu.effectiveAvailable);
      if (menuId && !filtered.length) throw new StoreApiError("현재 공개 메뉴에서 해당 메뉴를 찾지 못했습니다.", 404, "MENU_NOT_FOUND");
      return json({ ok: true, count: filtered.length, menus: filtered, generatedAt: now.toISOString() });
    }
    if (route === "GET /api/store/menu-audit") {
      const state = await getManualAvailabilityState(env, now);
      const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
      const events = state.auditLog.slice(-limit).reverse().map(event => ({
        operation: event.operationType,
        menuId: event.menuId,
        menuName: event.menuName,
        available: event.available,
        visible: event.visible,
        resumeAt: event.expiresAt,
        reason: event.reason,
        actor: event.actor,
        changedAt: event.changedAt,
      }));
      return json({ ok: true, count: events.length, events, generatedAt: now.toISOString() });
    }

    const payload = await readJson(request);
    const menuId = cleanGuid(payload?.menuId);
    const requestId = validateRequestId(payload?.requestId);
    if (!menuId) throw new StoreApiError("정확한 menuId를 보내 주세요.", 400, "INVALID_AVAILABILITY_REQUEST");
    const menuData = await loadMenuData(env, fetcher);
    const menu = menuData.menus.find(item => String(item.id) === menuId);
    if (!menu) throw new StoreApiError("현재 공개 메뉴에서 해당 메뉴를 찾지 못했습니다.", 404, "MENU_NOT_FOUND");
    if (!matchesExpectedMenuName(menu, payload?.expectedName)) {
      throw new StoreApiError("검색 결과의 메뉴명과 현재 메뉴가 일치하지 않습니다. 메뉴를 다시 검색해 주세요.", 409, "MENU_NAME_MISMATCH");
    }

    const visibilityChange = route === "POST /api/store/menu-hide" || route === "POST /api/store/menu-show";
    const requestedAvailable = route === "POST /api/store/menu-resume";
    const requestedVisible = route === "POST /api/store/menu-show";
    const expiresAt = route === "POST /api/store/menu-hold" ? resolveResumeAt(payload?.resumePolicy, payload?.resumeAt, now) : null;
    const changeOptions = {
      expiresAt,
      reason: cleanText(payload?.reason, 200),
      menuName: menu?.names?.ko || menu?.sourceName || menuId,
      actor: "store-gpt",
      requestId,
    };
    const state = visibilityChange
      ? await setManualVisibility(env, menuId, requestedVisible, changeOptions)
      : await setManualAvailability(env, menuId, requestedAvailable, changeOptions);
    const snapshot = buildAvailabilitySnapshot(state, now);
    const result = describeMenuAvailability(menu, snapshot, state);
    return json({
      ok: true,
      replayed: state.replayed === true,
      menu: result,
      message: visibilityChange ? visibilityResultMessage(result, requestedVisible) : availabilityResultMessage(result, requestedAvailable),
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    return json({
      ok: false,
      code: typeof error?.code === "string" ? error.code : "STORE_API_ERROR",
      message: error instanceof Error ? error.message : "매장 요청을 처리하지 못했습니다.",
    }, Number.isInteger(error?.status) ? error.status : 502);
  }
}

async function verifyStoreApiToken(request, env) {
  const hashes = [...new Set([env.STORE_GPT_TOKEN_SHA256, env.STORE_GPT_MENU_TOKEN_SHA256].filter(Boolean))];
  if (!hashes.length) return false;
  return (await Promise.all(hashes.map(hash => verifyStoreToken(request, hash)))).some(Boolean);
}

export function searchMenus(menuData, queryValue, snapshot, state = {}) {
  const query = normalizeSearch(queryValue);
  if (!query) throw new StoreApiError("찾을 메뉴 이름을 입력해 주세요.", 400, "MISSING_MENU_QUERY");
  return (Array.isArray(menuData?.menus) ? menuData.menus : []).map(menu => {
    const fields = [menu?.names?.ko, menu?.names?.vi, menu?.names?.zh, menu?.names?.en, menu?.sourceName, menu?.cukcukCode]
      .map(normalizeSearch).filter(Boolean);
    const exact = fields.some(value => value === query);
    const startsWith = fields.some(value => value.startsWith(query));
    const includes = fields.some(value => value.includes(query));
    return { menu, score: exact ? 3 : startsWith ? 2 : includes ? 1 : 0 };
  }).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.menu.sortOrder || 0) - Number(b.menu.sortOrder || 0))
    .slice(0, MAX_MENU_RESULTS)
    .map(item => describeMenuAvailability(item.menu, snapshot, state));
}

export function resolveResumeAt(policyValue, resumeAtValue, now = new Date()) {
  const policy = String(policyValue || "").trim();
  if (policy === "manual") return null;
  if (policy === "store_day_end") return nextStoreMidnight(now).toISOString();
  if (policy !== "at_time") {
    throw new StoreApiError("품절 종료 방식을 store_day_end, at_time, manual 중 하나로 지정해 주세요.", 400, "INVALID_RESUME_POLICY");
  }
  const resumeAt = String(resumeAtValue || "").trim();
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(resumeAt)) {
    throw new StoreApiError("resumeAt에는 시간대가 포함된 ISO 시각이 필요합니다.", 400, "INVALID_RESUME_AT");
  }
  const time = Date.parse(resumeAt);
  if (!Number.isFinite(time) || time <= now.getTime()) {
    throw new StoreApiError("resumeAt은 현재보다 뒤의 시각이어야 합니다.", 400, "INVALID_RESUME_AT");
  }
  return new Date(time).toISOString();
}

async function loadAvailabilityContext(env, fetcher, now) {
  const [menuData, state] = await Promise.all([loadMenuData(env, fetcher), getManualAvailabilityState(env, now)]);
  return { menuData, state, snapshot: buildAvailabilitySnapshot(state, now) };
}

async function loadMenuData(env, fetcher) {
  if (!env.MENU_DATA_URL) throw new StoreApiError("메뉴 기준 주소가 설정되지 않았습니다.", 503, "MENU_DATA_UNAVAILABLE");
  const response = await fetcher(env.MENU_DATA_URL, { headers: { Accept: "application/json" }, cf: { cacheTtl: 60, cacheEverything: true } });
  if (!response.ok) throw new StoreApiError("메뉴 기준 정보를 불러오지 못했습니다.", 503, "MENU_DATA_UNAVAILABLE");
  const menuData = await response.json();
  if (!Array.isArray(menuData?.menus)) throw new StoreApiError("메뉴 기준 정보가 올바르지 않습니다.", 503, "MENU_DATA_INVALID");
  return menuData;
}

function describeMenuAvailability(menu, snapshot, state) {
  const menuId = String(menu?.id || "");
  const manualEntry = (Array.isArray(state?.manualEntries) ? state.manualEntries : []).find(entry => entry.menuId === menuId) || null;
  const sourceUnavailable = menu?.available === false;
  const manualHeld = manualEntry?.held === true;
  const hiddenFromTablet = (snapshot?.manualHiddenMenuIds || []).includes(menuId);
  const scheduledUnavailable = (snapshot?.scheduledUnavailableMenuIds || []).includes(menuId);
  const closureUnavailable = (snapshot?.closureUnavailableMenuIds || []).includes(menuId);
  const blockedBy = [sourceUnavailable && "cukcuk_source", manualHeld && "manual", hiddenFromTablet && "tablet_hidden", scheduledUnavailable && "schedule", closureUnavailable && "category_closure"].filter(Boolean);
  return {
    id: menuId,
    code: String(menu?.cukcukCode || ""),
    name: menu?.names?.ko || menu?.sourceName || menuId,
    names: menu?.names || {},
    category: menu?.categoryName || "",
    price: Number(menu?.price) || 0,
    sourceAvailable: !sourceUnavailable,
    effectiveAvailable: blockedBy.length === 0,
    visibleOnTablet: !hiddenFromTablet,
    hiddenFromTablet,
    blockedBy,
    manualResumeAt: manualEntry?.expiresAt || null,
    manualReason: manualEntry?.reason || "",
    changedAt: manualEntry?.changedAt || null,
  };
}

function visibilityResultMessage(menu, requestedVisible) {
  if (!requestedVisible) return `${menu.name}을(를) 태블릿 메뉴에서 숨겼고 주문도 차단했습니다. CUKCUK와 구글 원본은 변경하지 않았습니다.`;
  return menu.effectiveAvailable
    ? `${menu.name}을(를) 태블릿 메뉴에 다시 표시했고 현재 주문 가능합니다.`
    : `${menu.name}을(를) 태블릿 메뉴에 다시 표시했지만 다른 품절 사유 때문에 아직 주문할 수 없습니다.`;
}

function availabilityResultMessage(menu, requestedAvailable) {
  if (!requestedAvailable) {
    return menu.manualResumeAt
      ? `${menu.name}을(를) 품절 처리했습니다. ${menu.manualResumeAt}에 자동으로 수동 품절이 해제됩니다.`
      : `${menu.name}을(를) 별도 안내 전까지 품절 처리했습니다.`;
  }
  return menu.effectiveAvailable
    ? `${menu.name}의 수동 품절을 해제했고 현재 주문 가능합니다.`
    : `${menu.name}의 수동 품절은 해제했지만 CUKCUK 원본 또는 예약 차단 때문에 아직 주문할 수 없습니다.`;
}

function nextStoreMidnight(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: Number(part.value) }), {});
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, 0, 0, 0) - 7 * 60 * 60 * 1000);
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "");
}

function cleanGuid(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maxLength) : "";
}

function validateRequestId(value) {
  const requestId = cleanText(value, 100);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) {
    throw new StoreApiError("requestId는 8~100자의 영문, 숫자, 밑줄 또는 하이픈이어야 합니다.", 400, "INVALID_REQUEST_ID");
  }
  return requestId;
}

function matchesExpectedMenuName(menu, value) {
  const expected = normalizeSearch(value);
  if (!expected) return false;
  return [menu?.names?.ko, menu?.names?.vi, menu?.names?.zh, menu?.names?.en, menu?.sourceName, menu?.cukcukCode]
    .map(normalizeSearch).filter(Boolean).includes(expected);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new StoreApiError("JSON 요청 본문을 확인해 주세요.", 400, "INVALID_JSON");
  }
}

function openApiSchema(origin) {
  const errorResponses = {
    "400": { description: "요청 확인 필요" },
    "401": { description: "인증 실패" },
    "404": { description: "메뉴 없음" },
  };
  return {
    openapi: "3.1.0",
    info: {
      title: "DABANG CHICKEN Store Management API",
      version: "2.1.0",
      description: "다방치킨 박닌본점 CUKCUK 매출 조회와 태블릿 메뉴 품절·판매 재개·숨김·표시 관리 API",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/store/report": {
        get: {
          operationId: "getDabangStoreReport",
          summary: "지정 기간의 매출과 주요 판매품목을 조회합니다.",
          parameters: [
            { name: "from", in: "query", required: true, schema: { type: "string", format: "date" }, description: "조회 시작일, YYYY-MM-DD" },
            { name: "to", in: "query", required: true, schema: { type: "string", format: "date" }, description: "조회 종료일, YYYY-MM-DD" },
            { name: "includeItems", in: "query", required: false, schema: { type: "boolean", default: true }, description: "메뉴별 판매량 포함 여부" },
          ],
          responses: { "200": { description: "매출 보고서" }, "401": { description: "인증 실패" } },
          security: [{ bearerAuth: [] }],
          "x-openai-isConsequential": false,
        },
      },
      "/api/store/menus": {
        get: {
          operationId: "searchDabangMenus",
          summary: "판매상태를 바꾸기 전에 메뉴 이름으로 정확한 후보를 찾습니다.",
          description: "품절 또는 판매 재개 요청에서는 항상 먼저 호출합니다. 후보가 여러 개면 사용자가 고르게 하고 menuId를 임의 선택하지 않습니다.",
          parameters: [
            { name: "query", in: "query", required: true, schema: { type: "string", minLength: 1, maxLength: 80 }, description: "한국어·베트남어·영어·중국어 메뉴명 또는 CUKCUK 코드의 일부" },
          ],
          responses: { "200": { description: "최대 12개의 메뉴 후보" }, ...errorResponses },
          security: [{ bearerAuth: [] }],
          "x-openai-isConsequential": false,
        },
      },
      "/api/store/menu-availability": {
        get: {
          operationId: "getDabangMenuAvailability",
          summary: "현재 주문 불가 메뉴 또는 지정 메뉴의 상태를 조회합니다.",
          parameters: [
            { name: "menuId", in: "query", required: false, schema: { type: "string", format: "uuid" }, description: "생략하면 현재 주문 불가 메뉴 전체, 지정하면 해당 메뉴 한 개" },
          ],
          responses: { "200": { description: "현재 유효한 판매상태" }, ...errorResponses },
          security: [{ bearerAuth: [] }],
          "x-openai-isConsequential": false,
        },
      },
      "/api/store/menu-audit": {
        get: {
          operationId: "getDabangMenuChangeHistory",
          summary: "최근 태블릿 메뉴 품절·판매 재개·숨김·표시 변경 이력을 조회합니다.",
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 20 }, description: "가져올 최근 변경 건수" },
          ],
          responses: { "200": { description: "최근 메뉴 변경 이력" }, "401": { description: "인증 실패" } },
          security: [{ bearerAuth: [] }],
          "x-openai-isConsequential": false,
        },
      },
      "/api/store/menu-hold": {
        post: {
          operationId: "holdDabangMenuUnavailable",
          summary: "정확한 메뉴 한 개를 품절 또는 일시 판매 중지합니다.",
          description: "searchDabangMenus로 확인한 menuId와 정확한 메뉴명을 함께 사용합니다. 후보가 여러 개면 먼저 사용자에게 어떤 메뉴인지 확인합니다.",
          "x-openai-isConsequential": true,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["menuId", "expectedName", "resumePolicy", "requestId"],
                  properties: {
                    menuId: { type: "string", format: "uuid", description: "검색 결과에서 확인한 메뉴 ID" },
                    expectedName: { type: "string", maxLength: 160, description: "검색 결과에 나온 정확한 메뉴명" },
                    resumePolicy: { type: "string", enum: ["store_day_end", "at_time", "manual"], description: "품절일 때 필수. 오늘만은 store_day_end, 지정 시각은 at_time, 별도 안내 전까지는 manual" },
                    resumeAt: { type: "string", format: "date-time", description: "resumePolicy가 at_time일 때만 사용하며 반드시 시간대를 포함" },
                    reason: { type: "string", maxLength: 200, description: "매니저가 말한 짧은 품절 사유" },
                    requestId: { type: "string", maxLength: 100, description: "이 변경 요청의 고유 UUID. 재시도할 때 같은 값을 사용" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "품절 처리 후 서버에서 다시 확인한 판매상태" }, ...errorResponses, "409": { description: "메뉴명 불일치" } },
          security: [{ bearerAuth: [] }],
        },
      },
      "/api/store/menu-resume": {
        post: {
          operationId: "resumeDabangMenu",
          summary: "정확한 메뉴 한 개의 수동 품절을 해제합니다.",
          description: "searchDabangMenus로 확인한 menuId와 정확한 메뉴명을 함께 사용합니다. CUKCUK 원본 품절이나 예약 차단은 해제하지 않습니다.",
          "x-openai-isConsequential": true,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["menuId", "expectedName", "requestId"],
                  properties: {
                    menuId: { type: "string", format: "uuid", description: "검색 결과에서 확인한 메뉴 ID" },
                    expectedName: { type: "string", maxLength: 160, description: "검색 결과에 나온 정확한 메뉴명" },
                    reason: { type: "string", maxLength: 200, description: "판매 재개 사유" },
                    requestId: { type: "string", maxLength: 100, description: "이 변경 요청의 고유 UUID. 재시도할 때 같은 값을 사용" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "수동 품절 해제 후 서버에서 다시 확인한 판매상태" }, ...errorResponses, "409": { description: "메뉴명 불일치" } },
          security: [{ bearerAuth: [] }],
        },
      },
      "/api/store/menu-hide": {
        post: {
          operationId: "hideDabangMenuFromTablet",
          summary: "정확한 메뉴 한 개를 태블릿에서 숨기고 주문을 차단합니다.",
          description: "삭제 요청도 CUKCUK나 구글 원본을 삭제하지 않고 이 태블릿 전용 숨김으로 처리합니다. searchDabangMenus로 확인한 menuId와 정확한 메뉴명을 함께 사용합니다.",
          "x-openai-isConsequential": true,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["menuId", "expectedName", "requestId"],
                  properties: {
                    menuId: { type: "string", format: "uuid", description: "검색 결과에서 확인한 메뉴 ID" },
                    expectedName: { type: "string", maxLength: 160, description: "검색 결과에 나온 정확한 메뉴명" },
                    reason: { type: "string", maxLength: 200, description: "매니저가 말한 짧은 숨김 사유" },
                    requestId: { type: "string", maxLength: 100, description: "이 변경 요청의 고유 UUID. 재시도할 때 같은 값을 사용" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "태블릿 숨김 후 서버에서 다시 확인한 상태" }, ...errorResponses, "409": { description: "메뉴명 불일치" } },
          security: [{ bearerAuth: [] }],
        },
      },
      "/api/store/menu-show": {
        post: {
          operationId: "showDabangMenuOnTablet",
          summary: "정확한 메뉴 한 개를 태블릿에 다시 표시합니다.",
          description: "태블릿 전용 숨김만 해제합니다. 별도 품절, CUKCUK 원본 품절, 예약 차단은 해제하지 않습니다.",
          "x-openai-isConsequential": true,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["menuId", "expectedName", "requestId"],
                  properties: {
                    menuId: { type: "string", format: "uuid", description: "검색 결과에서 확인한 메뉴 ID" },
                    expectedName: { type: "string", maxLength: 160, description: "검색 결과에 나온 정확한 메뉴명" },
                    reason: { type: "string", maxLength: 200, description: "다시 표시하는 짧은 사유" },
                    requestId: { type: "string", maxLength: 100, description: "이 변경 요청의 고유 UUID. 재시도할 때 같은 값을 사용" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "태블릿 다시 표시 후 서버에서 다시 확인한 상태" }, ...errorResponses, "409": { description: "메뉴명 불일치" } },
          security: [{ bearerAuth: [] }],
        },
      },
    },
    components: {
      schemas: {},
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
  };
}

class StoreApiError extends Error {
  constructor(message, status = 400, code = "STORE_API_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
