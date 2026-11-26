const API_ROOT = "https://graphapi.cukcuk.vn";
import { MONDAY_POCHA_MENU_ID, mondayPochaDisplayPrice } from "./monday-promo.js";

const COMBO_TYPES = {
  bone: "f688cfab-85e2-4a3c-84ea-48cd2b56fcf7",
  boneless: "6e0215ac-2c13-4f72-9b1d-fd47691e0627",
  wings: "a99769de-2e48-437e-814a-30c3dd3e3d59",
  jjapkoba: "b948e319-8ef2-483c-92e9-768be31535ef",
};
const COMBO_NORMAL_FLAVORS = new Set("364f50ef-8710-41ac-9e4c-73209d7a4c89 9b8f3856-60ff-4d08-b111-9e87ea20e22e 641303df-1c29-4e1d-bc2b-de7ce53a43db 28ae400d-930a-48ca-89f5-3113b1e3036e a4540023-7b3c-496b-baab-b821705d6e68 5b311b20-6191-403f-8612-08cf8648b49d 2dfd957a-1061-4e7d-a1ca-5ec27dfc1da0 b3a7e4ce-1840-4d17-9636-6e91cd32fd36 a8da2a14-4ec6-40a9-926c-9b41755b2de5 fd21b308-6f37-443b-a50c-a35c5a604106".split(" "));
const COMBO_WING_FLAVORS = new Set("e8e473c3-65df-4e9d-abce-0c3e480ce3e5 95da43b6-1573-4310-b70c-38090b1f2ef7 06cf5bed-c480-43a9-b157-44b4d59cf23e 74f59857-2d4f-4b98-84e1-79c75aa26a9c 21eca709-2298-47d6-be92-bb03e5461c41 22731f9b-95ae-4fc2-9dc2-bbd3ced496b7 18be4708-e8af-476b-a8f0-d575157450f0 2276ad40-3dfc-4679-a7af-df881c350153".split(" "));
const COMBO_SOUP_SPICY = "92987c76-3de9-4491-98f9-508013c0fe9e";
const COMBO_UDON = new Set(["d067d9f5-70b7-4a28-9b01-6914ed4f0b66", "36e1c914-9c90-4746-9c4a-cb01c6585cea"]);
const COMBO_JJAPKOBA_SPICE = new Set(["3b59138e-b848-41aa-a45d-9fa1b915fbcf", "b4ff5c57-e25c-4275-a6a9-4a25ba70e497", "90f5ee61-9405-4725-a244-24b23222ee4f"]);

function validateComboChoices(code, selectedOptions) {
  if (code !== "COMBOFAMILY599" && code !== "COMBOCOUPLE289") return;
  const ids = selectedOptions.map(option => String(option.valueId));
  const allowedTypes = code === "COMBOFAMILY599"
    ? [COMBO_TYPES.bone, COMBO_TYPES.boneless, COMBO_TYPES.wings]
    : Object.values(COMBO_TYPES);
  const typeIds = ids.filter(id => allowedTypes.includes(id));
  if (typeIds.length !== 1) throw invalid("콤보 치킨 종류를 하나 선택해 주세요.");
  const selectedType = typeIds[0];
  const normalCount = ids.filter(id => COMBO_NORMAL_FLAVORS.has(id)).length;
  const wingCount = ids.filter(id => COMBO_WING_FLAVORS.has(id)).length;
  const flavorCount = code === "COMBOFAMILY599" ? 2 : 1;
  if (selectedType === COMBO_TYPES.wings
    ? wingCount !== flavorCount || normalCount !== 0
    : selectedType === COMBO_TYPES.jjapkoba
      ? normalCount !== 0 || wingCount !== 0
      : normalCount !== flavorCount || wingCount !== 0) {
    throw invalid("선택한 치킨 종류에 맞는 맛만 골라 주세요.");
  }
  const soupCount = ids.filter(id => id === COMBO_SOUP_SPICY).length;
  const udonCount = ids.filter(id => COMBO_UDON.has(id)).length;
  const spiceCount = ids.filter(id => COMBO_JJAPKOBA_SPICE.has(id)).length;
  if (code === "COMBOFAMILY599" ? soupCount > 1 || udonCount !== 0 : udonCount !== 1 || soupCount !== 0)
    throw invalid("콤보 국물 맛을 다시 선택해 주세요.");
  if (selectedType === COMBO_TYPES.jjapkoba ? spiceCount !== 1 : spiceCount !== 0)
    throw invalid("짭코바 매운 단계를 선택해 주세요.");
  const allowed = new Set([...allowedTypes, ...COMBO_NORMAL_FLAVORS, ...COMBO_WING_FLAVORS,
    ...(code === "COMBOFAMILY599" ? [COMBO_SOUP_SPICY] : [...COMBO_UDON, ...COMBO_JJAPKOBA_SPICE])]);
  if (ids.some(id => !allowed.has(id))) throw invalid("콤보에 포함되지 않은 옵션이 있습니다.");
}

