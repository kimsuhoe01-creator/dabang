const OPENAI_API_ROOT = "https://api.openai.com/v1";
const MAX_TRANSCRIPT_CHARS = 12000;
const MAX_SDP_CHARS = 100000;

export async function handleVoiceOrderApi(request, env, allowedOrigins, fetcher = fetch) {
  const url = new URL(request.url);
  if (!["/api/voice/realtime", "/api/voice/interpret"].includes(url.pathname)) return null;
  if (!allowedOrigins.has(request.headers.get("Origin") || "")) {
    return json({ ok: false, code: "ORIGIN_NOT_ALLOWED", message: "허용되지 않은 음성 주문 요청입니다." }, 403);
  }
  if (!env.OPENAI_API_KEY) {
    return json({ ok: false, code: "VOICE_NOT_CONFIGURED", message: "음성 주문 API가 아직 연결되지 않았습니다." }, 503);
  }

  try {
    if (url.pathname === "/api/voice/realtime") {
      if (request.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);
      return createRealtimeTranscription(request, env, fetcher);
    }
    if (request.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);
    return interpretVoiceOrder(request, env, fetcher);
  } catch (error) {
    return json({
      ok: false,
      code: typeof error?.code === "string" ? error.code : "VOICE_ORDER_ERROR",
      message: error instanceof Error ? error.message : "음성 주문을 처리하지 못했습니다.",
    }, Number.isInteger(error?.status) ? error.status : 502);
  }
}

async function createRealtimeTranscription(request, env, fetcher) {
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/sdp")) {
    throw serviceError("음성 연결 형식이 올바르지 않습니다.", 415, "VOICE_SDP_REQUIRED");
  }
  const sdp = await request.text();
  if (!sdp || sdp.length > MAX_SDP_CHARS) throw serviceError("음성 연결 정보가 올바르지 않습니다.", 400, "VOICE_SDP_INVALID");
  const tableId = cleanText(request.headers.get("X-Dabang-Table-Id"), 100) || "unselected";
  const menuData = await fetchMenuData(env, fetcher);
  const keywords = menuData.menus
    .filter(menu => menu.available !== false)
    .flatMap(menu => [menu.names?.ko, menu.names?.vi, menu.names?.en, menu.sourceName])
    .map(keyword => cleanKeyword(keyword))
    .filter(Boolean)
    .filter((keyword, index, rows) => rows.indexOf(keyword) === index)
    .slice(0, 180);
  const session = {
    type: "transcription",
    audio: {
      input: {
        transcription: {
          model: "gpt-live-transcribe",
          prompt: "Restaurant table order at DABANG Chicken in Vietnam. Preserve menu names, quantities, corrections, cancellations, and final choices exactly.",
          keywords,
          languages: ["ko", "vi", "en", "zh-cn"],
          delay: "low",
        },
        turn_detection: null,
      },
    },
  };
  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(session));
  const response = await fetcher(`${OPENAI_API_ROOT}/realtime/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "OpenAI-Safety-Identifier": await safetyIdentifier(tableId),
    },
    body: form,
  });
  const answer = await response.text();
  if (!response.ok) {
    console.warn("voice_realtime_failed", JSON.stringify({ status: response.status, tableId }));
    throw serviceError("음성 인식 연결을 시작하지 못했습니다.", 502, "VOICE_REALTIME_FAILED");
  }
  return new Response(answer, { status: 200, headers: { "Content-Type": "application/sdp", "Cache-Control": "no-store" } });
}

async function interpretVoiceOrder(request, env, fetcher) {
  const payload = await request.json().catch(() => null);
  const transcript = cleanText(payload?.transcript, MAX_TRANSCRIPT_CHARS);
  if (!transcript) throw serviceError("말씀하신 주문을 듣지 못했습니다. 다시 말해 주세요.", 400, "VOICE_TRANSCRIPT_EMPTY");
  const menuData = await fetchMenuData(env, fetcher);
  const requestedRevision = cleanText(payload?.catalogRevision, 200);
  const currentRevision = cleanText(menuData.catalogRevision || menuData.tableQrLayout?.revision, 200);
  if (requestedRevision && currentRevision && requestedRevision !== currentRevision) {
    throw serviceError("메뉴가 갱신되었습니다. 화면을 새로고침한 뒤 다시 말해 주세요.", 409, "CATALOG_OUTDATED");
  }

  const catalog = compactCatalog(menuData);
  const response = await fetcher(`${OPENAI_API_ROOT}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.VOICE_ORDER_MODEL || "gpt-5.6-luna",
      reasoning: { effort: "none" },
      instructions: voiceInstructions(),
      input: JSON.stringify({ language: cleanText(payload?.language, 12) || "ko", transcript, catalog }),
      text: { format: voiceOrderSchema() },
      store: false,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn("voice_interpret_failed", JSON.stringify({ status: response.status, transcriptLength: transcript.length }));
    throw serviceError("주문 내용을 정리하지 못했습니다. 다시 말해 주세요.", 502, "VOICE_INTERPRET_FAILED");
  }
  const parsed = parseStructuredOutput(result);
  const draft = validateVoiceDraft(parsed, menuData);
  return json({ ok: true, transcript, ...draft });
}

