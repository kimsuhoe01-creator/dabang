import test from "node:test";
import assert from "node:assert/strict";
import { handleVoiceOrderApi, validateVoiceDraft } from "../src/voice-order.js";

const menuData = {
  synced: true,
  catalogRevision: "voice-r1",
  menus: [
    { id: "fried", sourceName: "후라이드 치킨", categoryName: "다방치킨", names: { ko: "후라이드 치킨", vi: "Gà rán" }, price: 100000, available: true, optionTemplateIds: [] },
    { id: "wings", sourceName: "반반 윙봉", categoryName: "날개치킨", names: { ko: "반반 윙봉" }, price: 120000, available: true, optionTemplateIds: ["flavor"], optionRules: { flavor: { required: true, minSelections: 2, maxSelections: 2 } } },
    { id: "sapporo", sourceName: "사포로 생맥주", categoryName: "주류", names: { ko: "사포로 생맥주" }, price: 50000, available: true, optionTemplateIds: ["sapporo-size"], optionRules: { "sapporo-size": { required: true, minSelections: 1, maxSelections: 1 } } },
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

test("voice session uses GPT-Realtime-2.1 Mini as a conversational waiter", async () => {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === "https://menu.test/catalog.json") return Response.json(menuData);
    if (String(url) === "https://api.openai.com/v1/realtime/calls") return new Response("answer-sdp", { status: 200 });
    throw new Error(`unexpected URL ${url}`);
  };
  const request = new Request("https://worker.test/api/voice/realtime", {
    method: "POST",
    headers: {
      Origin: "https://kimsuhoe01-creator.github.io",
      "Content-Type": "application/sdp",
      "X-Dabang-Table-Id": "A-01",
      "X-Dabang-Language": "ko",
    },
    body: "offer-sdp",
  });
  const response = await handleVoiceOrderApi(request, { OPENAI_API_KEY: "test-secret", MENU_DATA_URL: "https://menu.test/catalog.json" }, new Set(["https://kimsuhoe01-creator.github.io"]), fetcher);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "answer-sdp");
  const session = JSON.parse(calls[1].init.body.get("session"));
  assert.equal(session.type, "realtime");
  assert.equal(session.model, "gpt-realtime-2.1-mini");
  assert.deepEqual(session.output_modalities, ["audio"]);
  assert.equal(session.audio.input.turn_detection, null);
  assert.equal(session.audio.output.voice, "marin");
  assert.equal(session.tools[0].name, "prepare_order_review");
  assert.equal(session.tools[1].name, "list_published_menu");
  assert.ok(session.tools[1].parameters.properties.categoryName.enum.includes("다방치킨"));
  assert.match(session.instructions, /Do not ask the customer to say yes/);
  assert.match(session.instructions, /button is the final confirmation/);
  assert.match(session.instructions, /MUST call list_published_menu/);
  assert.match(session.instructions, /copy only its exactMenuNames/);
  assert.match(session.instructions, /Never say a tool is running/);
  assert.match(session.instructions, /후라이드 치킨/);
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

test("an exact short answer fills the one missing published option without another model call", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    if (String(url) === "https://menu.test/catalog.json") return Response.json(menuData);
    throw new Error(`the exact follow-up should not call ${url}`);
  };
  const request = new Request("https://worker.test/api/voice/interpret", {
    method: "POST",
    headers: { Origin: "https://kimsuhoe01-creator.github.io", "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript: "640cc로 주세요",
      catalogRevision: "voice-r1",
      language: "ko",
      context: { turns: [{
        transcript: "사포로 생맥주 두 잔 주세요",
        questions: ["용량을 선택해 주세요."],
        items: [{ menuId: "sapporo", quantity: 2, options: [] }],
      }, {
        transcript: "640cc",
        questions: ["사포로 생맥주의 필수 옵션을 다시 말씀해 주세요."],
        items: [],
      }] },
    }),
  });
  const response = await handleVoiceOrderApi(request, { OPENAI_API_KEY: "test-secret", MENU_DATA_URL: "https://menu.test/catalog.json" }, new Set(["https://kimsuhoe01-creator.github.io"]), fetcher);
  const result = await response.json();
  assert.equal(result.ready, true);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].selections[0].valueId, "640");
  assert.deepEqual(calls, ["https://menu.test/catalog.json"]);
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
