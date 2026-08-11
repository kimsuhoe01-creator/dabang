import assert from "node:assert/strict";
import test from "node:test";
import { expandMenuImage } from "../src/image-edit.js";

test("requires an OpenAI API key before accepting an image", async () => {
  let called = false;
  const response = await expandMenuImage(
    new Request("https://worker.example/api/admin/image-expand", { method: "POST", body: validForm() }),
    {},
    async () => { called = true; },
  );

  assert.equal(response.status, 401);
  assert.equal(called, false);
  assert.equal((await response.json()).code, "MISSING_OPENAI_KEY");
});

test("forwards the temporary key and square image edit request to OpenAI", async () => {
  let capturedUrl = "";
  let capturedInit = null;
  const fetcher = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return jsonResponse({ data: [{ b64_json: "aW1hZ2U=" }] });
  };
  const request = new Request("https://worker.example/api/admin/image-expand", {
    method: "POST",
    headers: { Authorization: "Bearer sk-test-secret-value-long-enough" },
    body: validForm(),
  });

  const response = await expandMenuImage(request, {}, fetcher);
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.image, "aW1hZ2U=");
  assert.equal(capturedUrl, "https://api.openai.com/v1/images/edits");
  assert.equal(new Headers(capturedInit.headers).get("Authorization"), "Bearer sk-test-secret-value-long-enough");
  assert.equal(capturedInit.body.get("model"), "gpt-image-2");
  assert.equal(capturedInit.body.get("size"), "1024x1024");
  assert.equal(capturedInit.body.get("output_format"), "jpeg");
  assert.ok(capturedInit.body.get("image[]") instanceof Blob);
  assert.ok(capturedInit.body.get("mask") instanceof Blob);
  assert.match(capturedInit.body.get("prompt"), /Preserve the original/);
});

test("does not echo an invalid OpenAI key in an error response", async () => {
  const secret = "sk-never-echo-this-secret-value";
  const request = new Request("https://worker.example/api/admin/image-expand", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    body: validForm(),
  });
  const response = await expandMenuImage(request, {}, async () => jsonResponse({ error: { message: `bad key ${secret}` } }, 401));
  const text = await response.text();

  assert.equal(response.status, 401);
  assert.doesNotMatch(text, new RegExp(secret));
  assert.match(text, /INVALID_OPENAI_KEY/);
});

function validForm() {
  const form = new FormData();
  form.append("image", new Blob(["image"], { type: "image/png" }), "menu-input.png");
  form.append("mask", new Blob(["mask"], { type: "image/png" }), "menu-mask.png");
  form.append("menuName", "허니 윙봉");
  return form;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
