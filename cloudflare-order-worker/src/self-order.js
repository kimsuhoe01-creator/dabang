const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

export async function submitCukCukSelfOrder(env, order, _tableName, _existingOrderId, fetcher = fetch) {
  const domain = safeDomain(env.CUKCUK_DOMAIN);
  const branchId = cleanGuid(env.CUKCUK_BRANCH_ID);
  const tableId = cleanGuid(order?.ListTableID?.[0]);
  if (!domain || !branchId || !tableId) {
    throw new SelfOrderError("CUKCUK 테이블 QR 설정이 올바르지 않습니다.", 503, "SELF_ORDER_CONFIG_INVALID");
  }

  const sessionId = crypto.randomUUID();
  const host = `https://${domain}.cukcuk.vn`;
  const configResponse = await fetcher(`${host}/order-online/Config/GetConfig`, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: sessionId },
  });
  const configResult = await readResult(configResponse, "QR 설정 조회");
  const token = typeof configResult?.Token === "string" ? configResult.Token : "";
  const companyCode = safeDomain(configResult?.CompanyCode || domain);
  if (!token || !companyCode) {
    throw new SelfOrderError("CUKCUK QR 인증 정보를 불러오지 못했습니다.", 502, "SELF_ORDER_TOKEN_MISSING");
  }

  const apiRoot = `${host}/cukapiv2/orderonline`;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    AuthorizationKey: token,
  };
  const initial = await postResult(fetcher, withCompany(
    `${apiRoot}/api/Order/GetOrderByTableID?idTable=${encodeURIComponent(tableId)}&branchID=${encodeURIComponent(branchId)}&qrID=`,
    companyCode,
  ), headers, undefined, "QR 테이블 주문 조회");

  const areaId = areaIdFromTableRef(initial?.TableRef);
  if (!areaId) {
    throw new SelfOrderError("CUKCUK 테이블 구역 정보를 찾지 못했습니다.", 502, "SELF_ORDER_AREA_MISSING");
  }

  const parentDetails = (Array.isArray(order?.OrderDetails) ? order.OrderDetails : []).filter(detail => !detail.ParentId && detail.ItemId);
  const additionsByParent = groupAdditions(order?.OrderDetails);
  const itemCache = new Map();
  const cartItems = [];
  for (const parent of parentDetails) {
    const itemId = cleanGuid(parent.ItemId);
    if (!itemId) throw new SelfOrderError("CUKCUK 메뉴 ID가 올바르지 않습니다.", 400, "SELF_ORDER_ITEM_INVALID");
    let item = itemCache.get(itemId);
    if (!item) {
      item = await getResult(fetcher, withCompany(
        `${apiRoot}/api/InventoryItem/GetInventoryItemDetailByID?inventoryItemID=${encodeURIComponent(itemId)}&bookingType=1&qrID=&branchID=${encodeURIComponent(branchId)}&parentBuffetID=&areaID=${encodeURIComponent(areaId)}`,
        companyCode,
      ), headers, "QR 메뉴 상세 조회");
      if (!item) throw new SelfOrderError("CUKCUK QR 메뉴 상세 정보를 찾지 못했습니다.", 409, "SELF_ORDER_ITEM_NOT_FOUND");
      itemCache.set(itemId, item);
    }
    cartItems.push(buildCartItem(structuredClone(item), parent, additionsByParent.get(parent.Id) || []));
  }
  if (!cartItems.length) {
    throw new SelfOrderError("전송할 QR 메뉴가 없습니다.", 400, "SELF_ORDER_EMPTY");
  }

  const amount = cartItems.reduce((sum, item) => sum + Number(item.BuyQuantity || 0) * Number(item.UnitPriceAddtion || 0), 0);
  const temporaryCarts = Array.isArray(initial.ListInventoryItemTemp) ? initial.ListInventoryItemTemp.filter(entry => entry?.SessionID !== sessionId) : [];
  temporaryCarts.push({ SessionID: sessionId, ListInventoryItem: cartItems });
  const cart = {
    ...initial,
    Amount: amount,
    TotalAmount: amount,
    PaymentAmount: amount,
    ListInventoryItemTemp: temporaryCarts,
  };

  const updated = await postResult(fetcher, withCompany(
    `${apiRoot}/api/Order/self-order/update-cart?branchID=${encodeURIComponent(branchId)}&qrID=&areaID=${encodeURIComponent(areaId)}`,
    companyCode,
  ), headers, cart, "QR 장바구니 전송");
  const confirmed = await postResult(fetcher, withCompany(
    `${apiRoot}/api/Order/self-order/confirm-order?branchID=${encodeURIComponent(branchId)}&qrID=&areaID=${encodeURIComponent(areaId)}`,
    companyCode,
  ), headers, undefined, "QR 주문 확정");

  return {
    Id: confirmed?.OrderId || confirmed?.Id || updated?.OrderId || updated?.Id || initial.OrderId || order.Id,
    No: confirmed?.OrderNo || confirmed?.No || updated?.OrderNo || updated?.No || null,
    Status: confirmed?.ConfirmStatus ?? confirmed?.Status ?? updated?.ConfirmStatus ?? updated?.Status ?? null,
    action: "self-order-confirmed",
  };
}

