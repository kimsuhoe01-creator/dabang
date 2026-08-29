import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import layout from '../../assets/table-layout.js';
import optionOrder from '../../assets/option-order.js';
import { buildTableQrConfig } from '../../scripts/build-table-qr-layout.mjs';
import { applyTableQrLayout } from '../../scripts/apply-table-qr-layout.mjs';

test('option values show free choices first while preserving source order within each tier', () => {
  const values = [
    { id: 'paid-high', additionalPrice: 30000, sortOrder: 0 },
    { id: 'free-second', additionalPrice: 0, sortOrder: 1 },
    { id: 'paid-low-later', additionalPrice: 10000, sortOrder: 2 },
    { id: 'free-first-source', additionalPrice: 0, sortOrder: 0 },
    { id: 'paid-low-earlier', additionalPrice: 10000, sortOrder: 1 }
  ];

  const ordered = optionOrder.normalizeValues(values);

  assert.deepEqual(ordered.map(value => value.id), ['free-first-source', 'free-second', 'paid-high', 'paid-low-earlier', 'paid-low-later']);
  assert.deepEqual(ordered.map(value => value.sortOrder), [0, 1, 2, 3, 4]);
  assert.equal(optionOrder.isFreeFirst(ordered), true);
  assert.deepEqual(values.map(value => value.id), ['paid-high', 'free-second', 'paid-low-later', 'free-first-source', 'paid-low-earlier']);
});

test('rebuilding a table QR capture preserves the separately verified CUKCUK option order', () => {
  const snapshot = {
    extractedAt: '2026-08-29T00:00:00.000Z',
    categories: [{ code: 'New Menu', displayName: 'New Menu', active: true, hidden: false, effectiveOrder: 0 }],
    menus: [{ code: 'ONE', displayName: '첫번째', category: 'New Menu', customerVisible: true, displayOrder: 0, price: 100, outOfStock: false }]
  };
  const optionOrdering = {
    policy: 'free-first-stable',
    menus: [{ code: 'ONE', templateIds: ['choice'] }],
    templates: [{ templateId: 'choice', valueIds: ['free', 'paid'] }]
  };
  const menuNameOverrides = { ONE: { ko: '첫 번째 메뉴' } };

  const result = buildTableQrConfig(snapshot, { optionOrdering, menuNameOverrides });
  const changed = buildTableQrConfig(snapshot, { optionOrdering: { ...optionOrdering, templates: [{ templateId: 'choice', valueIds: ['paid', 'free'] }] }, menuNameOverrides });
  const renamedSnapshot = {
    ...snapshot,
    categories: [{ ...snapshot.categories[0], displayName: 'New Menu | Món mới' }],
    menus: [{ ...snapshot.menus[0], category: 'New Menu | Món mới' }]
  };
  const renamed = buildTableQrConfig(renamedSnapshot, { optionOrdering, menuNameOverrides });

  assert.deepEqual(result.optionOrdering, optionOrdering);
  assert.deepEqual(result.menuNameOverrides, menuNameOverrides);
  assert.notEqual(result.optionOrdering, optionOrdering);
  assert.notEqual(result.menuNameOverrides, menuNameOverrides);
  assert.notEqual(result.revision, changed.revision);
  assert.notEqual(result.revision, renamed.revision);
});

test('default table groups use table-name prefixes and A, B, C priority', () => {
  const tables = [
    { id: 'b2', name: 'B-02', sourceArea: 'B-' },
    { id: 'take1', name: 'take01', sourceArea: '배달' },
    { id: 'a5', name: 'A-5', sourceArea: 'A-' },
    { id: 'c3', name: 'C-3', sourceArea: 'A-' },
    { id: 'a1', name: 'A-1', sourceArea: 'A-' },
    { id: 'd2', name: 'D-2', sourceArea: 'C-' },
    { id: 'pc1', name: 'PC1', sourceArea: 'Z' },
    { id: 'b1', name: 'B-01', sourceArea: 'B-' },
    { id: 'c1', name: 'C-1', sourceArea: 'A-' }
  ];

  const groups = layout.buildDefaultGroups(tables);

  assert.deepEqual(groups.map(group => group.name), ['A', 'B', 'C', 'D', 'Z', '배달']);
  assert.deepEqual(groups[0].tables.map(table => table.name), ['A-1', 'A-5']);
  assert.deepEqual(groups[1].tables.map(table => table.name), ['B-01', 'B-02']);
  assert.deepEqual(groups[2].tables.map(table => table.name), ['C-1', 'C-3']);
});

