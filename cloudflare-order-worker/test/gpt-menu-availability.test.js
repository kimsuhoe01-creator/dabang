import test from "node:test";
import assert from "node:assert/strict";
import { handleStoreApi, resolveResumeAt, searchMenus } from "../src/gpt-api.js";
import { readAvailabilityStorage, writeAvailabilityStorage } from "../src/availability.js";

const SECRET = "store-gpt-test-secret";
const NOW = new Date("2026-09-04T01:00:00.000Z");
const NACHO_ID = "a1681f58-51f1-48eb-b38b-5d7189e4b236";
const CHIPI_M_ID = "e1cf1187-b643-4b90-9f6f-9a7458eaf037";
const CHIPI_L_ID = "1ffd639e-dd8f-4185-9ab9-4b187835b21c";

const menuData = {
  menus: [
    { id: NACHO_ID, cukcukCode: "M04", categoryName: "안주", names: { ko: "딥치즈 & 나초칩", vi: "Bánh nacho" }, price: 194400, available: true, sortOrder: 1 },
    { id: CHIPI_M_ID, cukcukCode: "SET-M", categoryName: "세트", names: { ko: "치피 세트 (M)" }, price: 500000, available: true, sortOrder: 2 },
    { id: CHIPI_L_ID, cukcukCode: "SET-L", categoryName: "세트", names: { ko: "치피 세트 (L)" }, price: 700000, available: true, sortOrder: 3 },
  ],
};

test("store GPT OpenAPI publishes authenticated menu management actions", async () => {
  const response = await handleStoreApi(new Request("https://example.test/openapi.json"), {});
  const schema = await response.json();
  assert.equal(schema.info.version, "2.0.0");
  assert.ok(schema.paths["/api/store/menus"].get);
  assert.ok(schema.paths["/api/store/menu-availability"].get);
  assert.equal(schema.paths["/api/store/menu-hold"].post["x-openai-isConsequential"], true);
  assert.equal(schema.paths["/api/store/menu-resume"].post["x-openai-isConsequential"], true);
  assert.equal(schema.paths["/api/store/menus"].get["x-openai-isConsequential"], false);
  assert.equal(schema.components.securitySchemes.bearerAuth.scheme, "bearer");
});

test("menu search returns exact candidates and never collapses ambiguous sizes", () => {
  const snapshot = { manualUnavailableMenuIds: [], scheduledUnavailableMenuIds: [], closureUnavailableMenuIds: [] };
  assert.deepEqual(searchMenus(menuData, "딥치즈", snapshot).map(menu => menu.id), [NACHO_ID]);
  assert.deepEqual(searchMenus(menuData, "치피 세트", snapshot).map(menu => menu.id), [CHIPI_M_ID, CHIPI_L_ID]);
});

test("store-day-end uses the next Vietnam midnight", () => {
  assert.equal(resolveResumeAt("store_day_end", null, NOW), "2026-09-04T17:00:00.000Z");
});

test("authenticated GPT can hold, verify, replay, and resume one exact menu", async () => {
  const fixture = await apiFixture();
  const holdBody = {
    menuId: NACHO_ID,
    expectedName: "딥치즈 & 나초칩",
    resumePolicy: "store_day_end",
    reason: "오늘 재고 없음",
    requestId: "4a87079c-8ed3-4bcb-a2e0-d7e389b2e47e",
  };
  const hold = await callApi(fixture, "/api/store/menu-hold", { method: "POST", body: JSON.stringify(holdBody) });
  assert.equal(hold.status, 200);
  const held = await hold.json();
  assert.equal(held.menu.effectiveAvailable, false);
  assert.equal(held.menu.manualResumeAt, "2026-09-04T17:00:00.000Z");

  const replay = await callApi(fixture, "/api/store/menu-hold", { method: "POST", body: JSON.stringify(holdBody) });
  assert.equal((await replay.json()).replayed, true);

  const status = await callApi(fixture, `/api/store/menu-availability?menuId=${NACHO_ID}`);
  assert.equal((await status.json()).menus[0].blockedBy.includes("manual"), true);

  const resume = await callApi(fixture, "/api/store/menu-resume", {
    method: "POST",
    body: JSON.stringify({ menuId: NACHO_ID, expectedName: "딥치즈 & 나초칩", requestId: "d3956651-4693-4109-b7b5-894304c8874e" }),
  });
  assert.equal((await resume.json()).menu.effectiveAvailable, true);
});

test("write rejects a stale or mismatched menu name without changing state", async () => {
  const fixture = await apiFixture();
  const response = await callApi(fixture, "/api/store/menu-hold", {
    method: "POST",
    body: JSON.stringify({
      menuId: NACHO_ID,
      expectedName: "치피 세트 (M)",
      resumePolicy: "manual",
      requestId: "9272157a-63a6-49bd-a03b-f171872843cc",
    }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "MENU_NAME_MISMATCH");
  const status = await callApi(fixture, "/api/store/menu-availability");
  assert.equal((await status.json()).count, 0);
});

test("resuming a source-disabled menu cannot make it effectively available", async () => {
  const fixture = await apiFixture();
  fixture.dependencies.fetcher = async () => Response.json({ menus: [{ ...menuData.menus[0], available: false }] });
  const response = await callApi(fixture, "/api/store/menu-resume", {
    method: "POST",
    body: JSON.stringify({
      menuId: NACHO_ID,
      expectedName: "딥치즈 & 나초칩",
      requestId: "16349451-b132-42da-86ec-76cb6c5b52a0",
    }),
  });
  const result = await response.json();
  assert.equal(result.menu.effectiveAvailable, false);
  assert.deepEqual(result.menu.blockedBy, ["cukcuk_source"]);
});

test("store GPT endpoints reject missing authentication", async () => {
  const fixture = await apiFixture();
  const response = await handleStoreApi(new Request("https://example.test/api/store/menus?query=딥치즈"), fixture.env, fixture.dependencies);
  assert.equal(response.status, 401);
});

async function apiFixture() {
  const hash = await sha256(SECRET);
  const values = new Map();
  const storage = {
    get: key => values.get(key),
    put: async (key, value) => values.set(key, value),
  };
  const durable = {
    fetch: async (url, init = {}) => {
      const method = init.method || "GET";
      if (method === "GET") return Response.json(await readAvailabilityStorage(storage, NOW));
      const payload = JSON.parse(init.body);
      return Response.json(await writeAvailabilityStorage(storage, payload.menuId, payload.available, payload, NOW));
    },
  };
  return {
    env: {
      STORE_GPT_TOKEN_SHA256: hash,
      MENU_DATA_URL: "https://example.test/menu.json",
      TABLE_ORDERS: { getByName: () => durable },
    },
    dependencies: {
      now: NOW,
      fetcher: async () => Response.json(menuData),
    },
  };
}

function callApi(fixture, path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${SECRET}`);
  if (init.body) headers.set("Content-Type", "application/json");
  return handleStoreApi(new Request(`https://example.test${path}`, { ...init, headers }), fixture.env, fixture.dependencies);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
