import test from "node:test";
import assert from "node:assert/strict";
import { handleVoiceOrderApi, validateVoiceDraft } from "../src/voice-order.js";

const menuData = {
  synced: true,
  catalogRevision: "voice-r1",
  menus: [
    { id: "fried", sourceName: "후라이드 치킨", names: { ko: "후라이드 치킨", vi: "Gà rán" }, price: 100000, available: true, optionTemplateIds: [] },
    { id: "wings", sourceName: "반반 윙봉", names: { ko: "반반 윙봉" }, price: 120000, available: true, optionTemplateIds: ["flavor"], optionRules: { flavor: { required: true, minSelections: 2, maxSelections: 2 } } },
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