test('source area is used only when a table name has no recognized prefix', () => {
  assert.equal(layout.inferArea({ name: 'C-3', sourceArea: 'A-' }), 'C');
  assert.equal(layout.inferArea({ name: 'PC4', sourceArea: 'Z' }), 'Z');
  assert.equal(layout.inferArea({ name: 'ship02', sourceArea: '배달' }), '배달');
  assert.equal(layout.inferArea({ name: '테라스', sourceArea: 'A-' }), 'A');
});

test('the published store tables start with A, B, C, D and each group starts at 1', () => {
  const payload = JSON.parse(fs.readFileSync(new URL('../../data/cukcuk-tables.json', import.meta.url), 'utf8'));
  const tables = payload.Data.ListTable.map((row, index) => ({
    id: String(row.MapObjectID ?? index),
    name: String(row.MapObjectName ?? ''),
    sourceArea: String(row.AreaName ?? '')
  }));
  const groups = layout.buildDefaultGroups(tables);

  assert.deepEqual(groups.slice(0, 4).map(group => group.name), ['A', 'B', 'C', 'D']);
  assert.deepEqual(groups.slice(0, 4).map(group => group.tables[0].name), ['A-1', 'B-01', 'C-1', 'D-1']);
});

test('table QR layout is a strict allowlist and preserves its category and menu order', () => {
  const published = {
    categories: [{ id: 'old', names: { ko: '기존' } }],
    menus: [
      { id: 'burger', cukcukCode: 'SPACE6', names: { ko: '버거 세트' }, price: 200, available: true },
      { id: 'second', cukcukCode: 'SECOND', names: { ko: '두번째' }, price: 120, available: true, optionTemplateIds: ['keep'] },
      { id: 'first', cukcukCode: 'FIRST', names: { ko: '첫번째' }, price: 100, available: true, optionTemplateIds: ['keep', 'drop'] }
    ],
    optionTemplates: [
      { id: 'keep', menuIds: ['first', 'second', 'burger'], values: [
        { id: 'paid', additionalPrice: 200, sortOrder: 0 },
        { id: 'free', additionalPrice: 0, sortOrder: 1 },
        { id: 'cheaper', additionalPrice: 100, sortOrder: 2 }
      ] },
      { id: 'drop', menuIds: ['first'] },
      { id: 'unused', menuIds: ['burger'] }
    ],
    lastSync: {}
  };
  const config = {
    revision: 'qr-test-1',
    includeUnlisted: false,
    featuredVisible: false,
    categoryCount: 1,
    menuCount: 2,
    categories: [{
      id: 'qr-category',
      code: 'QR category',
      sortOrder: 0,
      sourceName: 'QR 카테고리',
      names: { ko: 'QR 카테고리', vi: 'QR', zh: 'QR', en: 'QR' },
      visible: true,
      menus: [
        { code: 'FIRST', displayName: '첫번째', price: 100, outOfStock: true, sortOrder: 0 },
        { code: 'SECOND', displayName: '두번째', price: 120, outOfStock: false, sortOrder: 1 }
      ]
    }]
  };

  const result = applyTableQrLayout(published, config);

  assert.deepEqual(result.categories.map(category => category.id), ['qr-category']);
  assert.deepEqual(result.menus.map(menu => menu.id), ['first', 'second']);
  assert.equal(result.menus[0].available, false);
  assert.equal(result.menus[0].categorySortOrder, 0);
  assert.equal(result.menus[1].categorySortOrder, 1);
  assert.equal(result.tableQrLayout.featuredVisible, false);
  assert.equal(result.tableQrLayout.excludedCandidateCount, 1);
  assert.deepEqual(result.optionTemplates.map(template => template.id), ['keep', 'drop']);
  assert.deepEqual(result.optionTemplates[0].menuIds, ['first', 'second']);
  assert.deepEqual(result.optionTemplates[0].values.map(value => value.id), ['free', 'paid', 'cheaper']);
  assert.equal(result.lastSync.published_menu_count, 2);
});

