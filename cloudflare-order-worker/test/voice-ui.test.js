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
  assert.match(source, /listening:"듣기 취소"/);
  assert.match(source, /finish:"말하기 완료"/);
  assert.match(css, /voice-inline-guide:not\(\.is-clarification\):not\(\.is-error\):after\{content:"  →"/);
  assert.match(css, /voice-finish-button\{[^}]*background:#ffd51f/);
  assert.match(css, /voice-order-button\.is-listening \.voice-order-icon\{[^}]*animation:none/);
  assert.match(css, /voice-finish-button\{order:2\}/);
});

test("AI draft opens the existing cart for one final customer confirmation", () => {
  assert.match(source, /window\.voiceCartReviewActive=true/);
  assert.match(source, /resetVoiceHeader\(\);showCartSummary\(opener\)/);
  assert.match(source, /cartSend:"이대로 주문하기"/);
  assert.match(html, /onclick="handleCartSecondary\(\)"/);
  assert.match(html, /onclick="submitOrder\(\)"/);
  assert.doesNotMatch(source, /await submitOrder\(\)/);
});

test("voice capture keeps one conversational WebRTC session until the order is confirmed", () => {
  assert.match(source, /new RTCPeerConnection\(\)/);
  assert.match(source, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(source, /\/api\/voice\/realtime/);
  assert.match(source, /X-Dabang-Language/);
  assert.match(source, /remoteAudio\.autoplay=true/);
  assert.match(source, /input_audio_buffer\.commit/);
  assert.match(source, /response\.create/);
  assert.match(source, /response\.done/);
  assert.match(source, /function_call[^\n]+prepare_order_review/);
  assert.match(source, /function_call[^\n]+list_published_menu/);
  assert.match(source, /exactMenuNames/);
  assert.match(source, /Copy only these exact menu names verbatim/);
  assert.match(source, /lookup:"실제 판매 메뉴를 확인하고 있습니다…"/);
  assert.match(source, /setPhase\("processing",t\(\)\.lookup\)/);
  assert.match(source, /status:"completed"/);
  assert.match(source, /function_call_output/);
  assert.match(source, /input_audio_buffer\.clear/);
  assert.match(source, /response\.cancel/);
  assert.match(source, /output_audio_buffer\.clear/);
  assert.match(source, /const MAX_SECONDS = 90/);
  assert.match(source, /fetchWithTimeout\(`\$\{API_BASE\}\/api\/voice\/interpret[\s\S]*,15000\)/);
  assert.match(source, /failed to fetch\|networkerror\|load failed/i);
  assert.match(source, /timeout:"AI 응답이 오래 걸리고 있습니다/);
});

test("voice assets are versioned in the offline tablet shell", () => {
  assert.match(worker, /dabang-tablet-v37/);
  assert.match(worker, /voice-order\.js\?v=20260831-v12/);
  assert.match(worker, /voice-order\.css\?v=20260831-v12/);
});

test("clarification retries keep prior voice context and make the AI question prominent", () => {
  assert.match(source, /voice\.followUpContext=result\.followUpContext/);
  assert.match(source, /setPhase\("clarify"/);
  assert.match(source, /continueAnswer:"답변 이어 말하기"/);
  assert.match(css, /\.voice-inline-guide\.is-clarification/);
  assert.match(css, /font-size:16px/);
  assert.doesNotMatch(css, /@media\(max-width:1040px\)\{\.voice-inline-guide\{display:none/);
  assert.match(html, /id="voiceGuide" role="status" aria-live="polite"/);
  assert.match(source, /window\.voiceOrderPhase=phase/);
  assert.match(html, /!\['connecting','listening','processing','responding','clarify'\]\.includes\(window\.voiceOrderPhase\)/);
  assert.match(source, /const keepQuestion=Boolean\(voice\.clarificationMessage\)/);
  assert.match(source, /guide\.textContent=keepQuestion\?voice\.clarificationMessage:c\.listeningGuide/);
  assert.match(source, /phase==="connecting"[\s\S]*if\(keepQuestion\)\{guide\.hidden=false;guide\.textContent=voice\.clarificationMessage/);
});
