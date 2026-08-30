import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CATEGORY_IDS = new Map([
  ['New Menu', 'f60b3e05-f21f-4905-9207-0e494ff2b464'],
  ['Daily Discounts', 'cukcuk-qr-daily-discounts'],
  ['세트메뉴 | Combo món ăn', '6a144c27-c7ba-43f6-b6e1-4be8b008b433'],
  ['Half Chicken', 'cukcuk-half-chicken'],
  ['다방치킨 | Dabang Chicken', '0afd5056-2ad2-46d3-9122-6886fedc4d3a'],
  ['통닭 | Gà nguyên con', '52c66f7a-c2df-4713-a319-65e3963eb912'],
  ['날개치킨 | Cánh gà sốt', '2424e567-8845-48c6-a4af-91c51a4d3aaa'],
  ['다방분식 | Đồ ăn nhẹ Dabang', '5181465e-2d7d-4f9f-bdc1-de466348cd7f'],
  ['스페이스 피자 | Space Pizza', '0ac81743-8d00-47bd-af8c-e102b44f4247'],
  ['안주 |Món nhắm', '601b353e-0f17-46db-bd64-d64140a70d27'],
  ['Dried Snacks', 'cukcuk-dried-snacks'],
  ['음료 | Đồ uống', '4ae5f7a4-9b6d-4c73-a895-af5d60c8fd87'],
  ['주류 |Đồ uống có cồn', 'cukcuk-alcohol'],
  ['하이볼 | Highball', 'cukcuk-qr-highball']
]);

const CATEGORY_NAMES = new Map([
  ['New Menu', { ko: '신메뉴', vi: 'Món mới', zh: '新菜单', en: 'New Menu' }],
  ['Daily Discounts', { ko: '요일별 할인', vi: 'Ưu đãi theo ngày', zh: '每日优惠', en: 'Daily Discounts' }],
  ['세트메뉴 | Combo món ăn', { ko: '세트', vi: 'Combo', zh: '套餐', en: 'Set Combo' }],
  ['Half Chicken', { ko: '반마리 치킨', vi: 'Gà nửa con', zh: '半只鸡', en: 'Half Chicken' }],
  ['다방치킨 | Dabang Chicken', { ko: '다방치킨', vi: 'Gà Dabang', zh: 'Dabang 炸鸡', en: 'Dabang Chicken' }],
  ['통닭 | Gà nguyên con', { ko: '통닭', vi: 'Gà nguyên con chiên', zh: '整只炸鸡', en: 'Whole Fried Chicken' }],
  ['날개치킨 | Cánh gà sốt', { ko: '날개치킨', vi: 'Gà cánh chiên', zh: '炸鸡翅', en: 'Chicken Wings' }],
  ['다방분식 | Đồ ăn nhẹ Dabang', { ko: '다방분식', vi: 'Món ăn vặt Dabang', zh: 'Dabang 小吃', en: 'Dabang Snacks' }],
  ['스페이스 피자 | Space Pizza', { ko: '스페이스 피자', vi: 'Pizza Space', zh: 'Space 披萨', en: 'Space Pizza' }],
  ['안주 |Món nhắm', { ko: '안주', vi: 'Món nhậu', zh: '下酒菜', en: 'Bar Snacks' }],
  ['Dried Snacks', { ko: '건어물', vi: 'Đồ khô', zh: '干货', en: 'Dried Snacks' }],
  ['음료 | Đồ uống', { ko: '음료', vi: 'Nước uống', zh: '饮料', en: 'Beverages' }],
  ['주류 |Đồ uống có cồn', { ko: '주류', vi: 'Đồ uống có cồn', zh: '酒类', en: 'Alcohol' }],
  ['하이볼 | Highball', { ko: '하이볼', vi: 'Rượu Highball', zh: '高球酒', en: 'Highball' }]
]);

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function categoryNames(sourceName) {
  const parts = clean(sourceName).split(/\s*\|\s*/).map(clean).filter(Boolean);
  return { ko: parts[0] || '', vi: parts[1] || '', zh: parts[2] || '', en: parts[3] || '' };
}

