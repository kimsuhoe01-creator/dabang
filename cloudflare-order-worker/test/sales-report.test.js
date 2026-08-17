import assert from "node:assert/strict";
import test from "node:test";
import { buildStoreReport, verifyStoreToken } from "../src/sales.js";

test("builds paid sales and item summary", async () => {
  const fetcher = async (url, init) => {
    if (String(url).endsWith("/orders/paging")) {
      return response({ Success: true, Data: [
        { Id: "o1", Date: "2026-08-17T12:00:00+07:00", Status: 4, Type: 1, TotalAmount: 300000 },
        { Id: "o2", Date: "2026-08-17T13:00:00+07:00", Status: 5, Type: 2, TotalAmount: 100000 },
      ] });
    }
    assert.match(String(url), /\/orders\/o1$/);
    return response({ Success: true, Data: { OrderDetails: [
      { ItemName: "후라이드 치킨", Quantity: 2, Price: 150000, Amount: 300000, Status: 1 },
    ] } });
  };
  const login = async () => ({ accessToken: "token", companyCode: "dabang" });
  const result = await buildStoreReport({ CUKCUK_BRANCH_ID: "branch" }, { from: "2026-08-17", to: "2026-08-17" }, login, fetcher);
  assert.equal(result.summary.sales, 300000);
  assert.equal(result.summary.paidOrders, 1);
  assert.equal(result.summary.cancelledOrders, 1);
  assert.equal(result.topItems[0].quantity, 2);
});

test("verifies bearer token hash", async () => {
  const token = "store-token";
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
  assert.equal(await verifyStoreToken(new Request("https://example.com", { headers: { Authorization: `Bearer ${token}` } }), hash), true);
  assert.equal(await verifyStoreToken(new Request("https://example.com", { headers: { Authorization: "Bearer wrong" } }), hash), false);
});

function response(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
