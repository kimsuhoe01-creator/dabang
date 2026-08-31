import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = fs.readFileSync(path.join(root, "tablet-preview.html"), "utf8");
const source = fs.readFileSync(path.join(root, "assets", "voice-order.js"), "utf8");
const css = fs.readFileSync(path.join(root, "assets", "voice-order.css"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

test("voice ordering stays in the header while the customer browses the menu", () => {
  assert.match(html, /class="voice-order-button"[^>]*onclick="openVoiceOrder\(this\)"/);
  assert.match(html, /id="voiceGuide"[^>]*>직원에게 말하듯 메뉴판을 보면서 편하게 말씀해 주세요/);
  assert.match(html, /id="voiceFinishButton"[^>]*onclick="finishVoiceListening\(\)"[^>]*hidden/);
  assert.doesNotMatch(html, /id="voiceModal"/);
  assert.match(source, /listening:"듣는 중 · 취소"/);
  assert.match(source, /finish:"음성 주문 보내기"/);
});

test("AI draft opens the existing cart for one final customer confirmation", () => {
  assert.match(source, /window\.voiceCartReviewActive=true;resetVoiceHeader\(\);showCartSummary/);
  assert.match(source, /cartSend:"맞아요 · 주문 전송"/);
  assert.match(html, /onclick="handleCartSecondary\(\)"/);
  assert.match(html, /onclick="submitOrder\(\)"/);
  assert.doesNotMatch(source, /await submitOrder\(\)/);
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
  assert.match(worker, /dabang-tablet-v30/);
  assert.match(worker, /voice-order\.js\?v=20260831-v5/);
  assert.match(worker, /voice-order\.css\?v=20260831-v5/);
});

test("clarification retries keep prior voice context and make the AI question prominent", () => {
  assert.match(source, /context:voice\.followUpContext/);
  assert.match(source, /voice\.followUpContext=result\.followUpContext/);
  assert.match(source, /setPhase\("clarify"/);
  assert.match(source, /continueAnswer:"답변 이어 말하기"/);
  assert.match(css, /\.voice-inline-guide\.is-clarification/);
  assert.match(css, /font-size:16px/);
  assert.doesNotMatch(css, /@media\(max-width:1040px\)\{\.voice-inline-guide\{display:none/);
  assert.match(html, /id="voiceGuide" role="status" aria-live="polite"/);
});