function buildCartItem(item, parent, additions) {
  const quantity = Number(parent.Quantity);
  item.CartItemID = cleanGuid(parent.Id) || crypto.randomUUID();
  item.OrderOnlineDetailID = item.OrderOnlineDetailID || EMPTY_GUID;
  item.BuyQuantity = quantity;
  item.ChangeQuantity = 0;
  item.OrderStatus = 0;
  item.UpdateType = 0;
  item.Note = "";

  const selected = new Set(additions.map(addition => cleanGuid(addition.AdditionId)).filter(Boolean));
  const matched = new Set();
  let additionAmount = 0;
  for (const category of Array.isArray(item.InventoryItemAdditionsCategory) ? item.InventoryItemAdditionsCategory : []) {
    for (const addition of Array.isArray(category.InventoryItemAdditions) ? category.InventoryItemAdditions : []) {
      const id = cleanGuid(addition.InventoryItemAdditionID);
      const isSelected = selected.has(id);
      addition.Selected = isSelected;
      addition.BuyQuantity = isSelected ? 1 : 0;
      if (isSelected) {
        matched.add(id);
        additionAmount += Number(addition.UnitPrice || 0);
      }
    }
  }
  if (matched.size !== selected.size) {
    throw new SelfOrderError("CUKCUK QR에서 선택한 메뉴 옵션을 찾지 못했습니다. 화면을 새로고침해 주세요.", 409, "SELF_ORDER_OPTION_NOT_FOUND");
  }
  const basePrice = Number(item.IsDiscount ? item.DiscountPrice : item.UnitPriceDelivery ?? item.UnitPrice ?? parent.Price ?? 0);
  item.UnitPriceAddtion = basePrice + additionAmount;
  return item;
}

function groupAdditions(details) {
  const groups = new Map();
  for (const detail of Array.isArray(details) ? details : []) {
    if (!detail?.ParentId || !detail?.AdditionId) continue;
    if (!groups.has(detail.ParentId)) groups.set(detail.ParentId, []);
    groups.get(detail.ParentId).push(detail);
  }
  return groups;
}

function areaIdFromTableRef(tableRef) {
  try {
    const parsed = typeof tableRef === "string" ? JSON.parse(tableRef) : tableRef;
    const reference = Array.isArray(parsed) ? parsed[0] : parsed;
    return cleanGuid(reference?.AreaID);
  } catch {
    return "";
  }
}

async function getResult(fetcher, url, headers, operation) {
  const response = await fetcher(url, { method: "GET", headers });
  return readResult(response, operation);
}

async function postResult(fetcher, url, headers, body, operation) {
  const init = { method: "POST", headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetcher(url, init);
  return readResult(response, operation);
}

async function readResult(response, operation) {
  if (!response.ok) {
    throw new SelfOrderError(`CUKCUK ${operation} 요청이 HTTP ${response.status} 오류를 반환했습니다.`, 502, "SELF_ORDER_HTTP_ERROR");
  }
  const result = await response.json();
  if (!result.Success) {
    const status = [21, 22, 23].includes(Number(result.ErrorType)) ? 409 : 502;
    throw new SelfOrderError(result.ErrorMessage || `CUKCUK에서 ${operation}을 처리하지 못했습니다.`, status, `SELF_ORDER_${result.ErrorType ?? "ERROR"}`);
  }
  return result.Data || {};
}

function withCompany(url, companyCode) {
  return `${url}${url.includes("?") ? "&" : "?"}CompanyCode=${encodeURIComponent(companyCode)}`;
}

function safeDomain(value) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9-]{1,63}$/.test(text) ? text : "";
}

function cleanGuid(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab0-9][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

export class SelfOrderError extends Error {
  constructor(message, status = 502, code = "SELF_ORDER_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
