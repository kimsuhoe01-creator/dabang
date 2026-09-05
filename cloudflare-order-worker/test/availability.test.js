import test from "node:test";
import assert from "node:assert/strict";
import { applyAvailabilityToMenuData, buildAvailabilitySnapshot, readAvailabilityStorage, writeAvailabilityStorage, writeVisibilityStorage } from "../src/availability.js";

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
  assert.deepEqual(before.unavailableNotices, {});
  assert.equal(after.scheduledUnavailableMenuIds.includes(SAPPORO_ONE_PLUS_ONE_ID), true);
  assert.equal(after.unavailableNotices[SAPPORO_ONE_PLUS_ONE_ID].title.ko, "오늘의 1+1 행사 종료");
  assert.equal(after.unavailableNotices[SAPPORO_ONE_PLUS_ONE_ID].message.ko, "매일 19:00까지 이용하실 수 있어요. 내일 다시 만나요!");
  assert.match(after.unavailableNotices[SAPPORO_ONE_PLUS_ONE_ID].message.vi, /19:00/);
  assert.match(after.unavailableNotices[SAPPORO_ONE_PLUS_ONE_ID].message.zh, /19:00/);
  assert.match(after.unavailableNotices[SAPPORO_ONE_PLUS_ONE_ID].message.en, /19:00/);
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
  assert.equal(state.manualEntries[0].held, true);
  assert.equal(state.manualEntries[0].hidden, false);
});

test("tablet hiding is reversible and remains independent from a manual hold", async () => {
  const values = new Map();
  const storage = {
    get: key => values.get(key),
    put: async (key, value) => values.set(key, value),
  };
  const now = new Date("2026-09-04T01:00:00.000Z");
  const hidden = await writeVisibilityStorage(storage, PIZZA_ID, false, {
    menuName: "테스트 피자",
    actor: "store-gpt",
    requestId: "visibility-hide-1",
  }, now);
  assert.deepEqual(hidden.manualHiddenMenuIds, [PIZZA_ID]);
  assert.deepEqual(hidden.manualUnavailableMenuIds, [PIZZA_ID]);
  assert.equal(hidden.manualEntries[0].held, false);
  assert.equal(hidden.auditLog[0].operationType, "visibility");
  assert.equal(hidden.auditLog[0].visible, false);

  const snapshot = buildAvailabilitySnapshot(hidden, now);
  assert.ok(snapshot.hiddenMenuIds.includes(PIZZA_ID));
  assert.ok(snapshot.unavailableMenuIds.includes(PIZZA_ID));
  assert.equal(applyAvailabilityToMenuData({ menus: [{ id: PIZZA_ID, available: true }] }, snapshot).menus[0].available, false);

  await writeAvailabilityStorage(storage, PIZZA_ID, false, { requestId: "availability-hold-1" }, now);
  const shown = await writeVisibilityStorage(storage, PIZZA_ID, true, { requestId: "visibility-show-1" }, now);
  assert.deepEqual(shown.manualHiddenMenuIds, []);
  assert.deepEqual(shown.manualUnavailableMenuIds, [PIZZA_ID]);
  assert.equal(shown.manualEntries[0].held, true);

  const resumed = await writeAvailabilityStorage(storage, PIZZA_ID, true, { requestId: "availability-resume-1" }, now);
  assert.deepEqual(resumed.manualUnavailableMenuIds, []);
  assert.deepEqual(resumed.manualEntries, []);
});

test("expired hold does not make a separately hidden menu visible or orderable", async () => {
  const values = new Map();
  const storage = {
    get: key => values.get(key),
    put: async (key, value) => values.set(key, value),
  };
  const start = new Date("2026-09-04T01:00:00.000Z");
  await writeAvailabilityStorage(storage, PIZZA_ID, false, { expiresAt: "2026-09-04T02:00:00Z", requestId: "hold-with-expiry-1" }, start);
  await writeVisibilityStorage(storage, PIZZA_ID, false, { requestId: "hide-with-expiry-1" }, start);
  const state = await readAvailabilityStorage(storage, new Date("2026-09-04T02:00:01.000Z"));
  assert.equal(state.manualEntries[0].held, false);
  assert.equal(state.manualEntries[0].hidden, true);
  assert.deepEqual(state.manualHiddenMenuIds, [PIZZA_ID]);
  assert.deepEqual(state.manualUnavailableMenuIds, [PIZZA_ID]);
});

test("request ids cannot be reused across availability and visibility operations", async () => {
  const values = new Map();
  const storage = {
    get: key => values.get(key),
    put: async (key, value) => values.set(key, value),
  };
  const now = new Date("2026-09-04T01:00:00.000Z");
  await writeVisibilityStorage(storage, PIZZA_ID, false, { requestId: "cross-operation-1" }, now);
  await assert.rejects(writeAvailabilityStorage(storage, PIZZA_ID, false, { requestId: "cross-operation-1" }, now), /already used/);
  await assert.rejects(writeVisibilityStorage(storage, PIZZA_ID, true, { requestId: "cross-operation-1" }, now), /already used/);
});
