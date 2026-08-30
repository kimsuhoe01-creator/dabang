import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(projectRoot, 'tablet-preview.html'), 'utf8');

function sourceSlice(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing source marker: ${start}`);
  assert.notEqual(to, -1, `missing source marker: ${end}`);
  return html.slice(from, to);
}

test('staff setup controls stay Vietnamese while the customer language prompt stays unchanged', () => {
  assert.match(html, /id="installAppButton"[^>]*>Cài đặt ứng dụng<\/button>/);
  assert.match(html, /id="tableTitle">Vui lòng chọn bàn<\/h1>/);
  assert.match(html, /id="tableSubtitle">Nhân viên chọn bàn trước, sau đó đưa máy tính bảng cho khách\.<\/p>/);
  assert.match(html, /class="back-button"[^>]*>← Đổi bàn<\/button>/);
  assert.match(html, /id="resetText">Chọn lại bàn<\/span>/);
  assert.match(html, /id="tableCaption">Bàn hiện tại<\/span>/);
  assert.match(html, /id="orderReady">Sẵn sàng đặt món<\/span>/);
  assert.match(html, /Đã có phiên bản mới\. Vui lòng cập nhật sau khi hoàn tất đơn hàng\./);
  assert.match(html, />Cập nhật ngay<\/button>/);

  const languageStep = sourceSlice('<section class="start-step hidden" id="languageStep">', '</section>');
  assert.match(languageStep, /<h1>언어를 선택해 주세요<\/h1>/);
  assert.match(languageStep, /Please select your language · Vui lòng chọn ngôn ngữ · 请选择语言/);

  const languageFlow = sourceSlice('function showLanguageStep()', 'function normalizeTables');
  assert.match(languageFlow, /Khách vui lòng chọn ngôn ngữ\./);
  assert.match(languageFlow, /Nhân viên vui lòng chọn bàn\./);

  const tableLoader = sourceSlice('async function loadCukcukTables()', 'async function fetchTabletJson');
  assert.match(tableLoader, /const copy=startCopy\.vi/);
  assert.match(tableLoader, /Vui lòng chạy đồng bộ CUKCUK trước\./);
  assert.match(tableLoader, /\$\{group\.tables\.length\} bàn/);
  assert.match(tableLoader, /staffAreaName\(group\.name\)/);
  assert.doesNotMatch(tableLoader, /startCopy\.ko|개 테이블|자동 동기화를 먼저 실행/);

  assert.match(html, /function staffAreaName\(name\)\{return name==='배달'\?'Giao hàng':name==='기타'\?'Khác':name\}/);

  const renderSource = sourceSlice('function render({preserveScroll=true}={})', 'function setLang');
  assert.match(renderSource, /resetText'\)\.textContent=STAFF_COPY\.reset/);
  assert.match(renderSource, /tableCaption'\)\.textContent=STAFF_COPY\.table/);
  assert.match(renderSource, /orderReady'\)\.textContent=STAFF_COPY\.ready/);
  assert.doesNotMatch(renderSource, /words\[lang\]\.reset|words\[lang\]\.table|words\[lang\]\.orderReady/);

  const resetSource = sourceSlice('function restartForNextGuest(force=false)', 'document.addEventListener');
  assert.match(resetSource, /window\.confirm\(STAFF_COPY\.resetConfirm\)/);
  assert.doesNotMatch(resetSource, /words\[lang\]\.resetConfirm/);
});

function decodeRgbaPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buffer.subarray(0, 8).equals(signature), true, 'invalid PNG signature');

  let offset = 8;
  let width;
  let height;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'logo must use 8-bit PNG channels');
      assert.equal(data[9], 6, 'logo must be a true RGBA PNG');
      assert.equal(data[12], 0, 'interlaced PNGs are not supported by this test');
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
    if (type === 'IEND') break;
  }

  assert.ok(width && height && idat.length, 'PNG image data is incomplete');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let inputOffset = 0;

  const paeth = (left, up, upLeft) => {
    const estimate = left + up - upLeft;
    const leftDistance = Math.abs(estimate - left);
    const upDistance = Math.abs(estimate - up);
    const diagonalDistance = Math.abs(estimate - upLeft);
    return leftDistance <= upDistance && leftDistance <= diagonalDistance ? left : upDistance <= diagonalDistance ? up : upLeft;
  };

  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset];
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const encoded = raw[inputOffset + x];
      const outputOffset = y * stride + x;
      const left = x >= bytesPerPixel ? pixels[outputOffset - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[outputOffset - stride] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[outputOffset - stride - bytesPerPixel] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upLeft)
                : assert.fail(`unsupported PNG filter: ${filter}`);
      pixels[outputOffset] = (encoded + predictor) & 255;
    }
    inputOffset += stride;
  }

  return { width, height, pixels };
}

test('the transparent DABANG wordmark is used above TABLE ORDER and in the menu rail', () => {
  const logoPath = 'assets/brand/dabang-logo-transparent.png';
  const brand = sourceSlice('<aside class="start-brand">', '</aside>');
  assert.match(brand, new RegExp(`<img class="start-brand-logo" src="${logoPath.replaceAll('.', '\\.') }"`));
  assert.ok(brand.indexOf('start-brand-logo') < brand.indexOf('start-brand-title'), 'logo must appear above TABLE ORDER');
  assert.match(html, new RegExp(`<img class="rail-logo" src="${logoPath.replaceAll('.', '\\.') }"`));

  const { width, height, pixels } = decodeRgbaPng(fs.readFileSync(path.join(projectRoot, logoPath)));
  const alphaAt = (x, y) => pixels[y * width * 4 + x * 4 + 3];
  assert.deepEqual([
    alphaAt(0, 0),
    alphaAt(width - 1, 0),
    alphaAt(0, height - 1),
    alphaAt(width - 1, height - 1)
  ], [0, 0, 0, 0]);

  let transparent = 0;
  let visible = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] === 0) transparent += 1;
    if (pixels[i] > 0) visible += 1;
  }
  assert.ok(transparent > width * height * 0.05, 'logo needs a genuinely transparent background');
  assert.ok(visible > 0, 'logo artwork must remain visible');
});
