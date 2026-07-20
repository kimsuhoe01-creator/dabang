const API_ROOT = "https://graphapi.cukcuk.vn";

export function validateAndBuildOrder(payload, menuData, branchId) {
  if (!payload || typeof payload !== "object") throw invalid("주문 정보가 올바르지 않습니다.");
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

    for (const selected of Array.isArray(line.options) ? line.options : []) {
      const valueId = cleanId(selected?.valueId);
      let matched = null;
      for (const templateId of Array.isArray(menu.optionTemplateIds) ? menu.optionTemplateIds : []) {
        const template = templates.get(String(templateId));
        const value = template?.values?.find((candidate) => String(candidate.id) === valueId && candidate.visible !== false);
        if (value) {
          matched = value;
          break;
        }
      }
      if (!matched) throw invalid("이 메뉴에서 선택할 수 없는 옵션입니다.");
      details.push({
        Id: crypto.randomUUID(),
        ParentId: parentId,
        AdditionId: String(matched.id),
        ItemName: String(matched.names?.ko || matched.id),
        Quantity: quantity,
        Status: 1,
        Price: Number(matched.additionalPrice || 0),
        SortOrder: sortOrder++,
      });
    }
  }

  const requestedId = cleanId(payload.clientOrderId);
  const date = typeof payload.orderedAt === "string" && Number.isFinite(Date.parse(payload.orderedAt))
    ? new Date(payload.orderedAt).toISOString()
    : new Date().toISOString();
  return {
    Id: requestedId || crypto.randomUUID(),
    Type: 1,
    BranchId: branchId,
    Date: date,
    CustomerName: `Tablet ${tableName}`,
    RequestDescription: `Tablet order · ${tableName} · ${cleanText(payload.language, 10) || "ko"}`,
    OrderDetails: details,
    ListTableID: [tableId],
  };
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