export function validateAndBuildOrder(payload, menuData, branchId, now = new Date()) {
  if (!payload || typeof payload !== "object") throw invalid("주문 정보가 올바르지 않습니다.");
  const requestedId = cleanId(payload.clientOrderId);
  if (!requestedId) throw new OrderError("주문 번호가 올바르지 않습니다. 화면을 새로고침하고 다시 주문해 주세요.", 400, "CLIENT_ORDER_ID_REQUIRED");
  const tableId = cleanId(payload.table?.id);
  const tableName = cleanText(payload.table?.name, 80);
  if (!tableId || !tableName) throw invalid("테이블을 다시 선택해 주세요.");
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 50) {
    throw invalid("주문 메뉴와 수량을 확인해 주세요.");
  }
  if (!menuData?.synced || !Array.isArray(menuData.menus) || !Array.isArray(menuData.optionTemplates)) {
    throw new OrderError("동기화된 메뉴 정보가 올바르지 않습니다.", 503, "MENU_DATA_INVALID");
  }

  const menus = new Map(menuData.menus.filter((item) => item.available !== false).map((item) => [String(item.id), item]));
  const templates = new Map(menuData.optionTemplates.map((template) => [String(template.id), template]));
  const details = [];
  let sortOrder = 0;

  for (const line of payload.items) {
    const menuId = cleanId(line?.menuId);
    const quantity = Number(line?.quantity);
    const menu = menus.get(menuId);
    if (!menu || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw invalid("현재 판매 중인 메뉴와 수량을 확인해 주세요.");
    }
    if (menuId === MONDAY_POCHA_MENU_ID && line.basePrice !== undefined && line.basePrice !== null
      && Number(line.basePrice) !== mondayPochaDisplayPrice(menu, now)) {
      throw new OrderError("월요일 행사 시간이 바뀌었습니다. 장바구니 가격을 확인한 뒤 다시 주문해 주세요.", 409, "PROMO_PRICE_CHANGED");
    }

    const parentId = crypto.randomUUID();
    details.push({
      Id: parentId,
      ItemId: String(menu.cukcukId || menu.id),
      ItemName: String(menu.sourceName || menu.names?.ko || menu.id),
      Quantity: quantity,
      Status: 1,
      Price: Number(menu.price || 0),
      SortOrder: sortOrder++,
    });

    if (line.options !== undefined && !Array.isArray(line.options)) throw invalid("메뉴 옵션 정보가 올바르지 않습니다.");
    const selectedOptions = Array.isArray(line.options) ? line.options : [];
    const attachedTemplateIds = (Array.isArray(menu.optionTemplateIds) ? menu.optionTemplateIds : []).map(String);
    if (Number(menu.price || 0) === 0 && attachedTemplateIds.length === 0) {
      throw new OrderError("가격이 0원인 메뉴의 옵션 원본을 찾을 수 없습니다.", 503, "MENU_DATA_INVALID");
    }
    const attachedTemplateSet = new Set(attachedTemplateIds);
    const selectedKeys = new Set();
    const groupCounts = new Map();

    for (const selected of selectedOptions) {
      const templateId = cleanTemplateId(selected?.templateId);
      const valueId = cleanId(selected?.valueId);
      if (!templateId || !attachedTemplateSet.has(templateId)) throw invalid("이 메뉴에서 선택할 수 없는 옵션 그룹입니다.");
      const selectionKey = `${templateId}:${valueId}`;
      if (!valueId || selectedKeys.has(selectionKey)) throw invalid("같은 옵션을 중복해서 선택할 수 없습니다.");
      selectedKeys.add(selectionKey);
      const template = templates.get(templateId);
      const matched = template?.values?.find((candidate) => String(candidate.id) === valueId && candidate.visible !== false);
      if (!matched) throw invalid("이 메뉴에서 선택할 수 없는 옵션입니다.");
      groupCounts.set(templateId, (groupCounts.get(templateId) || 0) + 1);
      details.push({
        Id: crypto.randomUUID(),
        ParentId: parentId,
        AdditionId: String(matched.id),
        ItemName: bilingualOptionName(matched),
        Quantity: quantity,
        Status: 1,
        Price: Number(matched.additionalPrice || 0),
        SortOrder: sortOrder++,
      });
    }

    for (const templateId of attachedTemplateIds) {
      const template = templates.get(templateId);
      if (!template) throw new OrderError("메뉴 옵션 원본을 찾을 수 없습니다.", 503, "MENU_DATA_INVALID");
      const rule = menu.optionRules?.[templateId] || {};
      const required = rule.required ?? template.required === true;
      let minSelections = selectionLimit(rule.minSelections, template.minSelections, required ? 1 : 0);
      const visibleCount = Array.isArray(template.values) ? template.values.filter(value => value.visible !== false).length : 0;
      let maxSelections = selectionLimit(rule.maxSelections, template.maxSelections, visibleCount);
      if (required && minSelections < 1) minSelections = 1;
      if (maxSelections < minSelections || maxSelections > visibleCount) {
        throw new OrderError("메뉴 옵션 선택 규칙이 올바르지 않습니다.", 503, "MENU_DATA_INVALID");
      }
      const selectedCount = groupCounts.get(templateId) || 0;
      if (selectedCount < minSelections || selectedCount > maxSelections) {
        throw invalid("필수 옵션의 선택 개수를 확인해 주세요.");
      }
    }
    validateComboChoices(String(menu.cukcukCode || ""), selectedOptions);
  }

  const date = typeof payload.orderedAt === "string" && Number.isFinite(Date.parse(payload.orderedAt))
    ? new Date(payload.orderedAt).toISOString()
    : new Date().toISOString();
  return {
    Id: requestedId,
    Type: 1,
    BranchId: branchId,
    Date: date,
    CustomerName: `Tablet ${tableName}`,
    RequestDescription: `Tablet order · ${tableName} · ${cleanText(payload.language, 10) || "ko"}`,
    OrderDetails: details,
    ListTableID: [tableId],
  };
}

