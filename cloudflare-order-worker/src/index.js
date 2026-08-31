import { createOrAppendCukCukOrder, validateAndBuildOrder } from "./order.js";
import { submitCukCukSelfOrder } from "./self-order.js";
import { expandMenuImage } from "./image-edit.js";
import { handleStoreApi } from "./gpt-api.js";
import { handleVoiceOrderApi } from "./voice-order.js";

const ALLOWED_ORIGINS = new Set([
  "https://kimsuhoe01-creator.github.io",
]);

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors(request, new Response(null, { status: 204 }));
    const url = new URL(request.url);
    const storeResponse = await handleStoreApi(request, env);
    if (storeResponse) return cors(request, storeResponse);
    const voiceResponse = await handleVoiceOrderApi(request, env, ALLOWED_ORIGINS);
    if (voiceResponse) return cors(request, voiceResponse);

    if (url.pathname === "/health" && request.method === "GET") {
      return cors(request, json({ ok: true, service: "dabang-cukcuk-order-api" }));
    }

    if (url.pathname === "/api/admin/image-expand" && request.method === "POST") {
      if (!ALLOWED_ORIGINS.has(request.headers.get("Origin") || "")) {
        return cors(request, json({ ok: false, code: "ORIGIN_NOT_ALLOWED", message: "허용되지 않은 관리자 요청입니다." }, 403));
      }
      return cors(request, await expandMenuImage(request, env));
    }

    if (url.pathname !== "/api/cukcuk/order" || request.method !== "POST") {
      return cors(request, json({ ok: false, message: "API 경로를 찾지 못했습니다." }, 404));
    }
    if (!ALLOWED_ORIGINS.has(request.headers.get("Origin") || "")) {
      return cors(request, json({ ok: false, code: "ORIGIN_NOT_ALLOWED", message: "허용되지 않은 주문 요청입니다." }, 403));
    }

    let payload = null;
    try {
      payload = await request.json();
      const menuResponse = await fetch(env.MENU_DATA_URL, {
        headers: { Accept: "application/json" },
        cf: { cacheTtl: 60, cacheEverything: true },
      });
      if (!menuResponse.ok) throw new ServiceError("메뉴 기준 정보를 불러오지 못했습니다.", 503, "MENU_DATA_UNAVAILABLE");
      const menuData = await menuResponse.json();
      const requestedRevision = typeof payload.catalogRevision === "string" ? payload.catalogRevision.trim() : "";
      const currentRevision = String(menuData.catalogRevision || menuData.tableQrLayout?.revision || "").trim();
      if (requestedRevision && currentRevision && requestedRevision !== currentRevision) {
        throw new ServiceError("메뉴 정보가 갱신되었습니다. 화면을 새로고침하고 메뉴와 옵션을 다시 선택해 주세요.", 409, "CATALOG_OUTDATED");
      }
      const order = validateAndBuildOrder(payload, menuData, env.CUKCUK_BRANCH_ID);
      const tableId = order.ListTableID[0];
      const tableName = String(payload.table.name);
      const transport = payload.transport === "cukcuk-self-order" ? "cukcuk-self-order" : "graph";
      const submissionFingerprint = JSON.stringify({
        transport,
        catalogRevision: requestedRevision,
        tableId,
        items: payload.items.map((item) => ({
          menuId: item?.menuId,
          quantity: item?.quantity,
          options: Array.isArray(item?.options) ? item.options.map((option) => ({ templateId: option?.templateId, valueId: option?.valueId })) : [],
        })),
      });
      const coordinator = env.TABLE_ORDERS.getByName(tableId);
      const coordinatorResponse = await coordinator.fetch("https://table-order.internal/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, tableName, submissionFingerprint, transport }),
      });
      const coordinatorResult = await coordinatorResponse.json();
      if (!coordinatorResponse.ok || coordinatorResult.ok === false) {
        throw new ServiceError(
          coordinatorResult.message || "CUKCUK 주문을 처리하지 못했습니다.",
          coordinatorResponse.status,
          coordinatorResult.code || "ORDER_ERROR",
        );
      }
      const result = coordinatorResult.data || {};
      return cors(request, json({
        ok: true,
        orderId: result.Id || order.Id,
        orderNo: result.No || null,
        status: result.Status ?? null,
        action: result.action || "created",
      }));
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      console.warn("order_request_failed", JSON.stringify({
        status,
        code: typeof error?.code === "string" ? error.code : "ORDER_ERROR",
        message: error instanceof Error ? error.message : "unknown error",
        clientOrderId: typeof payload?.clientOrderId === "string" ? payload.clientOrderId.slice(0, 100) : null,
        tableId: typeof payload?.table?.id === "string" ? payload.table.id.slice(0, 100) : null,
        itemCount: Array.isArray(payload?.items) ? payload.items.length : 0,
        menuIds: Array.isArray(payload?.items) ? payload.items.slice(0, 50).map((item) => String(item?.menuId || "").slice(0, 100)) : [],
      }));
      return cors(request, json({
        ok: false,
        code: typeof error?.code === "string" ? error.code : "ORDER_ERROR",
        message: error instanceof Error ? error.message : "주문 전송 중 오류가 발생했습니다.",
      }, status));
    }
  },
};

