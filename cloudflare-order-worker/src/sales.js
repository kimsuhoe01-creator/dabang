const API_ROOT = "https://graphapi.cukcuk.vn";
const MAX_PAGES = 20;
const PAGE_LIMIT = 100;

export async function buildStoreReport(env, params, login, fetcher = fetch) {
  const { from, to, includeItems = true } = validateRange(params);
  const session = await login(env, fetcher);
  const orders = await fetchOrders(session, env.CUKCUK_BRANCH_ID, from, fetcher);
  const inRange = orders.filter((order) => {
    const date = Date.parse(order.Date);
    return Number.isFinite(date) && date >= from.getTime() && date < to.getTime();
  });
  const paid = inRange.filter((order) => Number(order.Status) === 4);
  const cancelled = inRange.filter((order) => Number(order.Status) === 5);
  const totalSales = paid.reduce((sum, order) => sum + number(order.TotalAmount), 0);

  const report = {
    ok: true,
    store: "DABANG CHICKEN Bắc Ninh",
    timezone: "Asia/Ho_Chi_Minh",
    period: { from: from.toISOString(), toExclusive: to.toISOString() },
    summary: {
      sales: totalSales,
      paidOrders: paid.length,
      cancelledOrders: cancelled.length,
      averageOrderValue: paid.length ? Math.round(totalSales / paid.length) : 0,
    },
    byOrderType: aggregate(paid, (order) => orderTypeName(order.Type), (order) => number(order.TotalAmount)),
    byHour: aggregate(paid, (order) => localHour(order.Date), (order) => number(order.TotalAmount)),
    generatedAt: new Date().toISOString(),
  };

  if (includeItems && paid.length) {
    const details = await mapLimit(paid.slice(0, 500), 8, (order) => fetchOrderDetail(session, order.Id, fetcher));
    report.topItems = summarizeItems(details).slice(0, 30);
    report.itemCoverage = {
      detailedOrders: details.length,
      paidOrders: paid.length,
      complete: paid.length <= 500,
    };
  }
  return report;
}

export async function verifyStoreToken(request, expectedHash) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !expectedHash) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const actual = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(actual, expectedHash);
}

function validateRange(params) {
  const fromText = String(params.from || "");
  const toText = String(params.to || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromText) || !/^\d{4}-\d{2}-\d{2}$/.test(toText)) {
    throw new ReportError("from과 to는 YYYY-MM-DD 형식이어야 합니다.", 400, "INVALID_DATE");
  }
  const from = new Date(`${fromText}T00:00:00+07:00`);
  const toInclusive = new Date(`${toText}T00:00:00+07:00`);
  const to = new Date(toInclusive.getTime() + 86400000);
  const days = Math.round((to.getTime() - from.getTime()) / 86400000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || days < 1 || days > 31) {
    throw new ReportError("조회 기간은 1일 이상 31일 이하여야 합니다.", 400, "INVALID_RANGE");
  }
  return { from, to, includeItems: params.includeItems !== false && params.includeItems !== "false" };
}

async function fetchOrders(session, branchId, from, fetcher) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetcher(`${API_ROOT}/api/v1/orders/paging`, {
      method: "POST",
      headers: apiHeaders(session),
      body: JSON.stringify({ Page: page, Limit: PAGE_LIMIT, BranchId: branchId, LastSyncDate: from.toISOString() }),
    });
    const result = await readResult(response, "주문 목록 조회");
    const rows = Array.isArray(result.Data) ? result.Data : [];
    all.push(...rows);
    if (rows.length < PAGE_LIMIT) break;
  }
  return deduplicate(all);
}

async function fetchOrderDetail(session, orderId, fetcher) {
  const response = await fetcher(`${API_ROOT}/api/v1/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: apiHeaders(session),
  });
  const result = await readResult(response, "주문 상세 조회");
  return result.Data || {};
}

async function readResult(response, operation) {
  if (!response.ok) throw new ReportError(`CUKCUK ${operation} HTTP ${response.status}`, 502, "CUKCUK_HTTP_ERROR");
  const result = await response.json();
  if (!result.Success) throw new ReportError(result.ErrorMessage || `CUKCUK ${operation} 실패`, 502, `CUKCUK_${result.ErrorType || "ERROR"}`);
  return result;
}

function apiHeaders(session) {
  return { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}`, CompanyCode: session.companyCode };
}

function summarizeItems(orders) {
  const map = new Map();
  for (const order of orders) {
    for (const item of Array.isArray(order.OrderDetails) ? order.OrderDetails : []) {
      if (item.ParentId || item.AdditionId || Number(item.Status) === 5) continue;
      const name = String(item.ItemName || "이름 없음").trim();
      const row = map.get(name) || { name, quantity: 0, sales: 0 };
      row.quantity += number(item.Quantity);
      row.sales += number(item.Amount || number(item.Price) * number(item.Quantity));
      map.set(name, row);
    }
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.sales - a.sales);
}

function aggregate(rows, keyFn, amountFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const value = map.get(key) || { orders: 0, sales: 0 };
    value.orders += 1;
    value.sales += amountFn(row);
    map.set(key, value);
  }
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
}

function localHour(value) {
  const date = new Date(value);
  return `${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", hour12: false }).format(date)}:00`;
}

function orderTypeName(type) {
  return ({ 1: "매장", 2: "포장", 3: "배달", 4: "예약" })[Number(type)] || "기타";
}

function deduplicate(rows) {
  const map = new Map();
  for (const row of rows) map.set(String(row.Id), row);
  return [...map.values()];
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export class ReportError extends Error {
  constructor(message, status = 400, code = "REPORT_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
