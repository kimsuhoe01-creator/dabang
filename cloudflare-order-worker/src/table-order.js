import { login } from "./order.js";

const API_ROOT = "https://graphapi.cukcuk.vn";
const ACTIVE_STATUSES = new Set([1, 3, 7, 8]);
const PAGE_LIMIT = 100;
const MAX_PAGES = 5;

export async function fetchCukCukPosTableOrder(env, tableIdValue, tableNameValue, fetcher = fetch) {
  const branchId = cleanGuid(env.CUKCUK_BRANCH_ID);
  const tableId = cleanGuid(tableIdValue);
  const tableName = cleanLabel(tableNameValue, 80);
  if (!branchId || !tableId) throw new TableOrderError("CUKCUK POS 테이블 조회 설정이 올바르지 않습니다.", 400, "POS_TABLE_CONFIG_INVALID");

  const session = await login(env, fetcher);
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const summaries = await fetchActiveOrders(session, branchId, since, fetcher);
  const matches = summaries
    .filter(order => ACTIVE_STATUSES.has(Number(order?.Status)) && matchesTable(order, tableId, tableName))
    .sort((left, right) => Date.parse(left?.Date || 0) - Date.parse(right?.Date || 0));

  if (!matches.length) return emptyResult(tableId, tableName);
  const details = await Promise.all(matches.map(order => fetchOrderDetail(session, order.Id, fetcher)));
  const items = details.flatMap(normalizePosOrderItems);
  const reportedTotal = matches.reduce((sum, order) => sum + nonNegativeNumber(order?.TotalAmount ?? order?.Amount), 0);
  return {
    table: { id: tableId, name: tableName || cleanLabel(matches.at(-1)?.TableName, 80) },
    hasOrder: items.length > 0,
    total: reportedTotal || items.reduce((sum, item) => sum + item.lineTotal, 0),
    items,
    refreshedAt: new Date().toISOString(),
    source: "pos-active-order",
  };
}

async function fetchActiveOrders(session, branchId, since, fetcher) {
  const rows = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetcher(`${API_ROOT}/api/v1/orders/paging`, {
      method: "POST",
      headers: apiHeaders(session),
      body: JSON.stringify({ Page: page, Limit: PAGE_LIMIT, BranchId: branchId, LastSyncDate: since }),
    });
    const data = await readResult(response, "POS 활성 주문 목록 조회");
    const pageRows = Array.isArray(data) ? data : [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_LIMIT) break;
  }
  return [...new Map(rows.map(order => [String(order?.Id), order])).values()];
}

async function fetchOrderDetail(session, orderId, fetcher) {
  const response = await fetcher(`${API_ROOT}/api/v1/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: apiHeaders(session),
  });
  return readResult(response, "POS 주문 상세 조회");
}

function normalizePosOrderItems(order) {
  const details = Array.isArray(order?.OrderDetails) ? order.OrderDetails : [];
  const children = new Map();
  for (const item of details) {
    const parentId = cleanGuid(item?.ParentId);
    if (!parentId || Number(item?.Status) === 5) continue;
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(item);
  }
  return details.filter(item => !cleanGuid(item?.ParentId) && !cleanGuid(item?.AdditionId) && Number(item?.Status) !== 5).map(item => {
    const quantity = positiveNumber(item?.Quantity);
    const additions = children.get(cleanGuid(item?.Id)) || [];
    const options = additions.map(addition => ({
      additionId: cleanGuid(addition?.AdditionId || addition?.ItemId),
      name: cleanLabel(addition?.ItemName, 160),
      groupName: "",
      quantity: positiveNumber(addition?.Quantity) || quantity || 1,
      additionalPrice: nonNegativeNumber(addition?.Price),
    }));
    const optionTotal = additions.reduce((sum, addition) => sum + (nonNegativeNumber(addition?.Amount) || nonNegativeNumber(addition?.Price) * (positiveNumber(addition?.Quantity) || 1)), 0);
    const lineTotal = nonNegativeNumber(item?.Amount) || nonNegativeNumber(item?.Price) * quantity + optionTotal;
    return {
      menuId: cleanGuid(item?.ItemId),
      name: cleanLabel(item?.ItemName, 240),
      quantity: quantity || 1,
      unitPrice: quantity ? lineTotal / quantity : lineTotal,
      lineTotal,
      options,
    };
  }).filter(item => item.menuId && item.name);
}

function matchesTable(order, tableId, tableName) {
  const ids = [order?.TableId, order?.TableID, ...(Array.isArray(order?.ListTableID) ? order.ListTableID : [])].map(cleanGuid).filter(Boolean);
  if (ids.includes(tableId)) return true;
  if (!tableName) return false;
  return String(order?.TableName || "").split(",").map(value => value.trim()).includes(tableName);
}

async function readResult(response, operation) {
  if (!response.ok) throw new TableOrderError(`CUKCUK ${operation} HTTP ${response.status}`, 502, "CUKCUK_HTTP_ERROR");
  const result = await response.json();
  if (!result?.Success) throw new TableOrderError(result?.ErrorMessage || `CUKCUK ${operation} 실패`, 502, `CUKCUK_${result?.ErrorType || "ERROR"}`);
  return result.Data || {};
}

function apiHeaders(session) {
  return { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}`, CompanyCode: session.companyCode };
}

function emptyResult(tableId, tableName) {
  return { table: { id: tableId, name: tableName }, hasOrder: false, total: 0, items: [], refreshedAt: new Date().toISOString(), source: "pos-active-order" };
}

function cleanGuid(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

function cleanLabel(value, maxLength) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export class TableOrderError extends Error {
  constructor(message, status = 502, code = "POS_TABLE_ORDER_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