export class TableOrderCoordinator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.queue = Promise.resolve();
  }

  async fetch(request) {
    if (request.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);
    const payload = await request.json();
    const task = this.queue.then(() => this.submit(payload));
    this.queue = task.catch(() => undefined);
    return task;
  }

  async submit({ order, tableName, submissionFingerprint, transport }) {
    try {
      const submitter = transport === "cukcuk-self-order" ? submitCukCukSelfOrder : createOrAppendCukCukOrder;
      const result = await submitTableOrder(this.ctx.storage, this.env, order, tableName, submissionFingerprint, submitter);
      return json({ ok: true, data: result });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      return json({
        ok: false,
        code: typeof error?.code === "string" ? error.code : "ORDER_ERROR",
        message: error instanceof Error ? error.message : "주문 처리 중 오류가 발생했습니다.",
      }, status);
    }
  }
}

export async function submitTableOrder(storage, env, order, tableName, submissionFingerprint, submitter = createOrAppendCukCukOrder) {
  const submissionKey = `submission:${order.Id}`;
  const fingerprint = typeof submissionFingerprint === "string" ? submissionFingerprint : "";
  const previous = await storage.get(submissionKey);
  if (previous) {
    if (previous.fingerprint !== fingerprint) {
      throw new ServiceError("같은 주문 번호에 다른 메뉴가 들어 있어 전송을 막았습니다.", 409, "ORDER_ID_CONFLICT");
    }
    if (previous.status === "completed" && previous.result) return { ...previous.result, deduplicated: true };
    throw new ServiceError(
      previous.status === "processing" ? "같은 주문을 이미 처리 중입니다. 다시 누르지 말고 POS를 확인해 주세요." : "이 주문의 처리 결과를 확인해야 합니다. 다시 누르지 말고 POS를 확인해 주세요.",
      409,
      previous.status === "processing" ? "ORDER_IN_PROGRESS" : "ORDER_OUTCOME_UNKNOWN",
    );
  }

  const startedAt = new Date().toISOString();
  await storage.put(submissionKey, { status: "processing", fingerprint, startedAt });
  try {
    const activeOrder = await storage.get("activeOrder");
    const result = await submitter(env, order, tableName, activeOrder?.orderId || null);
    const storedResult = {
      Id: result.Id || order.Id,
      No: result.No || null,
      Status: result.Status ?? null,
      action: result.action || "created",
    };
    const completedAt = new Date().toISOString();
    await storage.put({
      [submissionKey]: { status: "completed", fingerprint, startedAt, completedAt, result: storedResult },
      activeOrder: { orderId: storedResult.Id, orderNo: storedResult.No, updatedAt: completedAt },
    });
    return storedResult;
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "ORDER_ERROR";
    const definitelyNotApplied = Number(error?.status) < 500 || code.startsWith("CUKCUK_LOGIN_");
    if (definitelyNotApplied) await storage.delete(submissionKey);
    else await storage.put(submissionKey, { status: "unknown", fingerprint, startedAt, failedAt: new Date().toISOString(), code });
    throw error;
  }
}

export class ServiceError extends Error {
  constructor(message, status = 400, code = "INVALID_ORDER") {
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

function cors(request, response) {
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Dabang-Table-Id");
  }
  return response;
}
