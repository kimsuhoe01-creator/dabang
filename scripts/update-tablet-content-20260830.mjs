import crypto from 'node:crypto';
import fs from 'node:fs';

const layoutPath = process.argv[2] || 'data/cukcuk-table-qr-layout.json';
const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));

const names = {
  ...(layout.menuNameOverrides || {}),
  HCX: {
    ko: '돈까스 플레이트 (안 매운맛)',
    vi: 'Đĩa tonkatsu (không cay)',
    zh: '炸猪排拼盘（不辣）',
    en: 'Tonkatsu Plate (Non-spicy)'
  },
  '(S03) Gà k xương + Tok': {
    ko: '치킨 떡볶이 세트',
    vi: 'Combo gà không xương & tokbokki',
    zh: '无骨炸鸡辣炒年糕套餐',
    en: 'Chicken Tteokbokki Set'
  },
  '(S04) Gà nguyên con + Tok': {
    ko: '통닭 떡볶이 세트',
    vi: 'Combo gà nguyên con & tokbokki',
    zh: '整只炸鸡辣炒年糕套餐',
    en: 'Whole Chicken Tteokbokki Set'
  },
  '(S05) Cánh gà + Tok': {
    ko: '윙봉 떡볶이 세트',
    vi: 'Combo cánh gà & tokbokki',
    zh: '鸡翅辣炒年糕套餐',
    en: 'Wing Tteokbokki Set'
  },
  '(S06) Gà k xương 5 vị': {
    ko: '순살 떠까 (5가지 맛)',
    vi: 'Gà không xương 5 vị',
    zh: '五味无骨炸鸡拼盘',
    en: 'Five-flavor Boneless Chicken Platter'
  },
  '(S08) Cánh gà 4 vị': {
    ko: '윙봉 떠까 (4가지 맛)',
    vi: 'Cánh gà 4 vị',
    zh: '四味鸡翅拼盘',
    en: 'Four-flavor Wing Platter'
  },
  '(W06) Nửa con gà': {
    ko: '윙봉 반마리',
    vi: 'Nửa phần cánh gà chiên',
    zh: '半份炸鸡翅',
    en: 'Half Portion of Fried Wings'
  },
  '수량확인13': {
    ko: '코카콜라 (390ml)',
    vi: 'Coca-Cola (390ml)',
    zh: '可口可乐（390ml）',
    en: 'Coca-Cola (390ml)'
  },
  '수량확인14': {
    ko: '펩시 제로 (390ml)',
    vi: 'Pepsi Không Calo (390ml)',
    zh: '百事无糖（390ml）',
    en: 'Pepsi Zero (390ml)'
  },
  'ᄂᄌ NCZ5': {
    ko: '나랑드 제로 (500ml)',
    vi: 'Narangd Zero (500ml)',
    zh: 'Narangd 零糖（500ml）',
    en: 'Narangd Zero (500ml)'
  },
  '수량확인15': {
    ko: '펩시 제로 라임 (1.5L)',
    vi: 'Pepsi Không Calo Vị Chanh (1,5L)',
    zh: '百事无糖青柠味（1.5L）',
    en: 'Pepsi Zero Lime (1.5L)'
  },
  'ᄒᄉ1 BTHN1 河1 HDB1': {
    ko: '하노이 생맥주 KEG (1L)',
    vi: 'Bia Hơi Hà Nội KEG (1L)',
    zh: '河内鲜啤 KEG（1L）',
    en: 'Hanoi Draft Beer KEG (1L)'
  }
};

