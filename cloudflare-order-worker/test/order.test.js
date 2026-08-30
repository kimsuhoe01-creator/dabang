import assert from "node:assert/strict";
import test from "node:test";
import { createCukCukOrder, createOrAppendCukCukOrder, validateAndBuildOrder } from "../src/order.js";

const env = {
  CUKCUK_DOMAIN: "dabang",
  CUKCUK_APP_ID: "CUKCUKOpenPlatform",
  CUKCUK_SECRET_KEY: "secret",
  CUKCUK_BRANCH_ID: "branch-1",
};

test("validates menu prices and links options to their parent menu", () => {
  const order = buildOrder();
  assert.equal(order.OrderDetails[0].Price, 100);
  assert.equal(order.OrderDetails[1].AdditionId, "option-1");
  assert.equal(order.OrderDetails[1].ParentId, order.OrderDetails[0].Id);
  assert.equal(order.OrderDetails[1].ItemName, "Nước sốt / 소스");
  assert.deepEqual(order.ListTableID, ["table-1"]);
});

test("enforces an exact two-choice rule for half-and-half menus", () => {
  assert.doesNotThrow(() => buildConstrainedOrder("exact-2", ["value-1", "value-2"], 2, 2));
  assert.throws(() => buildConstrainedOrder("exact-2", ["value-1"], 2, 2), /선택 개수/);
  assert.throws(() => buildConstrainedOrder("exact-2", ["value-1", "value-2", "value-3"], 2, 2), /선택 개수/);
});

test("enforces an exact four-choice rule for four-flavor wing menus", () => {
  assert.doesNotThrow(() => buildConstrainedOrder("exact-4", ["value-1", "value-2", "value-3", "value-4"], 4, 4));
  assert.throws(() => buildConstrainedOrder("exact-4", ["value-1", "value-2", "value-3"], 4, 4), /선택 개수/);
  assert.throws(() => buildConstrainedOrder("exact-4", ["value-1", "value-2", "value-3", "value-4", "value-5"], 4, 4), /선택 개수/);
});

test("requires exactly one of the two tonkatsu plate choices", () => {
  assert.doesNotThrow(() => buildConstrainedOrder("tonkatsu-plate", ["value-1"], 1, 1, {}, 2));
  assert.throws(() => buildConstrainedOrder("tonkatsu-plate", [], 1, 1, {}, 2), /선택 개수/);
  assert.throws(() => buildConstrainedOrder("tonkatsu-plate", ["value-1", "value-2"], 1, 1, {}, 2), /선택 개수/);
});

test("allows one to three Sapporo draft sizes", () => {
  assert.doesNotThrow(() => buildConstrainedOrder("sapporo-sizes", ["value-1"], 1, 3, {}, 3));
  assert.doesNotThrow(() => buildConstrainedOrder("sapporo-sizes", ["value-1", "value-2", "value-3"], 1, 3, {}, 3));
  assert.throws(() => buildConstrainedOrder("sapporo-sizes", [], 1, 3, {}, 3), /선택 개수/);
});

test("allows one to ten fried-item choices", () => {
  const tenChoices = Array.from({ length: 10 }, (_, index) => `value-${index + 1}`);
  assert.doesNotThrow(() => buildConstrainedOrder("fried-items", ["value-1"], 1, 10, {}, 10));
  assert.doesNotThrow(() => buildConstrainedOrder("fried-items", tenChoices, 1, 10, {}, 10));
  assert.throws(() => buildConstrainedOrder("fried-items", [], 1, 10, {}, 10), /선택 개수/);
});

test("allows up to three toppings but rejects a fourth", () => {
  assert.doesNotThrow(() => buildConstrainedOrder("toppings", [], 0, 3));
  assert.doesNotThrow(() => buildConstrainedOrder("toppings", ["value-1", "value-2", "value-3"], 0, 3));
  assert.throws(() => buildConstrainedOrder("toppings", ["value-1", "value-2", "value-3", "value-4"], 0, 3), /선택 개수/);
});

test("rejects a zero-priced wrapper menu when its option source is missing", () => {
  assert.throws(() => validateAndBuildOrder({
    clientOrderId: "order-zero",
    table: { id: "table-1", name: "B-02" },
    items: [{ menuId: "menu-zero", quantity: 1, options: [] }],
  }, {
    synced: true,
    menus: [{ id: "menu-zero", cukcukId: "menu-zero", sourceName: "Add extras", price: 0, available: true, optionTemplateIds: [] }],
    optionTemplates: [],
  }, "branch-1"), error => error.code === "MENU_DATA_INVALID" && error.status === 503);
});

test("rejects foreign option groups, unknown values, and duplicate selections", () => {
  assert.throws(() => buildConstrainedOrder("owned", ["value-1"], 0, 3, { templateId: "foreign" }), /선택할 수 없는 옵션 그룹/);
  assert.throws(() => buildConstrainedOrder("owned", ["unknown"], 0, 3), /선택할 수 없는 옵션/);
  assert.throws(() => buildConstrainedOrder("owned", ["value-1", "value-1"], 0, 3), /중복/);
});

test("requires a valid client order id so retries cannot bypass deduplication", () => {
  assert.throws(
    () => validateAndBuildOrder({
      table: { id: "table-1", name: "B-02" },
      items: [{ menuId: "menu-1", quantity: 1, options: [] }],
    }, {
      synced: true,
      menus: [{ id: "menu-1", price: 100, available: true, optionTemplateIds: [] }],
      optionTemplates: [],
    }, "branch-1"),
    (error) => error.code === "CLIENT_ORDER_ID_REQUIRED" && error.status === 400,
  );
});

