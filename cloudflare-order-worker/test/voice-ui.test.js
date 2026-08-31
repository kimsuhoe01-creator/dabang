import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = fs.readFileSync(path.join(root, "tablet-preview.html"), "utf8");
const source = fs.readFileSync(path.join(root, "assets", "voice-order.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

test("tablet exposes a dedicated voice order review that sends directly after confirmation", () => {
  assert.match(html, /class="voice-order-button"[^>]*onclick="openVoiceOrder\(this\)"/);
  assert.match(html, /id="voiceModal"/);
  assert.match(html, /id="voicePrimaryText">듣기 시작<\/span>/);
  assert.match(source, /send:"맞아요 · 주문 전송"/);
  assert.match(source, /function sendVoiceOrder\(\)/);
  assert.match(source, /deactivateDialogLayer\(voiceModal\(\),false\);await submitOrder\(\)/);
  assert.doesNotMatch(source, /showCartSummary\([^)]*\);\s*await submitOrder/);
});

test("voice capture streams through WebRTC and commits only when the customer finishes", () => {
  assert.match(source, /new RTCPeerConnection\(\)/);
  assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(source, /\/api\/voice\/realtime/);
  assert.match(source, /input_audio_buffer\.commit/);
  assert.match(source, /conversation\.item\.input_audio_transcription\.completed/);
  assert.match(source, /const MAX_SECONDS = 90/);
  assert.match(source, /fetchWithTimeout\(`\$\{API_BASE\}\/api\/voice\/interpret[\s\S]*,8000\)/);
  assert.match(source, /failed to fetch\|networkerror\|load failed/i);
  assert.match(source, /timeout:"주문 정리가 오래 걸리고 있습니다/);
});

test("voice assets are versioned in the offline tablet shell", () => {
  assert.match(worker, /dabang-tablet-v27/);
  assert.match(worker, /voice-order\.js\?v=20260831-v2/);
  assert.match(worker, /voice-order\.css\?v=20260831-v2/);
});
