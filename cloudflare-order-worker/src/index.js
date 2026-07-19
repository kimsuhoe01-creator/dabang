import { createCukCukOrder, validateAndBuildOrder } from "./order.js";

const ALLOWED_ORIGINS = new Set([
  "https://kimsuhoe01-creator.github.io",
]);

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors(request, new Response(null, { status: 204 }));
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return cors(request, json({ ok: true, service: "dabang-cukcuk-order-api" }));
    }

    if (url.pathname !== "/api/cukcuk/order" || request.method !== "POST") {
      return cors(request, json({ ok: false, message: "API 경로를 찾지 못했습니다." }, 404));
    }
    if (!ALLOWED_ORIGINS.has(request.headers.get("Origin") || "")) {
      return cors(request, json({ ok: false, code: "ORIGIN_NOT_ALLOWED", message: "허용되지 않은 주문 요청입니다." }, 403));
    }

    try {
      const payload = await request.json();
      const menuResponse = await fetch(env.MENU_DATA_URL, {
        headers: { Accept: "application/json" },
        cf: { cacheTtl: 60, cacheEverything: true },
      });
      if (!menuResponse.ok) throw new ServiceError("메뉴 기준 정보를 불러오지 못했습니다.", 503);
      const menuData = await menuResponse.json();
      const order = validateAndBuildOrder(payload, menuData, env.CUKCUK_BRANCH_ID);
      const result = await createCukCukOrder(env, order);
      return cors(request, json({
        ok: true,
        orderId: result.Id || order.Id,
        orderNo: result.No || null,
        status: result.Status ?? null,
      }));
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      return cors(request, json({
        ok: false,
        code: typeof error?.code === "string" ? error.code : "ORDER_ERROR",
        message: error instanceof Error ? error.message : "주문 전송 중 오류가 발생했습니다.",
      }, status));
    }
  },
};

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
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
  return response;
}