test("logs in and creates the first order for a table", async () => {
  const calls = [];
  const fetcher = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/api/Account/Login")) return loginResponse();
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer token");
    assert.ok(url.endsWith("/api/v1/orders/create"));
    return response({ Success: true, Data: { Id: "order-1", No: "1.49", Status: 1 } });
  };
  const result = await createCukCukOrder(env, buildOrder(), fetcher);
  assert.equal(result.No, "1.49");
  assert.equal(calls.length, 2);
});

test("appends later menu items to the existing active table order", async () => {
  let updateBody = null;
  const calls = [];
  const fetcher = async (input, init = {}) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/api/Account/Login")) return loginResponse();
    if (url.endsWith("/api/v1/orders/order-existing")) {
      return response({
        Success: true,
        Data: {
          Id: "order-existing",
          No: "1.49",
          Type: 1,
          Status: 1,
          BranchId: "branch-1",
          TableName: "B-02",
          OrderDetails: [{ Id: "old-line", ItemId: "old-menu", Quantity: 1, Price: 50, SortOrder: 0 }],
        },
      });
    }
    assert.ok(url.endsWith("/api/v1/orders/update-item"));
    updateBody = JSON.parse(init.body);
    return response({ Success: true, Data: { Id: "order-existing", No: "1.49", Status: 1, OrderDetails: updateBody.OrderDetails } });
  };

  const result = await createOrAppendCukCukOrder(env, buildOrder(), "B-02", "order-existing", fetcher);
  assert.equal(result.action, "updated");
  assert.equal(result.No, "1.49");
  assert.equal(updateBody.Id, "order-existing");
  assert.equal(updateBody.OrderDetails.length, 3);
  assert.equal(updateBody.OrderDetails[0].Id, "old-line");
  assert.equal(updateBody.OrderDetails[1].SortOrder, 1);
  assert.equal(updateBody.OrderDetails[2].ParentId, updateBody.OrderDetails[1].Id);
  assert.equal(calls.length, 3);
});

test("creates a new order after the previous table order is paid", async () => {
  const calls = [];
  const fetcher = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/api/Account/Login")) return loginResponse();
    if (url.endsWith("/api/v1/orders/order-paid")) {
      return response({ Success: true, Data: { Id: "order-paid", Status: 4, TableName: "B-02", OrderDetails: [{ Id: "old-line" }] } });
    }
    assert.ok(url.endsWith("/api/v1/orders/create"));
    return response({ Success: true, Data: { Id: "order-new", No: "1.50", Status: 1 } });
  };

  const result = await createOrAppendCukCukOrder(env, buildOrder(), "B-02", "order-paid", fetcher);
  assert.equal(result.action, "created");
  assert.equal(result.Id, "order-new");
  assert.equal(calls.length, 3);
});

test("does not create a second check while payment is requested", async () => {
  const fetcher = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/Account/Login")) return loginResponse();
    return response({ Success: true, Data: { Id: "order-paying", Status: 3, TableName: "B-02", OrderDetails: [{ Id: "old-line" }] } });
  };

  await assert.rejects(
    createOrAppendCukCukOrder(env, buildOrder(), "B-02", "order-paying", fetcher),
    (error) => error.code === "PAYMENT_REQUESTED" && error.status === 409,
  );
});

function buildOrder() {
  return validateAndBuildOrder({
    clientOrderId: "order-1",
    orderedAt: "2026-07-19T08:00:00.000Z",
    language: "ko",
    table: { id: "table-1", name: "B-02" },
    items: [{ menuId: "menu-1", quantity: 2, options: [{ templateId: "template-1", valueId: "option-1" }] }],
  }, {
    synced: true,
    menus: [{ id: "menu-1", cukcukId: "menu-1", sourceName: "Chicken", price: 100, available: true, optionTemplateIds: ["template-1"] }],
    optionTemplates: [{ id: "template-1", minSelections: 0, maxSelections: 1, values: [{ id: "option-1", names: { ko: "번역된 소스", vi: "Sốt đã dịch" }, receiptNames: { ko: "소스", vi: "Nước sốt" }, additionalPrice: 10, visible: true }] }],
  }, "branch-1");
}

function buildConstrainedOrder(templateId, valueIds, minSelections, maxSelections, selectionOverride = {}, valueCount = 6) {
  const values = Array.from({ length: valueCount }, (_, index) => ({
    id: `value-${index + 1}`,
    names: { ko: `선택 ${index + 1}`, vi: `Lựa chọn ${index + 1}` },
    additionalPrice: 0,
    visible: true,
  }));
  return validateAndBuildOrder({
    clientOrderId: `order-${templateId}`,
    table: { id: "table-1", name: "B-02" },
    items: [{
      menuId: "menu-1",
      quantity: 1,
      options: valueIds.map(valueId => ({ templateId, valueId, ...selectionOverride })),
    }],
  }, {
    synced: true,
    menus: [{
      id: "menu-1",
      cukcukId: "menu-1",
      sourceName: "Chicken",
      price: 100,
      available: true,
      optionTemplateIds: [templateId],
      optionRules: { [templateId]: { required: minSelections > 0, minSelections, maxSelections } },
    }],
    optionTemplates: [{ id: templateId, required: false, minSelections: 0, maxSelections: 1, values }],
  }, "branch-1");
}

function loginResponse() {
  return response({ Success: true, Data: { AccessToken: "token", CompanyCode: "dabang" } });
}

function response(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