export function buildTableQrConfig(snapshot, existingConfig = {}) {
  const optionOrdering = clone(existingConfig?.optionOrdering);
  const menuNameOverrides = clone(existingConfig?.menuNameOverrides);
  const menuSubtitleOverrides = clone(existingConfig?.menuSubtitleOverrides);
  const menuOptionOverrides = clone(existingConfig?.menuOptionOverrides);
  const detailOptionSources = clone(existingConfig?.detailOptionSources);
  const activeCategories = (snapshot.categories || [])
    .filter(category => category.active && !category.hidden)
    .slice()
    .sort((left, right) => Number(left.effectiveOrder) - Number(right.effectiveOrder));
  const visibleMenus = (snapshot.menus || []).filter(menu => menu.customerVisible);
  const seenCodes = new Set();

  const categories = activeCategories.map((category, categoryIndex) => {
    const id = CATEGORY_IDS.get(category.code);
    if (!id) throw new Error(`No stable category id is configured for ${category.code}.`);
    const menus = visibleMenus
      .filter(menu => menu.category === category.displayName)
      .slice()
      .sort((left, right) => Number(left.displayOrder) - Number(right.displayOrder))
      .map((menu, menuIndex) => {
        const code = clean(menu.code);
        if (!code) throw new Error(`A visible menu in ${category.displayName} has no product code.`);
        if (seenCodes.has(code)) throw new Error(`Duplicate visible CUKCUK product code: ${code}`);
        seenCodes.add(code);
        return {
          code,
          displayName: clean(menu.displayName),
          price: Number(menu.price) || 0,
          outOfStock: Boolean(menu.outOfStock),
          sortOrder: menuIndex
        };
      });
    return {
      id,
      code: clean(category.code),
      sourceName: clean(category.displayName),
      names: CATEGORY_NAMES.get(category.code) || categoryNames(category.displayName),
      visible: true,
      sortOrder: categoryIndex,
      menus
    };
  });

  if (seenCodes.size !== visibleMenus.length) {
    throw new Error(`Visible menu count mismatch: ${visibleMenus.length} rows, ${seenCodes.size} configured codes.`);
  }

  const fingerprintSource = {
    categories: categories.map(category => ({
      id: category.id,
      code: category.code,
      sourceName: category.sourceName,
      names: category.names,
      menus: category.menus.map(menu => ({ code: menu.code, outOfStock: menu.outOfStock }))
    })),
    optionOrdering: optionOrdering || null,
    menuNameOverrides: menuNameOverrides || null,
    menuSubtitleOverrides: menuSubtitleOverrides || null,
    menuOptionOverrides: menuOptionOverrides || null,
    detailOptionSources: detailOptionSources || null
  };
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(fingerprintSource)).digest('hex').slice(0, 12);
  const capturedDate = String(snapshot.extractedAt || '').slice(0, 10) || 'undated';

  const config = {
    version: 1,
    revision: `cukcuk-table-qr-${capturedDate}-${fingerprint}`,
    capturedAt: snapshot.extractedAt || new Date().toISOString(),
    timezone: snapshot.timezone || 'Asia/Ho_Chi_Minh',
    source: 'CUKCUK 관리자 > Bán hàng Online > Gọi món tại bàn > Thực đơn',
    includeUnlisted: false,
    featuredVisible: false,
    tableDefaults: { groupOrder: ['A', 'B', 'C'], withinGroup: 'numeric-by-table-name' },
    categoryCount: categories.length,
    menuCount: seenCodes.size,
    categories
  };
  if (optionOrdering) config.optionOrdering = optionOrdering;
  if (menuNameOverrides) config.menuNameOverrides = menuNameOverrides;
  if (menuSubtitleOverrides) config.menuSubtitleOverrides = menuSubtitleOverrides;
  if (menuOptionOverrides) config.menuOptionOverrides = menuOptionOverrides;
  if (detailOptionSources) config.detailOptionSources = detailOptionSources;
  return config;
}

function runCli() {
  const [inputPath = 'work/cukcuk-table-qr-layout-20260829.json', outputPath = 'data/cukcuk-table-qr-layout.json'] = process.argv.slice(2);
  const snapshot = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const existingConfig = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : {};
  const config = buildTableQrConfig(snapshot, existingConfig);
  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`Wrote ${config.categoryCount} categories and ${config.menuCount} menus to ${outputPath}.`);
  console.log(`Catalog revision: ${config.revision}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) runCli();
