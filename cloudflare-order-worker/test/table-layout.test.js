import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import layout from '../../assets/table-layout.js';
import { applyTableQrLayout } from '../../scripts/apply-table-qr-layout.mjs';

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
      { id: 'keep', menuIds: ['first', 'second', 'burger'] },
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
  assert.equal(result.lastSync.published_menu_count, 2);
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

test('the checked-in CUKCUK table QR snapshot publishes exactly 12 categories and 112 non-burger menus', () => {
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

  assert.equal(result.categoryCount, 12);
  assert.equal(result.menuCount, 112);
  assert.equal(result.tableQrLayout.excludedCandidateCount, 1);
  assert.deepEqual(result.categories.map(category => category.names.ko), ['신메뉴', '요일별 할인', '세트', '다방치킨', '통닭', '날개치킨', '다방분식', '스페이스 피자', '안주', '음료', '주류', '하이볼']);
  assert.equal(result.menus.filter(menu => menu.available === false).length, 2);
  assert.equal(result.menus.some(menu => /burger|버거/i.test(`${menu.cukcukCode} ${menu.names?.ko || ''}`)), false);
});
