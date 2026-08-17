import { login } from "./order.js";
import { buildStoreReport, verifyStoreToken } from "./sales.js";

export async function handleStoreApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/openapi.json" && request.method === "GET") {
    return json(openApiSchema(url.origin));
  }
  if (url.pathname === "/privacy" && request.method === "GET") {
    return new Response("DABANG CHICKEN 매장 조회 API는 CUKCUK 매출 데이터를 조회 목적으로만 처리하며 별도 판매하지 않습니다.", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (url.pathname !== "/api/store/report" || request.method !== "GET") return null;
  if (!(await verifyStoreToken(request, env.STORE_GPT_TOKEN_SHA256))) {
    return json({ ok: false, code: "UNAUTHORIZED", message: "매장 조회 인증키가 올바르지 않습니다." }, 401);
  }
  try {
    const report = await buildStoreReport(env, {
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      includeItems: url.searchParams.get("includeItems") ?? "true",
    }, login);
    return json(report);
  } catch (error) {
    return json({
      ok: false,
      code: typeof error?.code === "string" ? error.code : "REPORT_ERROR",
      message: error instanceof Error ? error.message : "매출 조회 중 오류가 발생했습니다.",
    }, Number.isInteger(error?.status) ? error.status : 502);
  }
}

function openApiSchema(origin) {
  return {
    openapi: "3.1.0",
    info: {
      title: "DABANG CHICKEN Store Sales API",
      version: "1.0.0",
      description: "다방치킨 박닌본점 CUKCUK 매출 및 판매품목 조회 전용 API",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/store/report": {
        get: {
          operationId: "getDabangStoreReport",
          summary: "지정 기간의 다방치킨 매출과 주요 판매품목을 조회합니다.",
          parameters: [
            { name: "from", in: "query", required: true, schema: { type: "string", format: "date" }, description: "조회 시작일, YYYY-MM-DD" },
            { name: "to", in: "query", required: true, schema: { type: "string", format: "date" }, description: "조회 종료일, YYYY-MM-DD" },
            { name: "includeItems", in: "query", required: false, schema: { type: "boolean", default: true }, description: "메뉴별 판매량 포함 여부" },
          ],
          responses: {
            "200": { description: "매출 보고서", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
            "401": { description: "인증 실패" },
          },
          security: [{ bearerAuth: [] }],
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