function selectionLimit(primary, fallback, defaultValue) {
  if (Number.isInteger(primary) && primary >= 0) return primary;
  if (Number.isInteger(fallback) && fallback >= 0) return fallback;
  return defaultValue;
}

function bilingualOptionName(option) {
  const receiptNames = option.receiptNames || option.names || {};
  const vi = cleanText(receiptNames.vi, 160);
  const ko = cleanText(receiptNames.ko, 160);
  if (vi && ko && vi !== ko) return `${vi} / ${ko}`;
  return vi || ko || String(option.id);
}

export async function createCukCukOrder(env, order, fetcher = fetch) {
  const session = await login(env, fetcher);
  return createOrder(session, order, fetcher);
}

export async function createOrAppendCukCukOrder(env, order, tableName, existingOrderId, fetcher = fetch) {
  const session = await login(env, fetcher);
  let existing = null;
  if (existingOrderId) {
    try {
      existing = await getOrder(session, existingOrderId, fetcher);
    } catch (error) {
      if (error?.code !== "CUKCUK_252") throw error;
    }
  }

  if (existing) {
    const status = Number(existing.Status);
    if (status === 3) {
      throw new OrderError("이미 계산 요청된 테이블입니다. 계산 요청을 취소한 뒤 메뉴를 추가해 주세요.", 409, "PAYMENT_REQUESTED");
    }
    if ([1, 7, 8].includes(status)) {
      if (!matchesTable(existing.TableName, tableName)) {
        throw new OrderError("저장된 주문의 테이블 정보가 일치하지 않습니다.", 409, "TABLE_ORDER_MISMATCH");
      }
      const updated = await appendOrderItems(session, existing, order.OrderDetails, env.CUKCUK_BRANCH_ID, fetcher);
      return { ...updated, action: "updated" };
    }
    if (![4, 5].includes(status)) {
      throw new OrderError("현재 주문 상태에서는 메뉴를 추가할 수 없습니다.", 409, "ORDER_NOT_EDITABLE");
    }
  }

  const created = await createOrder(session, order, fetcher);
  return { ...created, action: "created" };
}

async function createOrder(session, order, fetcher) {
  const response = await fetcher(`${API_ROOT}/api/v1/orders/create`, {
    method: "POST",
    headers: apiHeaders(session),
    body: JSON.stringify(order),
  });
  return readCukCukResult(response, "주문 생성");
}

