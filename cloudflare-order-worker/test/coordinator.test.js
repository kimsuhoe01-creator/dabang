import assert from "node:assert/strict";
import test from "node:test";
import { submitTableOrder } from "../src/index.js";

function memoryStorage() {
  const values = new Map();
  return {
    async get(key) { return values.get(key); },
    async put(keyOrEntries, value) {
      if (typeof keyOrEntries === "string") values.set(keyOrEntries, value);
      else for (const [key, entry] of Object.entries(keyOrEntries)) values.set(key, entry);
    },
    async delete(key) { values.delete(key); },
    values,
  };
}

function order(id = "client-order-1") {
  return { Id: id, ListTableID: ["table-1"], OrderDetails: [{ ItemId: "menu-1", Quantity: 1 }] };
}

test("reuses a completed result for the same client order id without a second CUKCUK call", async () => {
  const storage = memoryStorage();
  let calls = 0;
  const submitter = async () => {
    calls += 1;
    return { Id: "cukcuk-order-1", No: "1.50", Status: 1, action: "created" };
  };

  const first = await submitTableOrder(storage, {}, order(), "A-01", "same-cart", submitter);
  const retry = await submitTableOrder(storage, {}, order(), "A-01", "same-cart", submitter);

  assert.equal(calls, 1);
  assert.equal(first.Id, "cukcuk-order-1");
  assert.equal(retry.Id, "cukcuk-order-1");
  assert.equal(retry.deduplicated, true);
});

test("rejects reuse of a client order id for different cart contents", async () => {
  const storage = memoryStorage();
  await submitTableOrder(storage, {}, order(), "A-01", "cart-a", async () => ({ Id: "cukcuk-order-1", Status: 1 }));

  await assert.rejects(
    submitTableOrder(storage, {}, order(), "A-01", "cart-b", async () => assert.fail("must not call CUKCUK")),
    (error) => error.code === "ORDER_ID_CONFLICT" && error.status === 409,
  );
});

test("does not resubmit an order whose external result is unknown", async () => {
  const storage = memoryStorage();
  let calls = 0;
  const ambiguousFailure = Object.assign(new Error("response lost"), { status: 502, code: "CUKCUK_HTTP_ERROR" });

  await assert.rejects(
    submitTableOrder(storage, {}, order(), "A-01", "same-cart", async () => { calls += 1; throw ambiguousFailure; }),
    /response lost/,
  );
  await assert.rejects(
    submitTableOrder(storage, {}, order(), "A-01", "same-cart", async () => { calls += 1; }),
    (error) => error.code === "ORDER_OUTCOME_UNKNOWN" && error.status === 409,
  );
  assert.equal(calls, 1);
});

test("clears a definitely rejected submission so the same request may be retried", async () => {
  const storage = memoryStorage();
  const rejected = Object.assign(new Error("payment requested"), { status: 409, code: "PAYMENT_REQUESTED" });
  await assert.rejects(
    submitTableOrder(storage, {}, order(), "A-01", "same-cart", async () => { throw rejected; }),
    /payment requested/,
  );

  const retry = await submitTableOrder(storage, {}, order(), "A-01", "same-cart", async () => ({ Id: "cukcuk-order-2", Status: 1 }));
  assert.equal(retry.Id, "cukcuk-order-2");
});