test('the checked-in menu data has no option group with free choices after paid choices', () => {
  const menu = JSON.parse(fs.readFileSync(new URL('../../data/cukcuk-menu.json', import.meta.url), 'utf8'));
  const violations = menu.optionTemplates
    .filter(template => !optionOrder.isFreeFirst(template.values))
    .map(template => template.names?.ko || template.id);

  assert.deepEqual(violations, []);
});

test('the checked-in menu data preserves the option order saved in CUKCUK admin', () => {
  const menu = JSON.parse(fs.readFileSync(new URL('../../data/cukcuk-menu.json', import.meta.url), 'utf8'));
  const layout = JSON.parse(fs.readFileSync(new URL('../../data/cukcuk-table-qr-layout.json', import.meta.url), 'utf8'));
  const menusByCode = new Map(menu.menus.map(item => [String(item.cukcukCode), item]));
  const templatesById = new Map(menu.optionTemplates.map(item => [String(item.id), item]));

  for (const rule of layout.optionOrdering.menus) {
    assert.deepEqual(menusByCode.get(rule.code)?.optionTemplateIds, rule.templateIds, `option groups for ${rule.name}`);
  }
  for (const rule of layout.optionOrdering.templates) {
    assert.deepEqual(templatesById.get(rule.templateId)?.values.map(value => value.id), rule.valueIds, `option values for ${rule.name}`);
  }
});

test('verified option order reorders only choices that still exist and never invents removed choices', () => {
  const published = {
    categories: [],
    menus: [{ id: 'one', cukcukCode: 'ONE', price: 100, optionTemplateIds: ['second', 'first'] }],
    optionTemplates: [
      { id: 'first', menuIds: ['one'], values: [{ id: 'paid', additionalPrice: 10, sortOrder: 0 }, { id: 'free', additionalPrice: 0, sortOrder: 1 }] },
      { id: 'second', menuIds: ['one'], values: [] }
    ]
  };
  const config = {
    revision: 'subset-v1',
    includeUnlisted: false,
    categoryCount: 1,
    menuCount: 1,
    categories: [{ id: 'cat', sortOrder: 0, menus: [{ code: 'ONE', sortOrder: 0 }] }],
    optionOrdering: {
      policy: 'free-first-stable',
      menus: [{ code: 'ONE', templateIds: ['first', 'removed-group', 'second'] }],
      templates: [{ templateId: 'first', valueIds: ['free', 'removed-value', 'paid'] }]
    }
  };

  const result = applyTableQrLayout(published, config);

  assert.deepEqual(result.menus[0].optionTemplateIds, ['first', 'second']);
  assert.deepEqual(result.optionTemplates.find(template => template.id === 'first').values.map(value => value.id), ['free', 'paid']);
});

test('table QR layout fails closed when an exposed CUKCUK product cannot be resolved', () => {
  const published = { categories: [], menus: [], optionTemplates: [] };
  const config = {
    revision: 'qr-test-missing',
    includeUnlisted: false,
    categoryCount: 1,
    menuCount: 1,
    categories: [{ id: 'qr', sortOrder: 0, menus: [{ code: 'MISSING', displayName: '없는 메뉴', sortOrder: 0 }] }]
  };

  assert.throws(() => applyTableQrLayout(published, config), /missing 1 table QR products/i);
});

test('table QR layout fails closed on duplicate product codes or missing option templates', () => {
  const baseConfig = {
    revision: 'qr-test-strict',
    includeUnlisted: false,
    categoryCount: 1,
    menuCount: 1,
    categories: [{ id: 'qr', sortOrder: 0, menus: [{ code: 'ONE', displayName: '하나', sortOrder: 0 }] }]
  };
  const duplicateCodes = {
    categories: [],
    menus: [
      { id: 'one-a', cukcukCode: 'ONE', optionTemplateIds: [] },
      { id: 'one-b', cukcukCode: 'ONE', optionTemplateIds: [] }
    ],
    optionTemplates: []
  };
  const missingTemplate = {
    categories: [],
    menus: [{ id: 'one', cukcukCode: 'ONE', price: 100, optionTemplateIds: ['missing-template'] }],
    optionTemplates: []
  };

  assert.throws(() => applyTableQrLayout(duplicateCodes, baseConfig), /resolved to 2 candidates/i);
  assert.throws(() => applyTableQrLayout(missingTemplate, baseConfig), /missing 1 referenced option templates/i);
});

