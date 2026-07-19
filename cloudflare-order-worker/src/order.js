const API_ROOT = "https://graphapi.cukcuk.vn";

export function validateAndBuildOrder(payload, menuData, branchId) {
  if (!payload || typeof payload !== "object") throw invalid("주문 정보가 올바르지 않습니다.");
  const tableId = cleanId(payload.table?.id);
  const tableName = cleanText(payload.table?.name, 80);
  if (!tableId || !tableName) throw invalid("테이블을 다시 선택해 주세요.");
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 50) {
    throw invalid("주문 메뉴 수량을 확인해 주세요.");
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
    details.push({
      Id: crypto.randomUUID(), ItemId: String(menu.cukcukId || menu.id), ItemName: String(menu.sourceName || menu.names?.ko || menu.id),
      Quantity: quantity, Status: 1, Price: Number(menu.price || 0), SortOrder: sortOrder++,
    });

    for (const selected of Array.isArray(line.options) ? line.options : []) {
      const valueId = cleanId(selected?.valueId);
      let matched = null;
      for (const templateId of Array.isArray(menu.optionTemplateIds) ? menu.optionTemplateIds : []) {
        const template = templates.get(String(templateId));
        const value = template?.values?.find((candidate) => String(candidate.id) === valueId && candidate.visible !== false);
        if (value) { matched = value; break; }
      }
      if (!matched) throw invalid("이 메뉴에서 선택할 수 없는 옵션입니다.");
      details.push({
        Id: crypto.randomUUID(), AdditionId: String(matched.id), ItemName: String(matched.names?.ko || matched.id),
        Quantity: quantity, Status: 1, Price: Number(matched.additionalPrice || 0), SortOrder: sortOrder++,
      });
    }
  }

  const requestedId = cleanId(payload.clientOrderId);
  const date = typeof payload.orderedAt === "string" && Number.isFinite(Date.parse(payload.orderedAt))
    ? new Date(payload.orderedAt).toISOString() : new Date().toISOString();
  return {
    Id: requestedId || crypto.randomUUID(), Type: 1, BranchId: branchId, Date: date,
    CustomerName: `Tablet ${tableName}`,
    RequestDescription: `Tablet order · ${tableName} · ${cleanText(payload.language, 10) || "ko"}`,
    OrderDetails: details, ListTableID: [tableId],
  };
}

export async function createCukCukOrder(env, order, fetcher = fetch) {
  const session = await login(env, fetcher);
  const response = await fetcher(`${API_ROOT}/api/v1/orders/create`, {
    method: "POST",
    headers: {
      Accept: "application/json", "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`, CompanyCode: session.companyCode,
    },
    body: JSON.stringify(order),
  });
  if (!response.ok) throw new OrderError(`CUKCUK 서버가 HTTP ${response.status} 오류를 반환했습니다.`, 502, "CUKCUK_HTTP_ERROR");
  const result = await response.json();
  if (!result.Success) throw new OrderError(result.ErrorMessage || "CUKCUK에서 주문을 처리하지 못했습니다.", result.ErrorType === 4 ? 401 : 502, `CUKCUK_${result.ErrorType || "ERROR"}`);
  return result.Data || {};
}

async function login(env, fetcher) {
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
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ Domain: env.CUKCUK_DOMAIN, AppID: env.CUKCUK_APP_ID, LoginTime: loginTime, SignatureInfo: signature }),
    });
    if (!response.ok) throw new OrderError(`CUKCUK 로그인 서버가 HTTP ${response.status} 오류를 반환했습니다.`, 502, "CUKCUK_LOGIN_HTTP_ERROR");
    const result = await response.json();
    if (result.Success && result.Data?.AccessToken) return { accessToken: result.Data.AccessToken, companyCode: result.Data.CompanyCode };
    lastError = new OrderError(result.ErrorMessage || "CUKCUK 로그인에 실패했습니다.", 502, `CUKCUK_LOGIN_${result.ErrorType || "ERROR"}`);
    if (result.ErrorType !== 4 && result.ErrorType !== 102) throw lastError;
  }
  throw lastError;
}

export class OrderError extends Error {
  constructor(message, status = 400, code = "INVALID_ORDER") { super(message); this.status = status; this.code = code; }
}

function invalid(message) { return new OrderError(message, 400, "INVALID_ORDER"); }
function cleanId(value) { const v = typeof value === "string" ? value.trim() : ""; return /^[a-zA-Z0-9_-]{1,100}$/.test(v) ? v : ""; }
function cleanText(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
async function hmac(message, secret) { const e = new TextEncoder(); const key = await crypto.subtle.importKey("raw", e.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return new Uint8Array(await crypto.subtle.sign("HMAC", key, e.encode(message))); }
function hex(bytes, upper) { const value = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""); return upper ? value.toUpperCase() : value; }
function base64(bytes) { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); }