async function getOrder(session, orderId, fetcher) {
  const response = await fetcher(`${API_ROOT}/api/v1/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: apiHeaders(session),
  });
  return readCukCukResult(response, "기존 주문 조회");
}

async function appendOrderItems(session, existing, newDetails, branchId, fetcher) {
  const previousDetails = Array.isArray(existing.OrderDetails) ? existing.OrderDetails : [];
  if (!previousDetails.length) {
    throw new OrderError("기존 주문의 메뉴 정보를 불러오지 못했습니다.", 502, "ORDER_DETAILS_MISSING");
  }
  const nextSortOrder = previousDetails.reduce((max, item) => Math.max(max, Number(item.SortOrder) || 0), -1) + 1;
  const appendedDetails = newDetails.map((item, index) => ({ ...item, SortOrder: nextSortOrder + index }));
  const response = await fetcher(`${API_ROOT}/api/v1/orders/update-item`, {
    method: "POST",
    headers: apiHeaders(session),
    body: JSON.stringify({
      Id: existing.Id,
      BranchId: existing.BranchId || branchId,
      OrderDetails: [...previousDetails, ...appendedDetails],
    }),
  });
  return readCukCukResult(response, "기존 주문 메뉴 추가");
}

async function readCukCukResult(response, operation) {
  if (!response.ok) {
    throw new OrderError(`CUKCUK ${operation} 요청이 HTTP ${response.status} 오류를 반환했습니다.`, 502, "CUKCUK_HTTP_ERROR");
  }
  const result = await response.json();
  if (!result.Success) {
    const status = result.ErrorType === 4 ? 401 : [252, 258].includes(result.ErrorType) ? 409 : 502;
    throw new OrderError(result.ErrorMessage || `CUKCUK에서 ${operation}을 처리하지 못했습니다.`, status, `CUKCUK_${result.ErrorType || "ERROR"}`);
  }
  return result.Data || {};
}

function apiHeaders(session) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.accessToken}`,
    CompanyCode: session.companyCode,
  };
}

function matchesTable(cukcukTableName, expectedTableName) {
  if (typeof cukcukTableName !== "string" || !cukcukTableName.trim()) return true;
  return cukcukTableName.split(",").map((name) => name.trim()).includes(expectedTableName.trim());
}

export async function login(env, fetcher) {
  const modes = ["base64-app-first", "hex-lower", "hex-upper", "base64-domain-first"];
  let lastError = new OrderError("CUKCUK 로그인에 실패했습니다.", 502, "CUKCUK_LOGIN_FAILED");
  for (const mode of modes) {
    const loginTime = new Date().toISOString();
    const signedObject = mode === "base64-domain-first"
      ? { Domain: env.CUKCUK_DOMAIN, AppID: env.CUKCUK_APP_ID, LoginTime: loginTime }
      : { AppID: env.CUKCUK_APP_ID, Domain: env.CUKCUK_DOMAIN, LoginTime: loginTime };
    const bytes = await hmac(JSON.stringify(signedObject), env.CUKCUK_SECRET_KEY);
    const signature = mode === "hex-lower" ? hex(bytes, false) : mode === "hex-upper" ? hex(bytes, true) : base64(bytes);
    const response = await fetcher(`${API_ROOT}/api/Account/Login`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ Domain: env.CUKCUK_DOMAIN, AppID: env.CUKCUK_APP_ID, LoginTime: loginTime, SignatureInfo: signature }),
    });
    if (!response.ok) {
      throw new OrderError(`CUKCUK 로그인 서버가 HTTP ${response.status} 오류를 반환했습니다.`, 502, "CUKCUK_LOGIN_HTTP_ERROR");
    }
    const result = await response.json();
    if (result.Success && result.Data?.AccessToken) {
      return { accessToken: result.Data.AccessToken, companyCode: result.Data.CompanyCode };
    }
    lastError = new OrderError(result.ErrorMessage || "CUKCUK 로그인에 실패했습니다.", 502, `CUKCUK_LOGIN_${result.ErrorType || "ERROR"}`);
    if (result.ErrorType !== 4 && result.ErrorType !== 102) throw lastError;
  }
  throw lastError;
}

export class OrderError extends Error {
  constructor(message, status = 400, code = "INVALID_ORDER") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalid(message) {
  return new OrderError(message, 400, "INVALID_ORDER");
}

function cleanId(value) {
  const v = typeof value === "string" ? value.trim() : "";
  return /^[a-zA-Z0-9_-]{1,100}$/.test(v) ? v : "";
}

function cleanTemplateId(value) {
  const v = typeof value === "string" ? value.trim() : "";
  return /^[a-zA-Z0-9_:-]{1,200}$/.test(v) ? v : "";
}

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function hmac(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function hex(bytes, upper) {
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return upper ? value.toUpperCase() : value;
}

function base64(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
