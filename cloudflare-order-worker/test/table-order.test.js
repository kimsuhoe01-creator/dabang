import assert from "node:assert/strict";
import test from "node:test";
import { fetchCukCukPosTableOrder } from "../src/table-order.js";

const env = {
  CUKCUK_DOMAIN: "dabang",
  CUKCUK_APP_ID: "CUKCUKOpenPlatform",
  CUKCUK_SECRET_KEY: "test-secret",
  CUKCUK_BRANCH_ID: "430a00af-29db-4f30-b8f8-e87bdb793ab0",
};

test("reads the latest POS order even when an occupied table is reported as paid", async () => {
  const calls = [];
  const tableId = "f10c9fdf-c490-4dad-a706-c23a59c08c71";
  const orderId = "11111111-1111-4111-8111-111111111111";
  const parentId = "22222222-2222-4222-8222-222222222222";
  const fetcher = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/api/Account/Login")) {
      return response({ Success: true, Data: { AccessToken: "access-token", CompanyCode: "dabang" } });
    }
    assert.equal(init.headers.Authorization, "Bearer access-token");
    assert.equal(init.headers.CompanyCode, "dabang");
    if (url.endsWith(`/api/v1/tables/${env.CUKCUK_BRANCH_ID}`)) {
      assert.equal(init.method, "GET");
      return response({ Success: true, Data: { ListTable: [{ MapObjectID: tableId, MapObjectName: "D-6", IsAvailable: false, Status: 1 }] } });
    }
    if (url.endsWith("/api/v1/orders/paging")) {
      const body = JSON.parse(init.body);
      assert.equal(body.BranchId, env.CUKCUK_BRANCH_ID);
      assert.equal(body.Page, 1);
      return response({ Success: true, Data: [
        { Id: orderId, Status: 4, TableName: "D-6", TotalAmount: 714200, Date: "2026-08-31T22:03:22+07:00" },
        { Id: "33333333-3333-4333-8333-333333333333", Status: 4, TableName: "D-6", TotalAmount: 756000, Date: "2026-08-31T16:20:44+07:00" },
        { Id: "66666666-6666-4666-8666-666666666666", Status: 8, TableName: "D-6", TotalAmount: 100000, Date: "2026-08-30T19:00:00+07:00" },
      ] });
    }
    if (url.endsWith(`/api/v1/orders/${orderId}`)) {
      return response({ Success: true, Data: {
        Id: orderId,
        OrderDetails: [
          { Id: parentId, ItemId: "d301f64f-16fa-4c8f-86bb-62318205039a", ItemName: "돈까스 플레이트", Quantity: 2, Price: 350000, Amount: 700000, Status: 1 },
          { Id: "44444444-4444-4444-8444-444444444444", ParentId: parentId, AdditionId: "55555555-5555-4555-8555-555555555555", ItemName: "반반", Quantity: 2, Price: 7100, Amount: 14200, Status: 1 },
        ],
      } });
    }
    assert.fail(`Unexpected URL: ${url}`);
  };

  const result = await fetchCukCukPosTableOrder(env, tableId, "", fetcher);

  assert.equal(calls.length, 4);
  assert.equal(result.source, "pos-active-order");
  assert.equal(result.table.name, "D-6");
  assert.equal(result.hasOrder, true);
  assert.equal(result.total, 714200);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, "돈까스 플레이트");
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].lineTotal, 700000);
  assert.deepEqual(result.items[0].options, [{
    additionId: "55555555-5555-4555-8555-555555555555",
    name: "반반",
    groupName: "",
    quantity: 2,
    additionalPrice: 7100,
  }]);
});

test("does not show a paid order after the table becomes available", async () => {
  const tableId = "f10c9fdf-c490-4dad-a706-c23a59c08c71";
  const fetcher = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/api/Account/Login")) {
      return response({ Success: true, Data: { AccessToken: "access-token", CompanyCode: "dabang" } });
    }
    if (url.endsWith(`/api/v1/tables/${env.CUKCUK_BRANCH_ID}`)) {
      return response({ Success: true, Data: { ListTable: [{ MapObjectID: tableId, MapObjectName: "D-6", IsAvailable: true, Status: 2 }] } });
    }
    if (url.endsWith("/api/v1/orders/paging")) {
      return response({ Success: true, Data: [
        { Id: "11111111-1111-4111-8111-111111111111", Status: 4, TableName: "D-6", TotalAmount: 714200, Date: "2026-08-31T22:03:22+07:00" },
      ] });
    }
    assert.fail(`Unexpected URL: ${url} ${init.method || "GET"}`);
  };

  const result = await fetchCukCukPosTableOrder(env, tableId, "D-6", fetcher);

  assert.equal(result.hasOrder, false);
  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);
});

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