const subtitle = (ko, vi, zh, en, tone = 'default') => ({ names: { ko, vi, zh, en }, tone });
const subtitles = {
  ...(layout.menuSubtitleOverrides || {}),
  '(A01) Sapporo 1t1 640ml': subtitle(
    '해피아워 이벤트 · 매일 19:00까지 1+1',
    'Happy Hour · Mua 1 tặng 1 đến 19:00 mỗi ngày',
    '欢乐时光活动 · 每天19:00前买一送一',
    'Happy Hour · Buy 1, get 1 free until 19:00 daily',
    'danger'
  ),
  HCX: subtitle(
    '디진다 돈까스와 반반으로도 즐길 수 있어요.',
    'Có thể chọn nửa không cay, nửa “Dijinda” siêu cay.',
    '可选不辣与超辣“Dijinda”猪排各半。',
    'Half-and-half with the extra-spicy “Dijinda” tonkatsu is available.'
  ),
  'ᄃᄃᄎ TTTD': subtitle(
    '제한시간 안에 다 먹으면 무료!',
    'Ăn hết trong thời gian thử thách thì được miễn phí!',
    '在挑战规定时间内吃完即可免单！',
    'Finish it within the challenge time and it’s free!',
    'danger'
  ),
  'ᄃᄃ TD 地': subtitle(
    '진짜 매우 맵습니다. 재미로 가볍게 도전하지 마세요.',
    'Món này thực sự rất cay. Đừng thử chỉ vì tò mò hoặc cho vui.',
    '真的非常辣，请勿抱着玩笑心态轻易挑战。',
    'This is seriously spicy. Please don’t take the challenge lightly.',
    'danger'
  ),
  'ᄎ GNTC 炭 CSC': subtitle(
    '한국 훌*라 바비큐를 떠올리는 진한 숯불 맛.',
    'Đậm vị nướng than, gợi nhớ BBQ Hul*la Hàn Quốc.',
    '浓郁炭火风味，让人想起韩式 Hul*la 烧烤鸡。',
    'Rich charcoal flavor inspired by Korean Hul*la-style BBQ chicken.'
  ),
  '(T02) Gà nướng củi': subtitle(
    '화덕에서 1시간 동안 훈연해 촉촉하고 훈제향이 깊은 통닭.',
    'Hun và nướng trong lò suốt 1 giờ, thơm khói và mềm mọng.',
    '入炉熏烤一小时，烟熏香浓郁，肉质鲜嫩多汁。',
    'Smoked and oven-roasted for one hour for deep smoky flavor and juicy meat.'
  ),
  hot: subtitle(
    '생각보다 맵습니다. 주의하세요! B*C 치킨을 떠올리는 맛.',
    'Cay hơn bạn nghĩ—hãy cẩn thận! Gợi nhớ phong cách gà B*C Hàn Quốc.',
    '比想象中更辣，请注意！让人想起韩式 B*C 炸鸡。',
    'Hotter than you may expect—be careful! Inspired by Korean B*C-style chicken.',
    'warning'
  ),
  'ᄉ GPBPM 雪 SCPC': subtitle(
    '네*치킨을 떠올리는 달콤짭짤한 스노윙 맛.',
    'Vị phủ tuyết ngọt mặn, gợi nhớ gà Ne* Chicken.',
    '甜咸雪花风味，让人想起 Ne* Chicken。',
    'A sweet-and-savory snowing flavor inspired by Ne* Chicken.'
  ),
  'ᄆGMGC': subtitle(
    '푸*닭 마마치를 떠올리는 달콤고소한 맛.',
    'Vị ngọt béo gợi nhớ MaMaChi của Pu*Dak.',
    '香甜浓郁，让人想起 Pu*Dak 的 MaMaChi。',
    'A sweet, savory flavor inspired by Pu*Dak’s MaMaChi.'
  ),
  'ᄋ GCSCNKH 油': subtitle(
    '아직 많이 알려지진 않았지만, 이 집 사장의 1픽 메뉴.',
    'Chưa được nhiều khách biết đến, nhưng là món số 1 của chủ quán.',
    '虽然还不太为人熟知，却是店主的第一推荐。',
    'Still a hidden gem, but it’s the owner’s number-one pick.'
  ),
  'ᄆGRXCF': subtitle(
    '직접 만든 소스와 진한 불향이 어우러진 숨은 별미.',
    'Món ngon ẩn mình với sốt nhà làm và hương khói đậm đà.',
    '自制酱汁融合浓郁火香，是一道隐藏美味。',
    'A hidden gem with house-made sauce and a rich flame-grilled aroma.'
  ),
  'ᄎ CC KCC': subtitle(
    '실비김치가 들어갑니다. 정말 많이 매워요!',
    'Có kimchi Silbi siêu cay. Món này rất cay!',
    '内含超辣 Silbi 泡菜，真的很辣！',
    'Includes extra-spicy Silbi kimchi. It is very hot!',
    'danger'
  ),
  'ᄇ MTCSC ESCN 超': subtitle(
    '불냉면 양념으로 만들었습니다. 정말 많이 매워요!',
    'Làm với sốt mì lạnh cay. Món này rất cay!',
    '使用火辣冷面酱调制，真的很辣！',
    'Made with spicy cold-noodle sauce. It is very hot!',
    'danger'
  ),
  '(S03) Gà k xương + Tok': subtitle(
    '순살치킨 반 마리와 다방 떡볶이 세트. 2~3인용.',
    'Nửa phần gà không xương và tokbokki Dabang. Dành cho 2–3 người.',
    '半份无骨炸鸡搭配 Dabang 辣炒年糕，适合 2–3 人。',
    'Half boneless chicken with Dabang tteokbokki. Serves 2–3.'
  ),
  '(S04) Gà nguyên con + Tok': subtitle(
    '바삭하게 튀긴 옛날통닭 한 마리와 떡볶이 세트. 3~4인용.',
    'Một con gà chiên kiểu truyền thống và tokbokki. Dành cho 3–4 người.',
    '一整只酥脆怀旧炸鸡搭配辣炒年糕，适合 3–4 人。',
    'One crispy old-style whole chicken with tteokbokki. Serves 3–4.'
  ),
  '(S05) Cánh gà + Tok': subtitle(
    '원하는 윙봉 소스를 골라 즐기는 윙봉과 떡볶이 세트. 2~3인용.',
    'Cánh gà với sốt tự chọn và tokbokki. Dành cho 2–3 người.',
    '自选酱味鸡翅搭配辣炒年糕，适合 2–3 人。',
    'Wings with your choice of sauce and tteokbokki. Serves 2–3.'
  ),
  '(S06) Gà k xương 5 vị': subtitle(
    '다방치킨 순살 5가지 맛을 한 번에. 3~4인용.',
    'Thưởng thức cùng lúc 5 vị gà không xương Dabang. Dành cho 3–4 người.',
    '一次品尝五种 Dabang 无骨炸鸡口味，适合 3–4 人。',
    'Enjoy five Dabang boneless-chicken flavors at once. Serves 3–4.'
  ),
  '(S08) Cánh gà 4 vị': subtitle(
    '베트남 손님이 가장 좋아하는 다방 윙봉 4가지 맛을 한 번에. 맛 4개를 꼭 선택해 주세요.',
    'Thưởng thức cùng lúc 4 vị cánh gà Dabang được khách Việt yêu thích nhất. Vui lòng chọn đúng 4 vị.',
    '一次品尝越南客人最喜爱的四种 Dabang 鸡翅口味。请务必选择四种口味。',
    'Enjoy four of our Vietnamese guests’ favorite Dabang wing flavors at once. Please select exactly four flavors.'
  ),
  'ᄂᄌ NCZ5': subtitle(
    '제로 칼로리.',
    'Không calo.',
    '零卡路里。',
    'Zero calories.'
  )
};