export function validateVoiceDraft(parsed, menuData) {
  const menus = new Map((menuData?.menus || []).filter(menu => menu.available !== false).map(menu => [String(menu.id), menu]));
  const templates = new Map((menuData?.optionTemplates || []).map(template => [String(template.id), template]));
  const questions = Array.isArray(parsed?.questions) ? parsed.questions.map(question => cleanText(question, 240)).filter(Boolean).slice(0, 5) : [];
  const rows = [];
  const invalid = [];
  for (const candidate of Array.isArray(parsed?.items) ? parsed.items : []) {
    const menu = menus.get(String(candidate?.menuId || ""));
    const quantity = Number(candidate?.quantity);
    if (!menu || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      invalid.push("판매 메뉴 또는 수량을 확정하지 못했습니다.");
      continue;
    }
    const attached = (menu.optionTemplateIds || []).map(String);
    const selections = [];
    const selectedKeys = new Set();
    const counts = new Map();
    for (const option of Array.isArray(candidate?.options) ? candidate.options : []) {
      const templateId = String(option?.templateId || "");
      const valueId = String(option?.valueId || "");
      const template = templates.get(templateId);
      const value = template?.values?.find(row => String(row.id) === valueId && row.visible !== false);
      const key = `${templateId}:${valueId}`;
      if (!attached.includes(templateId) || !value || selectedKeys.has(key)) {
        invalid.push(`${displayName(menu)}의 옵션을 확정하지 못했습니다.`);
        continue;
      }
      selectedKeys.add(key);
      counts.set(templateId, (counts.get(templateId) || 0) + 1);
      selections.push({
        templateId,
        valueId,
        valueNames: value.names || value.receiptNames || {},
        additionalPrice: Number(value.additionalPrice || 0),
      });
    }
    for (const templateId of attached) {
      const template = templates.get(templateId);
      if (!template) {
        invalid.push(`${displayName(menu)}의 옵션 정보를 찾지 못했습니다.`);
        continue;
      }
      const rule = menu.optionRules?.[templateId] || {};
      const required = rule.required ?? template.required === true;
      const visibleCount = (template.values || []).filter(value => value.visible !== false).length;
      const min = selectionLimit(rule.minSelections, template.minSelections, required ? 1 : 0);
      const max = selectionLimit(rule.maxSelections, template.maxSelections, visibleCount);
      const count = counts.get(templateId) || 0;
      if (count < min || count > max) invalid.push(`${displayName(menu)}의 필수 옵션을 다시 말씀해 주세요.`);
    }
    const basePrice = Number(menu.price || 0);
    const unitPrice = basePrice + selections.reduce((sum, option) => sum + option.additionalPrice, 0);
    rows.push({ menuId: String(menu.id), quantity, basePrice, unitPrice, menuNames: menu.names || { ko: menu.sourceName }, selections });
  }
  const uniqueQuestions = [...new Set([...questions, ...invalid])].slice(0, 5);
  const total = rows.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0);
  return {
    ready: rows.length > 0 && uniqueQuestions.length === 0,
    items: rows,
    questions: uniqueQuestions,
    total,
  };
}

