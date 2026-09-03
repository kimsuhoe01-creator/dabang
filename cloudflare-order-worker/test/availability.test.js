import test from "node:test";
import assert from "node:assert/strict";
import { applyAvailabilityToMenuData, buildAvailabilitySnapshot, readAvailabilityStorage, writeAvailabilityStorage } from "../src/availability.js";

const SAPPORO_ONE_PLUS_ONE_ID = "52c29562-ac31-42c7-9f24-956d348de02a";
const PIZZA_ID = "c0f16b37-ff76-4d8e-a5a8-3ead5fd7b0a5";
const CHICKEN_PIZZA_SET_ID = "e1cf1187-b643-4b90-9f6f-9a7458eaf037";

test("Space Pizza and chicken-pizza sets are closed only on 2026-09-03 store time", () => {
  const duringClosure = buildAvailabilitySnapshot([], new Date("2026-09-03T05:00:00.000Z"));
  assert.equal(duringClosure.categoryClosures.length, 1);
  assert.equal(duringClosure.categoryClosures[0].categoryName, "스페이스 피자");
  assert.match(duringClosure.categoryClosures[0].title.ko, /금일 휴무/);
  assert.ok(duringClosure.unavailableMenuIds.includes(PIZZA_ID));
  assert.ok(duringClosure.unavailableMenuIds.includes(CHICKEN_PIZZA_SET_ID));
  assert.ok(duringClosure.categoryClosures[0].hiddenMenuIds.includes(CHICKEN_PIZZA_SET_ID));

  const afterClosure = buildAvailabilitySnapshot([], new Date("2026-09-03T17:00:01.000Z"));
  assert.equal(afterClosure.categoryClosures.length, 0);
  assert.equal(afterClosure.closureUnavailableMenuIds.length, 0);
  assert.equal(afterClosure.unavailableMenuIds.includes(PIZZA_ID), false);
  assert.equal(afterClosure.unavailableMenuIds.includes(CHICKEN_PIZZA_SET_ID), false);
});

test("Sapporo 1+1 closes at 19:00 Asia/Ho_Chi_Minh", () => {
  const before = buildAvailabilitySnapshot([], new Date("2026-09-03T11:59:59.000Z"));
  const after = buildAvailabilitySnapshot([], new Date("2026-09-03T12:00:00.000Z"));
  assert.equal(before.scheduledUnavailableMenuIds.includes(SAPPORO_ONE_PLUS_ONE_ID), false);
  assert.equal(after.scheduledUnavailableMenuIds.includes(SAPPORO_ONE_PLUS_ONE_ID), true);
});

test("availability snapshot disables matching catalog items before order and voice validation", () => {
  const snapshot = buildAvailabilitySnapshot([], new Date("2026-09-03T05:00:00.000Z"));
  const result = applyAvailabilityToMenuData({ menus: [
    { id: PIZZA_ID, available: true },
    { id: CHICKEN_PIZZA_SET_ID, available: true },
    { id: "unrelated", available: true },
  ] }, snapshot);
  assert.equal(result.menus[0].available, false);
  assert.equal(result.menus[1].available, false);
  assert.equal(result.menus[2].available, true);
});

test("manual availability storage persists and removes unavailable IDs", async () => {
  const values = new Map();
  const storage = {
    get: key => values.get(key),
    put: async (key, value) => values.set(key, value),
  };
  await writeAvailabilityStorage(storage, PIZZA_ID, false);
  assert.deepEqual((await readAvailabilityStorage(storage)).manualUnavailableMenuIds, [PIZZA_ID]);
  await writeAvailabilityStorage(storage, PIZZA_ID, true);
  assert.deepEqual((await readAvailabilityStorage(storage)).manualUnavailableMenuIds, []);
});

test("temporary manual availability expires without overriding future orders", async () => {
  const values = new Map();
  const storage = {
    get: key => values.get(key),
    put: async (key, value) => values.set(key, value),
  };
  const start = new Date("2026-09-04T01:00:00.000Z");
  const state = await writeAvailabilityStorage(storage, PIZZA_ID, false, {
    expiresAt: "2026-09-04T03:00:00+00:00",
    reason: "test hold",
    actor: "store-gpt",
    requestId: "temporary-hold-1",
  }, start);
  assert.deepEqual(state.manualUnavailableMenuIds, [PIZZA_ID]);
  assert.equal(state.manualEntries[0].expiresAt, "2026-09-04T03:00:00.000Z");
  assert.deepEqual((await readAvailabilityStorage(storage, new Date("2026-09-04T03:00:01.000Z"))).manualUnavailableMenuIds, []);
});

test("manual availability writes are idempotent by request id and retain an audit trail", async () => {
  const values = new Map();
  const storage = {
    get: key => values.get(key),
    put: async (key, value) => values.set(key, value),
  };
  const now = new Date("2026-09-04T01:00:00.000Z");
  const first = await writeAvailabilityStorage(storage, PIZZA_ID, false, {
    actor: "store-gpt",
    requestId: "same-request",
  }, now);
  const replay = await writeAvailabilityStorage(storage, PIZZA_ID, false, {
    actor: "store-gpt",
    requestId: "same-request",
  }, new Date("2026-09-04T01:01:00.000Z"));
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.manualUnavailableMenuIds, [PIZZA_ID]);
  assert.equal(replay.auditLog.length, 1);
});

test("manual availability rejects a request id reused for another operation", async () => {
  const values = new Map();
  const storage = {
    get: key => values.get(key),
    put: async (key, value) => values.set(key, value),
  };
  const secondId = "d902dc7b-b6b7-402d-aa90-4edb1e5cfbc2";
  const now = new Date("2026-09-04T03:00:00.000Z");
  await writeAvailabilityStorage(storage, PIZZA_ID, false, { requestId: "request_12345678" }, now);

  await assert.rejects(
    writeAvailabilityStorage(storage, secondId, false, { requestId: "request_12345678" }, now),
    /already used/,
  );
  await assert.rejects(
    writeAvailabilityStorage(storage, PIZZA_ID, true, { requestId: "request_12345678" }, now),
    /already used/,
  );
});

test("legacy unavailable id storage migrates without reopening menus", async () => {
  const values = new Map([["menuAvailability", {
    manualUnavailableMenuIds: [PIZZA_ID],
    updatedAt: "2026-09-03T10:00:00.000Z",
  }]]);
  const storage = {
    get: key => values.get(key),
    put: async (key, value) => values.set(key, value),
  };
  const state = await readAvailabilityStorage(storage, new Date("2026-09-04T01:00:00.000Z"));
  assert.deepEqual(state.manualUnavailableMenuIds, [PIZZA_ID]);
  assert.equal(state.manualEntries[0].expiresAt, null);
});