const WING_TEMPLATE = '2be54a6c-ab0d-40d7-a080-0c50e0d228dc';
const CHICKEN_TEMPLATE = 'b2fbfcca-55f5-4718-87d4-96627091764a';
const BONE_TEMPLATE = '85cead19-7d83-4c61-8199-b7fab35fb672';
const TTEOK_SPICE_TEMPLATE = '21b53642-cba7-4ef9-b877-bab92f845c25';
const TTEOK_TOPPING_TEMPLATE = 'd7fcbd85-9fb6-40db-872a-8275dce401ed';
const PIZZA_CHOICE_TEMPLATE = '4a947b5f-0eb9-4c88-87b2-94debe05a41d';
const HCX_DETAIL_TEMPLATE = 'cukcuk-detail:d301f64f-16fa-4c8f-86bb-62318205039a:0';
const SAPPORO_DETAIL_TEMPLATE = 'cukcuk-detail:57b1fe70-fe33-4654-9d58-575f277749be:0';
const FRIED_DETAIL_TEMPLATE = 'cukcuk-detail:6a4fc8cd-4937-46f0-990c-536bdffb1de3:0';
const FOUR_WINGS_DETAIL_TEMPLATE = 'cukcuk-detail:88d856ff-e35d-4c21-893b-3f60e2fa71fa:0';
const HALF_WINGS_DETAIL_TEMPLATE = 'cukcuk-detail:2ce328a0-8d0c-481e-883f-2e35684b900d:0';
const EXTRA_TOPPINGS_DETAIL_TEMPLATE = 'cukcuk-detail:08b4aba2-4116-4148-b2a9-763c5d72d543:0';
const SAPPORO_SIZE_ORDER = [
  'dc46801f-c5c7-4b94-82f0-014b2c1aad69', // 330cc
  '38465a50-9825-4244-8887-bbc1fd87efbd', // 640cc
  '9b558fc3-68b9-4ec9-8d7c-307c338d4610'  // 3300cc
];