function compactCatalog(menuData) {
  const templates = new Map((menuData.optionTemplates || []).map(template => [String(template.id), template]));
  return (menuData.menus || []).filter(menu => menu.available !== false).map(menu => ({
    id: String(menu.id),
    code: cleanText(menu.cukcukCode, 80),
    names: menu.names || { ko: menu.sourceName },
    price: Number(menu.price || 0),
    options: (menu.optionTemplateIds || []).map(templateId => {
      const template = templates.get(String(templateId));
      const rule = menu.optionRules?.[templateId] || {};
      return {
        templateId: String(templateId),
        names: template?.names || {},
        min: selectionLimit(rule.minSelections, template?.minSelections, (rule.required ?? template?.required) ? 1 : 0),
        max: selectionLimit(rule.maxSelections, template?.maxSelections, (template?.values || []).length),
        values: (template?.values || []).filter(value => value.visible !== false).map(value => ({
          valueId: String(value.id), names: value.names || value.receiptNames || {}, price: Number(value.additionalPrice || 0),
        })),
      };
    }),
  }));
}

function voiceInstructions() {
  return [
    "Convert a restaurant customer's spoken deliberation into the final intended order using only exact IDs in the supplied catalog.",
    "Apply statements in chronological order: later corrections, cancellations, quantity changes, and replacements override earlier ones.",
    "Do not invent a menu, option, quantity, or ID. Do not guess between similar items.",
    "If a menu or required option is ambiguous or missing, add a short customer-facing question and do not pretend the order is ready.",
    "Return only the schema. Keep questions in the customer's language when possible.",
  ].join("\n");
}

function voiceOrderSchema() {
  return {
    type: "json_schema",
    name: "dabang_voice_order",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["items", "questions"],
      properties: {
        items: {
          type: "array",
          maxItems: 50,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["menuId", "quantity", "options"],
            properties: {
              menuId: { type: "string" },
              quantity: { type: "integer", minimum: 1, maximum: 99 },
              options: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["templateId", "valueId"],
                  properties: { templateId: { type: "string" }, valueId: { type: "string" } },
                },
              },
            },
          },
        },
        questions: { type: "array", maxItems: 5, items: { type: "string" } },
      },
    },
  };
}

function parseStructuredOutput(result) {
  const text = typeof result?.output_text === "string" ? result.output_text : (result?.output || [])
    .flatMap(item => Array.isArray(item?.content) ? item.content : [])
    .find(content => content?.type === "output_text")?.text;
  if (!text) throw serviceError("주문 정리 결과가 비어 있습니다.", 502, "VOICE_OUTPUT_EMPTY");
  try { return JSON.parse(text); } catch { throw serviceError("주문 정리 형식이 올바르지 않습니다.", 502, "VOICE_OUTPUT_INVALID"); }
}

async function fetchMenuData(env, fetcher) {
  const response = await fetcher(env.MENU_DATA_URL, { headers: { Accept: "application/json" }, cf: { cacheTtl: 60, cacheEverything: true } });
  if (!response.ok) throw serviceError("메뉴 기준 정보를 불러오지 못했습니다.", 503, "MENU_DATA_UNAVAILABLE");
  const data = await response.json();
  if (!data?.synced || !Array.isArray(data.menus) || !Array.isArray(data.optionTemplates)) {
    throw serviceError("동기화된 메뉴 정보가 올바르지 않습니다.", 503, "MENU_DATA_INVALID");
  }
  return data;
}

function selectionLimit(primary, fallback, defaultValue) {
  if (Number.isInteger(primary) && primary >= 0) return primary;
  if (Number.isInteger(fallback) && fallback >= 0) return fallback;
  return defaultValue;
}

function displayName(menu) { return cleanText(menu?.names?.ko || menu?.sourceName || menu?.id, 100) || "메뉴"; }
function cleanText(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function cleanKeyword(value) { return cleanText(value, 80).replace(/[<>\r\n]/g, " ").replace(/\s+/g, " ").trim(); }
function serviceError(message, status, code) { const error = new Error(message); error.status = status; error.code = code; return error; }
async function safetyIdentifier(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`dabang-voice:${value}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
