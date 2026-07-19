import assert from "node:assert/strict";
import test from "node:test";
import { createCukCukOrder, validateAndBuildOrder } from "../src/order.js";

test("validates menu prices and options from published data", () => {
  const order = validateAndBuildOrder({
    clientOrderId: "order-1", orderedAt: "2026-07-19T08:00:00.000Z", language: "ko",
    table: { id: "table-1", name: "B-02" },
    items: [{ menuId: "menu-1", quantity: 2, options: [{ valueId: "option-1" }] }],
  }, {
    synced: true,
    menus: [{ id: "menu-1", cukcukId: "menu-1", sourceName: "Chicken", price: 100, available: true, optionTemplateIds: ["template-1"] }],
    optionTemplates: [{ id: "template-1", values: [{ id: "option-1", names: { ko: "Sauce" }, additionalPrice: 10, visible: true }] }],
  }, "branch-1");
  assert.equal(order.OrderDetails[0].Price, 100);
  assert.equal(order.OrderDetails[1].AdditionId, "option-1");
  assert.deepEqual(order.ListTableID, ["table-1"]);
});

test("logs in and sends order to CUKCUK", async () => {
  const calls = [];
  const fetcher = async (input, init) => {
    calls.push(String(input));
    if (String(input).endsWith("/api/Account/Login")) return response({ Success: true, Data: { AccessToken: "token", CompanyCode: "dabang" } });
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer token");
    return response({ Success: true, Data: { Id: "order-1", No: "SO-1" } });
  };
  const result = await createCukCukOrder({ CUKCUK_DOMAIN: "dabang", CUKCUK_APP_ID: "CUKCUKOpenPlatform", CUKCUK_SECRET_KEY: "secret" }, { Id: "order-1" }, fetcher);
  assert.equal(result.No, "SO-1");
  assert.equal(calls.length, 2);
});

function response(body) { return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }); }