layout.detailOptionSources = {
  HCX: {
    expectedCategoryCount: 1,
    expectedValueCount: 2,
    templateNames: { ko: '돈까스 플레이트 선택', vi: 'Chọn đĩa tonkatsu', zh: '选择炸猪排拼盘', en: 'Choose Tonkatsu Plate' }
  },
  '(A02) Bia tuoi Sapporo': {
    expectedCategoryCount: 1,
    expectedValueCount: 3,
    templateNames: { ko: '사포로 생맥주 용량 선택', vi: 'Chọn dung tích bia tươi Sapporo', zh: '选择札幌生啤容量', en: 'Choose Sapporo Draft Size' }
  },
  '(T10) Do chien/mon chien': {
    expectedCategoryCount: 1,
    expectedValueCount: 10,
    templateNames: { ko: '튀김 선택', vi: 'Chọn món chiên', zh: '选择炸物', en: 'Choose Fried Items' }
  },
  '(S08) Cánh gà 4 vị': {
    expectedCategoryCount: 1,
    expectedValueCount: 7,
    templateNames: { ko: '윙봉 맛 4개 선택', vi: 'Chọn 4 vị cánh gà', zh: '选择四种鸡翅口味', en: 'Choose Four Wing Flavors' }
  },
  '(W01) Cánh gà vị đôi': {
    expectedCategoryCount: 1,
    expectedValueCount: 7,
    templateNames: { ko: '윙봉 맛 2개 선택', vi: 'Chọn 2 vị cánh gà', zh: '选择两种鸡翅口味', en: 'Choose Two Wing Flavors' }
  },
  'ᄉ TT 加 AET': {
    expectedCategoryCount: 1,
    expectedValueCount: 6,
    templateNames: { ko: '사리 추가 선택', vi: 'Chọn món thêm', zh: '选择加料', en: 'Choose Extra Toppings' }
  }
};

layout.optionOrdering.templates = [
  ...(layout.optionOrdering.templates || []).filter(item => item.templateId !== SAPPORO_DETAIL_TEMPLATE),
  { templateId: SAPPORO_DETAIL_TEMPLATE, valueIds: SAPPORO_SIZE_ORDER }
];

layout.menuOptionOverrides = {
  ...(layout.menuOptionOverrides || {}),
  HCX: {
    templateIds: [HCX_DETAIL_TEMPLATE],
    rules: { [HCX_DETAIL_TEMPLATE]: { required: true, minSelections: 1, maxSelections: 1 } }
  },
  '(A02) Bia tuoi Sapporo': {
    templateIds: [SAPPORO_DETAIL_TEMPLATE],
    rules: { [SAPPORO_DETAIL_TEMPLATE]: { required: true, minSelections: 1, maxSelections: 3, selectionMode: 'quantity-per-value-lines', maxQuantityPerValue: 99 } }
  },
  '(T10) Do chien/mon chien': {
    templateIds: [FRIED_DETAIL_TEMPLATE],
    rules: { [FRIED_DETAIL_TEMPLATE]: { required: true, minSelections: 1, maxSelections: 10 } }
  },
  '(S08) Cánh gà 4 vị': {
    templateIds: [FOUR_WINGS_DETAIL_TEMPLATE],
    rules: { [FOUR_WINGS_DETAIL_TEMPLATE]: { required: true, minSelections: 4, maxSelections: 4 } }
  },
  '(W01) Cánh gà vị đôi': {
    templateIds: [HALF_WINGS_DETAIL_TEMPLATE],
    rules: { [HALF_WINGS_DETAIL_TEMPLATE]: { required: true, minSelections: 2, maxSelections: 2 } }
  },
  'ᄉ TT 加 AET': {
    templateIds: [EXTRA_TOPPINGS_DETAIL_TEMPLATE],
    rules: { [EXTRA_TOPPINGS_DETAIL_TEMPLATE]: { required: true, minSelections: 1, maxSelections: 5 } }
  },
  '(KX01)': {
    templateIds: [BONE_TEMPLATE, CHICKEN_TEMPLATE],
    rules: {
      [BONE_TEMPLATE]: { required: true, minSelections: 1, maxSelections: 1 },
      [CHICKEN_TEMPLATE]: { required: true, minSelections: 2, maxSelections: 2 }
    }
  },
  '(S05) Cánh gà + Tok': {
    rules: { [WING_TEMPLATE]: { required: true, minSelections: 1, maxSelections: 1 } }
  },
  '(T06) Tokbokki cay nhẹ': {
    templateIds: [TTEOK_SPICE_TEMPLATE, TTEOK_TOPPING_TEMPLATE],
    rules: {
      [TTEOK_SPICE_TEMPLATE]: { required: true, minSelections: 1, maxSelections: 1 },
      [TTEOK_TOPPING_TEMPLATE]: { required: false, minSelections: 0, maxSelections: 3 }
    }
  },
  SPACE111: {
    templateIds: [PIZZA_CHOICE_TEMPLATE],
    rules: { [PIZZA_CHOICE_TEMPLATE]: { required: true, minSelections: 2, maxSelections: 2 } }
  },
  SPACE112: {
    templateIds: [PIZZA_CHOICE_TEMPLATE],
    rules: { [PIZZA_CHOICE_TEMPLATE]: { required: true, minSelections: 2, maxSelections: 2 } }
  },
  SPACE113: {
    templateIds: [PIZZA_CHOICE_TEMPLATE],
    rules: { [PIZZA_CHOICE_TEMPLATE]: { required: true, minSelections: 2, maxSelections: 2 } }
  },
  SPACE114: {
    templateIds: [PIZZA_CHOICE_TEMPLATE],
    rules: { [PIZZA_CHOICE_TEMPLATE]: { required: true, minSelections: 2, maxSelections: 2 } }
  },
  SPACE115: {
    templateIds: [PIZZA_CHOICE_TEMPLATE],
    rules: { [PIZZA_CHOICE_TEMPLATE]: { required: true, minSelections: 2, maxSelections: 2 } }
  }
};

