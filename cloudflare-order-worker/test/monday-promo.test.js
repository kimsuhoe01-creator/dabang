import assert from "node:assert/strict";
import test from "node:test";
import { validateAndBuildOrder } from "../src/order.js";
import {
  MONDAY_POCHA_MENU_ID,
  mondayPochaActiveAt,
  mondayPochaDisplayPrice,
} from "../src/monday-promo.js";

const menu = {
  id: MONDAY_POCHA_MENU_ID,
  cukcukId: MONDAY_POCHA_MENU_ID,
  sourceName: "한신포차세트",
  price: 540000,
  available: true,
  optionTemplateIds: [],
};
const catalog = { synced: true, menus: [menu], optionTemplates: [] };
const monday = new Date("2026-11-16T16:00:00+07:00");

test("Monday promotion uses Vietnam time from opening until 23:00", () => {
  assert.equal(mondayPochaActiveAt(new Date("2026-11-16T15:59:59+07:00")), false);
  assert.equal(mondayPochaActiveAt(monday), true);
  assert.equal(mondayPochaActiveAt(new Date("2026-11-16T22:59:59+07:00")), true);
  assert.equal(mondayPochaActiveAt(new Date("2026-11-16T23:00:00+07:00")), false);
  assert.equal(mondayPochaActiveAt(new Date("2026-11-17T16:00:00+07:00")), false);
  assert.equal(mondayPochaDisplayPrice(menu, monday), 378000);
  assert.equal(mondayPochaDisplayPrice(menu, new Date("2026-11-17T16:00:00+07:00")), 540000);
});

test("tablet Monday price is checked while CUKCUK order keeps its original item price", () => {
  const payload = basePrice => ({
    clientOrderId: "monday-pocha-test",
    table: { id: "table-1", name: "A-1" },
    items: [{ menuId: MONDAY_POCHA_MENU_ID, quantity: 1, basePrice, options: [] }],
  });
  const order = validateAndBuildOrder(payload(378000), catalog, "branch-1", monday);
  assert.equal(order.OrderDetails[0].ItemId, MONDAY_POCHA_MENU_ID);
  assert.equal(order.OrderDetails[0].Price, 540000);
  assert.throws(() => validateAndBuildOrder(payload(378000), catalog, "branch-1", new Date("2026-11-16T23:00:00+07:00")), { code: "PROMO_PRICE_CHANGED" });
  assert.throws(() => validateAndBuildOrder(payload(540000), catalog, "branch-1", monday), { code: "PROMO_PRICE_CHANGED" });
});
