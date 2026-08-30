import assert from "node:assert/strict";
import test from "node:test";
import { submitCukCukSelfOrder } from "../src/self-order.js";

const env = {
  CUKCUK_DOMAIN: "dabang",
  CUKCUK_BRANCH_ID: "430a00af-29db-4f30-b8f8-e87bdb793ab0",
};

test("submits a table cart through the native CUKCUK self-order sequence", async () => {
  const calls = [];
  let updateBody = null;
  const fetcher = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/order-online/Config/GetConfig")) {
      assert.match(init.headers.Authorization, /^[0-9a-f-]{36}$/i);
      return response({ Success: true, Data: { Token: "public-session-token", CompanyCode: "dabang", ApiUrl: "/cukapiv2/orderonline" } });
    }
    assert.equal(init.headers.AuthorizationKey, "public-session-token");
    assert.match(url, /CompanyCode=dabang/);
    if (url.includes("GetOrderByTableID")) {
      return response({ Success: true, Data: {
        OrderId: "11111111-1111-4111-8111-111111111111",
        BranchID: env.CUKCUK_BRANCH_ID,
        TableName: "A-1",
        BookingType: 1,
        DeliveryType: 3,
        Amount: 0,
        TotalAmount: 0,
        TableRef: JSON.stringify([{ AreaID: "99f7a22b-b478-4f06-b1b4-3694d87840ba" }]),
        ListInventoryItem: [],
        ListInventoryItemTemp: [],
      } });
    }
    if (url.includes("GetInventoryItemDetailByID")) {
      return response({ Success: true, Data: {
        InventoryItemID: "e9e75a8d-cb9d-442b-8f57-08c06421f56f",
        InventoryItemName: "Pepsi Zero",
        InventoryItemType: 5,
        UnitPrice: 33000,
        UnitPriceDelivery: 33000,
        UnitPriceAddtion: 0,
        BuyQuantity: 0,
        CartItemID: "00000000-0000-0000-0000-000000000000",
        OrderOnlineDetailID: "00000000-0000-0000-0000-000000000000",
      } });
    }
    if (url.includes("/update-cart")) {
      updateBody = JSON.parse(init.body);
      return response({ Success: true, Data: { OrderId: updateBody.OrderId } });
    }
    if (url.includes("/confirm-order")) {
      assert.equal(init.body, undefined);
      return response({ Success: true, Data: { OrderId: "22222222-2222-4222-8222-222222222222", ConfirmStatus: 0 } });
    }
    assert.fail(`Unexpected URL: ${url}`);
  };

  const result = await submitCukCukSelfOrder(env, {
    Id: "33333333-3333-4333-8333-333333333333",
    ListTableID: ["a7c94545-534d-400e-a21e-3e4ac824323c"],
    OrderDetails: [{
      Id: "44444444-4444-4444-8444-444444444444",
      ItemId: "e9e75a8d-cb9d-442b-8f57-08c06421f56f",
      Quantity: 2,
      Price: 33000,
    }],
  }, "A-1", null, fetcher);

  assert.equal(calls.length, 5);
  assert.equal(updateBody.Amount, 66000);
  assert.equal(updateBody.TotalAmount, 66000);
  assert.equal(updateBody.ListInventoryItemTemp.length, 1);
  assert.equal(updateBody.ListInventoryItemTemp[0].ListInventoryItem[0].BuyQuantity, 2);
  assert.equal(result.Id, "22222222-2222-4222-8222-222222222222");
  assert.equal(result.action, "self-order-confirmed");
});

test("maps selected CUKCUK additions into the native cart item", async () => {
  let updateBody = null;
  const fetcher = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/order-online/Config/GetConfig")) return response({ Success: true, Data: { Token: "token", CompanyCode: "dabang" } });
    if (url.includes("GetOrderByTableID")) return response({ Success: true, Data: {
      OrderId: "11111111-1111-4111-8111-111111111111",
      TableRef: JSON.stringify({ AreaID: "99f7a22b-b478-4f06-b1b4-3694d87840ba" }),
      ListInventoryItemTemp: [],
    } });
    if (url.includes("GetInventoryItemDetailByID")) return response({ Success: true, Data: {
      InventoryItemID: "d301f64f-16fa-4c8f-86bb-62318205039a",
      UnitPriceDelivery: 100000,
      InventoryItemAdditionsCategory: [{ InventoryItemAdditions: [
        { InventoryItemAdditionID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", UnitPrice: 0, BuyQuantity: 0 },
        { InventoryItemAdditionID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", UnitPrice: 10000, BuyQuantity: 0 },
      ] }],
    } });
    if (url.includes("/update-cart")) {
      updateBody = JSON.parse(init.body);
      return response({ Success: true, Data: {} });
    }
    if (url.includes("/confirm-order")) return response({ Success: true, Data: {} });
    assert.fail(`Unexpected URL: ${url}`);
  };

  await submitCukCukSelfOrder(env, {
    Id: "33333333-3333-4333-8333-333333333333",
    ListTableID: ["a7c94545-534d-400e-a21e-3e4ac824323c"],
    OrderDetails: [
      { Id: "44444444-4444-4444-8444-444444444444", ItemId: "d301f64f-16fa-4c8f-86bb-62318205039a", Quantity: 1, Price: 100000 },
      { Id: "55555555-5555-4555-8555-555555555555", ParentId: "44444444-4444-4444-8444-444444444444", AdditionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", Quantity: 1, Price: 10000 },
    ],
  }, "A-1", null, fetcher);

  const item = updateBody.ListInventoryItemTemp[0].ListInventoryItem[0];
  assert.equal(item.InventoryItemAdditionsCategory[0].InventoryItemAdditions[0].BuyQuantity, 0);
  assert.equal(item.InventoryItemAdditionsCategory[0].InventoryItemAdditions[1].BuyQuantity, 1);
  assert.equal(item.InventoryItemAdditionsCategory[0].InventoryItemAdditions[1].Selected, true);
  assert.equal(item.UnitPriceAddtion, 110000);
});

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
