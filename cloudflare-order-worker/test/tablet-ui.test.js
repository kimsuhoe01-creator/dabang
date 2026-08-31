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

test('store tablet cards use a compact four-column layout without empty subtitle spacers', () => {
  assert.match(html, /@media\(min-width:1180px\) and \(max-height:900px\)/);
  assert.match(html, /\.grid\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\);gap:12px;align-items:start\}/);
  assert.match(html, /\.visual,\.sold\{aspect-ratio:3\/2\}/);
  assert.match(html, /\.info\{flex:none;min-height:0;padding:9px 11px 10px\}/);
  assert.match(html, /\.menu-subtitle\{min-height:0;margin:0 0 6px;font-size:12px;line-height:1\.35;-webkit-line-clamp:2\}/);
  assert.match(html, /\.foot\{margin-top:5px\}/);

  const cardMarkup = sourceSlice('function menuCardMarkup(menu,index)', 'function menuSections');
  assert.match(cardMarkup, /subtitleMarkup=subtitle\?.+?:'';/s);
  assert.doesNotMatch(cardMarkup, /menu-subtitle" aria-hidden="true"/);
});

test('preview orders are unmistakably marked as not sent to the POS', () => {
  assert.match(html, /id="previewModeBadge"[^>]*hidden>미리보기 · POS 전송 안 됨<\/div>/);
  assert.match(html, /const PREVIEW_MODE=PAGE_PARAMS\.get\('preview'\)==='1'/);
  assert.match(html, /previewBadge:'미리보기 · POS 전송 안 됨'/);
  assert.match(html, /previewNote:'미리보기입니다\. 이 주문은 POS와 주방으로 전송되지 않습니다\.'/);
  assert.match(html, /previewTitle:'미리보기 완료'/);
  assert.match(html, /previewOrder:'이 주문은 POS와 주방으로 전송되지 않았습니다\.'/);

  const cartSource = sourceSlice('function renderCartItems()', 'function changeCartQuantity');
  assert.match(cartSource, /PREVIEW_MODE\?words\[lang\]\.previewSend:words\[lang\]\.sendOrder/);
  assert.match(cartSource, /PREVIEW_MODE\?words\[lang\]\.previewNote:\(voiceCopy\?\.note\|\|words\[lang\]\.orderNote\)/);

  const submitSource = sourceSlice('async function submitOrder()', 'function showOrderSuccess');
  assert.match(submitSource, /if\(PREVIEW_MODE\).*else\{.*const response=await fetch\(ORDER_ENDPOINT/s);
  assert.match(submitSource, /showOrderSuccess\(payload,receipt,PREVIEW_MODE\)/);

  const successSource = sourceSlice('function showOrderSuccess', 'function finishOrder');
  assert.match(successSource, /preview\?words\[lang\]\.previewTitle:words\[lang\]\.orderSuccess/);
  assert.match(successSource, /preview\?words\[lang\]\.previewOrder:words\[lang\]\.orderSuccessMessage/);
});

test('live success copy distinguishes POS registration from manual kitchen dispatch', () => {
  assert.match(html, /orderSuccess:'POS에 주문이 등록됐습니다'/);
  assert.match(html, /orderSuccessMessage:'직원이 CUKCUK에서 주문을 확인한 뒤 주방·바로 전송해야 영수증이 출력됩니다\.'/);
  assert.match(html, /orderSuccess:'Đơn đã được ghi nhận trên POS'/);
  assert.match(html, /orderSuccessMessage:'Nhân viên phải xác nhận đơn trên CUKCUK rồi gửi đến bếp\/quầy bar thì phiếu mới được in\.'/);
  assert.doesNotMatch(html, /orderSuccessMessage:'주방에서 주문을 확인하고 있습니다\.'/);
  assert.doesNotMatch(html, /orderSuccessMessage:'Bếp đang kiểm tra đơn của bạn\.'/);
});

test('live orders ignore editor drafts and wait for the published catalog', () => {
  const stateSource = sourceSlice("const SUPPORTED_LANGS=new Set", 'const words=');
  assert.match(stateSource, /const PREVIEW_MODE=PAGE_PARAMS\.get\('preview'\)==='1'/);
  assert.match(stateSource, /let storedState=null;if\(PREVIEW_MODE\)\{try\{storedState=JSON\.parse\(localStorage\.getItem\('dabangTabletPreview'\)\)/);

  const selectionSource = sourceSlice('function selectMenu(id,opener)', 'function addItem');
  assert.match(selectionSource, /!PREVIEW_MODE&&!catalogReady/);
  assert.match(selectionSource, /catalogLoadFailed\?words\[lang\]\.menuLoadFailed:words\[lang\]\.menuLoading/);

  const loaderSource = sourceSlice('async function loadPublishedMenu()', 'function restartForNextGuest');
  assert.match(loaderSource, /catalogReady=true;catalogLoadFailed=false/);
  assert.match(loaderSource, /catalogReady=PREVIEW_MODE;catalogLoadFailed=true/);
});

test('live submission has bounded waiting, actionable errors, and a stable retry id', () => {
  const submitSource = sourceSlice('function orderPayload()', 'function showOrderSuccess');
  assert.match(submitSource, /if\(pendingOrderPayload\)return pendingOrderPayload/);
  assert.match(submitSource, /typeof crypto!=='undefined'&&typeof crypto\.randomUUID==='function'/);
  assert.match(submitSource, /catalogRevision:String\(state\.catalogRevision\|\|''\)/);
  assert.match(submitSource, /transport:\(new URL\(location\.href\)\.searchParams\.get\('transport'\)==='graph'\?'graph':'cukcuk-self-order'\)/);
  assert.match(submitSource, /headers:\{'Content-Type':'application\/json'\}/);
  assert.match(submitSource, /new AbortController\(\)/);
  assert.match(submitSource, /setTimeout\(\(\)=>controller\.abort\(\),20000\)/);
  assert.match(submitSource, /result\.message/);
  assert.match(submitSource, /ORDER_IN_PROGRESS','ORDER_OUTCOME_UNKNOWN/);
  assert.match(submitSource, /orderVerificationRequired=error\?\.definite!==true/);
  assert.match(submitSource, /setOrderNotice\(message,orderVerificationRequired\?'uncertain':'error'\)/);
  assert.match(submitSource, /try\{\s*payload=orderPayload\(\)/);
  assert.match(submitSource, /finally\{if\(timeoutId\)clearTimeout\(timeoutId\);setOrderSending\(false\)\}/);
  assert.match(html, /orderUncertain:'Chưa xác nhận được kết quả gửi\. Không bấm lại; hãy kiểm tra đơn trên POS\.'/);
});

test('Sapporo draft sizes use independent quantity counters and cart lines', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data', 'cukcuk-menu.json'), 'utf8'));
  const menu = catalog.menus.find(item => item.cukcukCode === '(A02) Bia tuoi Sapporo');
  assert.ok(menu, 'missing A02 Sapporo draft menu');
  const templateId = menu.optionTemplateIds[0];
  assert.deepEqual(menu.optionRules[templateId], {
    required: true,
    minSelections: 1,
    maxSelections: 3,
    selectionMode: 'quantity-per-value-lines',
    maxQuantityPerValue: 99
  });

  const optionSource = sourceSlice('function quantitySelectionMode', 'function closeOptionModal');
  assert.match(optionSource, /selectionMode==='quantity-per-value-lines'/);
  assert.match(optionSource, /data-option-quantity-action="-1"/);
  assert.match(optionSource, /data-option-quantity-action="1"/);
  assert.match(optionSource, /additionalPrice\*\(row\.quantityMode\?row\.quantity:1\)/);
  assert.match(optionSource, /quantityTotal\.replace\('\{n\}',groupTotalQuantity\(group,index\)\)/);

  const confirmSource = sourceSlice('function confirmOptions()', 'function selectMenu');
  assert.match(confirmSource, /quantityConfiguredLines\(selections\)\.forEach\(line=>addConfiguredItem\(menu,line\.selections,line\.quantity,false,false\)\)/);
  assert.match(confirmSource, /animateMenuToCart\(menu\.id\)/);

  const mapperSource = sourceSlice('function quantityConfiguredLines', 'function optionLimits');
  const quantityConfiguredLines = new Function(`${mapperSource};return quantityConfiguredLines`)();
  assert.deepEqual(quantityConfiguredLines([
    { templateId, valueId: '330', additionalPrice: 77000, quantity: 2, quantityMode: true },
    { templateId, valueId: '640', additionalPrice: 165000, quantity: 1, quantityMode: true }
  ]), [
    { selections: [{ templateId, valueId: '330', additionalPrice: 77000 }], quantity: 2 },
    { selections: [{ templateId, valueId: '640', additionalPrice: 165000 }], quantity: 1 }
  ]);

  const cartSource = sourceSlice('function cartKey', 'function recalculateCart');
  assert.match(cartSource, /key=cartKey\(menu,selections\)/);
  assert.match(cartSource, /existing\.quantity=Math\.min\(99,existing\.quantity\+addQuantity\)/);
  assert.match(cartSource, /quantity:addQuantity/);
});

test('cart offers explicit line removal, full clearing, and add-to-cart guidance animation', () => {
  assert.match(html, /id="clearCartButton"[^>]*onclick="clearCartItems\(\)"[^>]*>장바구니 비우기<\/button>/);
  assert.match(html, /removeItem:'비우기',clearCart:'장바구니 비우기'/);
  assert.match(html, /class="remove-cart-line"[^>]*onclick="removeCartLine\(\$\{line\.lineId\}\)"/);
  assert.match(html, /function removeCartLine\(lineId\)/);
  assert.match(html, /function clearCartItems\(\)/);
  assert.match(html, /window\.confirm\(words\[lang\]\.clearCartConfirm\)/);
  assert.match(html, /function animateMenuToCart\(menuId\)/);
  assert.match(html, /className='cart-fly-item'/);
  assert.match(html, /function pulseCart\(\)/);
  assert.match(html, /\.cart\.cart-nudge\{animation:cartNudge/);
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