layout.menuNameOverrides = names;
layout.menuSubtitleOverrides = subtitles;

function categoryByCode(code) {
  const category = layout.categories.find(item => item.code === code);
  if (!category) throw new Error(`Missing category: ${code}`);
  return category;
}

function markUnavailable(categoryCode, menuCode) {
  const menu = categoryByCode(categoryCode).menus.find(item => item.code === menuCode);
  if (!menu) throw new Error(`Missing menu ${menuCode} in ${categoryCode}`);
  menu.outOfStock = true;
}

function markAvailable(categoryCode, menuCode) {
  const menu = categoryByCode(categoryCode).menus.find(item => item.code === menuCode);
  if (!menu) throw new Error(`Missing menu ${menuCode} in ${categoryCode}`);
  menu.outOfStock = false;
}

function reorder(categoryCode, orderedCodes) {
  const category = categoryByCode(categoryCode);
  const byCode = new Map(category.menus.map(menu => [menu.code, menu]));
  const preferred = orderedCodes.map(code => {
    const menu = byCode.get(code);
    if (!menu) throw new Error(`Missing menu ${code} in ${categoryCode}`);
    byCode.delete(code);
    return menu;
  });
  category.menus = [...preferred, ...byCode.values()].map((menu, index) => ({ ...menu, sortOrder: index }));
}

// The detail-backed Addition IDs are verified. Re-open these menus with fail-closed rules.
markAvailable('다방분식 | Đồ ăn nhẹ Dabang', '(T10) Do chien/mon chien');
markAvailable('주류 |Đồ uống có cồn', '(A02) Bia tuoi Sapporo');
markAvailable('New Menu', 'HCX');
markAvailable('세트메뉴 | Combo món ăn', '(S08) Cánh gà 4 vị');
markAvailable('날개치킨 | Cánh gà sốt', '(W01) Cánh gà vị đôi');
markAvailable('안주 |Món nhắm', 'ᄉ TT 加 AET');
markAvailable('안주 |Món nhắm', '(M04) nacho cham phomai');

reorder('주류 |Đồ uống có cồn', [
  '(A01) Sapporo 1t1 640ml',
  '(A02) Bia tuoi Sapporo',
  '(A03) Bia den tuoi Sap',
  'ᄒᄉ1 BTHN1 河1 HDB1',
  '수량확인5',
  '수량확인7',
  '수량확인6',
  '수량확인8',
  'ᄉ SS 鲜 SS',
  'ᄉ SSO 鲜',
  '수량확인11',
  '수량확인12',
  '수량확인1',
  '수량확인30',
  '수량확인3',
  '수량확인29',
  '수량확인9',
  'ᄃᄀᄉ TG S'
]);

const revisionSource = {
  categories: layout.categories.map(category => ({
    code: category.code,
    menus: category.menus.map(menu => ({ code: menu.code, outOfStock: menu.outOfStock }))
  })),
  menuNameOverrides: layout.menuNameOverrides,
  menuSubtitleOverrides: layout.menuSubtitleOverrides,
  menuOptionOverrides: layout.menuOptionOverrides,
  detailOptionSources: layout.detailOptionSources,
  optionOrdering: layout.optionOrdering
};
const fingerprint = crypto.createHash('sha256').update(JSON.stringify(revisionSource)).digest('hex').slice(0, 12);
layout.revision = `cukcuk-tablet-content-2026-08-30-${fingerprint}`;
layout.capturedAt = new Date().toISOString();

fs.writeFileSync(layoutPath, `${JSON.stringify(layout, null, 2)}\n`);
console.log(`Updated ${layoutPath}`);
console.log(`Revision: ${layout.revision}`);
