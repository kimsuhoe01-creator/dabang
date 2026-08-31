import test from "node:test";
import assert from "node:assert/strict";
import { handleVoiceOrderApi, validateVoiceDraft } from "../src/voice-order.js";

const menuData = {
  synced: true,
  catalogRevision: "voice-r1",
  menus: [
    { id: "fried", sourceName: "후라이드 치킨", names: { ko: "후라이드 치킨", vi: "Gà rán" }, price: 100000, available: true, optionTemplateIds: [] },
    { id: "wings", sourceName: "반반 윙봉", names: { ko: "반반 윙봉" }, price: 120000, available: true, optionTemplateIds: ["flavor"], optionRules: { flavor: { required: true, minSelections: 2, maxSelections: 2 } } },
    { id: "sapporo", sourceName: "사포로 생맥주", names: { ko: "사포로 생맥주" }, price: 50000, available: true, optionTemplateIds: ["sapporo-size"], optionRules: { "sapporo-size": { required: true, minSelections: 1, maxSelections: 1 } } },
  ],
  optionTemplates: [{
    id: "flavor",
    names: { ko: "맛 선택" },
    required: true,
    minSelections: 2,
    maxSelections: 2,
    values: [
      { id: "soy", names: { ko: "간장" }, additionalPrice: 0, visible: true },
      { id: "red", names: { ko: "레드" }, additionalPrice: 5000, visible: true },
    ],
  }, {
    id: "sapporo-size",
    names: { ko: "용량" },
    required: true,
    minSelections: 1,
    maxSelections: 1,
    values: [
      { id: "330", names: { ko: "330cc" }, additionalPrice: 0, visible: true },
      { id: "640", names: { ko: "640cc" }, additionalPrice: 50000, visible: true },
      { id: "3300", names: { ko: "3300cc" }, additionalPrice: 250000, visible: true },
    ],
  }],
};

test("voice draft resolves exact menu and option IDs into priced order lines", () => {
  const result = validateVoiceDraft({
    items: [
      { menuId: "fried", quantity: 1, options: [] },
      { menuId: "wings", quantity: 2, options: [{ templateId: "flavor", valueId: "soy" }, { templateId: "flavor", valueId: "red" }] },
    ],
    questions: [],
  }, menuData);
  assert.equal(result.ready, true);
  assert.equal(result.items[1].unitPrice, 125000);
  assert.equal(result.total, 350000);
});

test("voice draft refuses invented menus and incomplete required options", () => {
  const result = validateVoiceDraft({
    items: [
      { menuId: "invented", quantity: 1, options: [] },
      { menuId: "wings", quantity: 1, options: [{ templateId: "flavor", valueId: "soy" }] },
    ],
    questions: [],
  }, menuData);
  assert.equal(result.ready, false);
  assert.match(result.questions.join(" "), /판매 메뉴|필수 옵션/);
});

test("voice API stays disabled until an OpenAI secret is configured", async () => {
  const request = new Request("https://worker.test/api/voice/interpret", {
    method: "POST",
    headers: { Origin: "https://kimsuhoe01-creator.github.io", "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: "후라이드 하나" }),
  });
  const response = await handleVoiceOrderApi(request, {}, new Set(["https://kimsuhoe01-creator.github.io"]));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "VOICE_NOT_CONFIGURED");
});

test("voice interpretation validates the model JSON against the published catalog", async () => {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === "https://menu.test/catalog.json") return Response.json(menuData);
    if (String(url) === "https://api.openai.com/v1/responses") {
      return Response.json({ output_text: JSON.stringify({ items: [{ menuId: "fried", quantity: 2, options: [] }], questions: [] }) });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const request = new Request("https://worker.test/api/voice/interpret", {
    method: "POST",
    headers: { Origin: "https://kimsuhoe01-creator.github.io", "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: "후라이드 하나 아니 두 개", catalogRevision: "voice-r1", language: "ko" }),
  });
  const response = await handleVoiceOrderApi(request, { OPENAI_API_KEY: "test-secret", MENU_DATA_URL: "https://menu.test/catalog.json" }, new Set(["https://kimsuhoe01-creator.github.io"]), fetcher);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.ready, true);
  assert.equal(result.items[0].quantity, 2);
  const openAiBody = JSON.parse(calls[1].init.body);
  assert.equal(openAiBody.model, "gpt-5.6-luna");
  assert.equal(openAiBody.store, false);
  assert.equal(openAiBody.text.format.type, "json_schema");
});

test("voice follow-up sends the prior question and draft with a short option answer", async () => {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === "https://menu.test/catalog.json") return Response.json(menuData);
    if (String(url) === "https://api.openai.com/v1/responses") {
      return Response.json({ output_text: JSON.stringify({
        items: [{ menuId: "sapporo", quantity: 2, options: [{ templateId: "sapporo-size", valueId: "640" }] }],
        questions: [],
      }) });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const context = { turns: [{
    transcript: "생맥주 두 잔 주세요",
    questions: ["사포로 생맥주는 어떤 용량으로 두 잔 주문하시겠어요? 330cc, 640cc, 3300cc 중 선택해 주세요."],
    items: [],
  }] };
  const request = new Request("https://worker.test/api/voice/interpret", {
    method: "POST",
    headers: { Origin: "https://kimsuhoe01-creator.github.io", "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: "640cc", context, catalogRevision: "voice-r1", language: "ko" }),
  });
  const response = await handleVoiceOrderApi(request, { OPENAI_API_KEY: "test-secret", MENU_DATA_URL: "https://menu.test/catalog.json" }, new Set(["https://kimsuhoe01-creator.github.io"]), fetcher);
  const result = await response.json();
  assert.equal(result.ready, true);
  assert.equal(result.items[0].menuId, "sapporo");
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].selections[0].valueId, "640");
  const modelInput = JSON.parse(JSON.parse(calls[1].init.body).input);
  assert.equal(modelInput.priorTurns[0].transcript, "생맥주 두 잔 주세요");
  assert.match(modelInput.priorTurns[0].questions[0], /640cc/);
  assert.equal(modelInput.currentTranscript, "640cc");
});

test("voice clarification returns compact context for the next retry", async () => {
  const fetcher = async (url) => {
    if (String(url) === "https://menu.test/catalog.json") return Response.json(menuData);
    if (String(url) === "https://api.openai.com/v1/responses") {
      return Response.json({ output_text: JSON.stringify({ items: [], questions: ["사포로 생맥주 용량을 선택해 주세요."] }) });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const request = new Request("https://worker.test/api/voice/interpret", {
    method: "POST",
    headers: { Origin: "https://kimsuhoe01-creator.github.io", "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: "사포로 생맥주 두 잔", catalogRevision: "voice-r1", language: "ko" }),
  });
  const response = await handleVoiceOrderApi(request, { OPENAI_API_KEY: "test-secret", MENU_DATA_URL: "https://menu.test/catalog.json" }, new Set(["https://kimsuhoe01-creator.github.io"]), fetcher);
  const result = await response.json();
  assert.equal(result.ready, false);
  assert.equal(result.followUpContext.turns[0].transcript, "사포로 생맥주 두 잔");
  assert.match(result.followUpContext.turns[0].questions[0], /용량/);
});