test('table QR layout rejects invalid prices and inconsistent declared sort order', () => {
  const config = {
    revision: 'qr-test-validation',
    includeUnlisted: false,
    categoryCount: 1,
    menuCount: 1,
    categories: [{ id: 'qr', sortOrder: 0, menus: [{ code: 'ONE', displayName: '하나', sortOrder: 0 }] }]
  };
  const invalidPrice = { categories: [], menus: [{ id: 'one', cukcukCode: 'ONE', price: null, optionTemplateIds: [] }], optionTemplates: [] };
  const invalidSort = structuredClone(config);
  invalidSort.categories[0].menus[0].sortOrder = 2;

  assert.throws(() => applyTableQrLayout(invalidPrice, config), /invalid price/i);
  assert.throws(() => applyTableQrLayout({ categories: [], menus: [], optionTemplates: [] }, invalidSort), /sortOrder must be 0/i);
});

test('the checked-in CUKCUK table QR snapshot publishes the polished 14-category, 112-menu layout', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../../data/cukcuk-table-qr-layout.json', import.meta.url), 'utf8'));
  const rules = config.categories.flatMap(category => category.menus);
  const menus = rules.map((rule, index) => ({
    id: `menu-${index}`,
    cukcukCode: rule.code,
    sourceName: rule.displayName,
    names: { ko: rule.displayName },
    price: rule.price,
    available: true,
    optionTemplateIds: []
  }));
  menus.push({ id: 'burger', cukcukCode: 'SPACE6', names: { ko: '판매하지 않는 버거 세트' }, available: true, optionTemplateIds: [] });

  const result = applyTableQrLayout({ categories: [], menus, optionTemplates: [] }, config);

  assert.equal(result.categoryCount, 14);
  assert.equal(result.menuCount, 112);
  assert.equal(result.tableQrLayout.excludedCandidateCount, 1);
  assert.deepEqual(result.categories.map(category => category.names.ko), ['하이볼', '신메뉴', '요일별 할인', '세트', '반마리 치킨', '다방치킨', '통닭', '날개치킨', '다방분식', '스페이스 피자', '안주', '건어물', '음료', '주류']);
  const menusByCategory = new Map(result.categories.map(category => [category.names.ko, result.menus.filter(menu => menu.categoryId === category.id)]));
  assert.deepEqual(menusByCategory.get('반마리 치킨').map(menu => menu.cukcukCode), ['(KX13)', '(KX14)', 'Original Roast', 'Crispy Spicy Roast', '(W06) Nửa con gà']);
  assert.deepEqual(menusByCategory.get('건어물').map(menu => menu.cukcukCode), ['(F09) Do kho tong hop', '(F06) Cá pollack non khô', '(F08) Ca chi vang nuong', '(F07) Mực bán khô tẩm vị', '(F04) Cá chỉ vàng nướng', 'Mực']);
  assert.deepEqual(menusByCategory.get('신메뉴').slice(0, 5).map(menu => menu.cukcukCode), ['ᄃᄃᄎ TTTD', 'ᄃᄃ TD 地', 'HCX', 'ᄃ DC 达', 'ᄎ GNTC 炭 CSC']);
  assert.equal(result.menus.find(menu => menu.cukcukCode === '(KX04)').names.ko, '후라이드 치킨');
  assert.equal(result.menus.find(menu => menu.cukcukCode === '(KX05)').names.ko, '양념 치킨');
  assert.deepEqual(result.menus.find(menu => menu.cukcukCode === 'BDH').names, { ko: '수박', vi: 'Dưa hấu', zh: '西瓜', en: 'Watermelon' });
  assert.equal(result.menus.filter(menu => menu.available === false).length, 2);
  assert.equal(result.menus.some(menu => /burger|버거/i.test(`${menu.cukcukCode} ${menu.names?.ko || ''}`)), false);
});
