import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCukcukDetailOptions } from '../../scripts/merge-cukcuk-detail-options.mjs';

function fixture() {
  const published = {
    synced: true,
    optionTemplateCount: 3,
    menus: [
      {
        id: 'menu-hcx',
        cukcukCode: 'HCX',
        optionGroups: 1,
        optionTemplateIds: ['old-hcx'],
        optionRules: { 'old-hcx': { required: true, minSelections: 1, maxSelections: 1 } }
      },
      {
        id: 'menu-s08',
        cukcukCode: '(S08) Cánh gà 4 vị',
        optionGroups: 1,
        optionTemplateIds: ['old-shared'],
        optionRules: { 'cukcuk-detail:menu-s08:0': { required: true, minSelections: 4, maxSelections: 4 } }
      },
      { id: 'menu-other', cukcukCode: 'OTHER', optionGroups: 1, optionTemplateIds: ['old-shared'] }
    ],
    optionTemplates: [
      { id: 'old-hcx', menuIds: ['menu-hcx'], values: [{ id: 'old-hcx-value' }] },
      { id: 'old-shared', menuIds: ['menu-s08', 'menu-other'], values: [{ id: 'shared-value' }] },
      { id: 'unrelated-orphan', menuIds: [], values: [] }
    ]
  };
  const config = {
    detailOptionSources: {
      HCX: {
        expectedCategoryCount: 1,
        expectedValueCount: 2,
        templateNames: { ko: '돈까스 맛 선택', vi: 'Chọn vị tonkatsu', en: 'Choose tonkatsu style' }
      },
      '(S08) Cánh gà 4 vị': {
        expectedCategoryCount: 1,
        expectedValueCount: 7,
        templateNames: [{ ko: '윙봉 맛 4개 선택', vi: 'Chọn 4 vị cánh gà', en: 'Choose four wing flavors' }]
      }
    }
  };
  const details = {
    details: [
      {
        Id: 'menu-hcx',
        Name: '돈까스 플레이트',
        AdditionCategories: [{
          Additions: [
            { Id: 'hcx-plain', Description: '안 매운맛 | Không cay', Price: 0, InActive: false },
            { Id: 'hcx-retired', Description: '예전 옵션 | Tùy chọn cũ', Price: 0, InActive: true },
            { Id: 'hcx-half', Description: 'Nửa không cay + nửa Dijinda | 반반', Price: '10000' }
          ]
        }]
      },
      {
        Id: 'menu-s08',
        Name: '윙봉 떠까',
        AdditionCategories: [{
          Id: null,
          Name: null,
          Additions: Array.from({ length: 7 }, (_, index) => ({
            Id: `wing-${index + 1}`,
            Description: `맛 ${index + 1} | Vị ${index + 1}`,
            Price: 0,
            InActive: false
          }))
        }]
      }
    ]
  };
  return { published, config, details };
}

test('detail options replace HCX and S08 attachments with deterministic templates and receipt-safe additions', () => {
  const { published, config, details } = fixture();
  const originalPublished = structuredClone(published);

  const result = mergeCukcukDetailOptions(published, config, details);

  assert.deepEqual(published, originalPublished, 'merge must not mutate its input');
  const hcx = result.menus.find(menu => menu.cukcukCode === 'HCX');
  const s08 = result.menus.find(menu => menu.cukcukCode === '(S08) Cánh gà 4 vị');
  assert.deepEqual(hcx.optionTemplateIds, ['cukcuk-detail:menu-hcx:0']);
  assert.equal(hcx.optionGroups, 1);
  assert.equal(hcx.optionRules, undefined);
  assert.deepEqual(s08.optionTemplateIds, ['cukcuk-detail:menu-s08:0']);
  assert.deepEqual(s08.optionRules, {
    'cukcuk-detail:menu-s08:0': { required: true, minSelections: 4, maxSelections: 4 }
  });

  const hcxTemplate = result.optionTemplates.find(template => template.id === 'cukcuk-detail:menu-hcx:0');
  const s08Template = result.optionTemplates.find(template => template.id === 'cukcuk-detail:menu-s08:0');
  assert.deepEqual(hcxTemplate.menuIds, ['menu-hcx']);
  assert.deepEqual(hcxTemplate.names, { ko: '돈까스 맛 선택', vi: 'Chọn vị tonkatsu', zh: '', en: 'Choose tonkatsu style' });
  assert.deepEqual(hcxTemplate.values.map(value => value.id), ['hcx-plain', 'hcx-half']);
  assert.deepEqual(hcxTemplate.values.map(value => value.additionalPrice), [0, 10000]);
  assert.deepEqual(hcxTemplate.values[0].receiptNames, { ko: '안 매운맛', vi: 'Không cay' });
  assert.deepEqual(hcxTemplate.values[0].names, { ko: '안 매운맛', vi: 'Không cay', zh: '', en: '' });
  assert.deepEqual(hcxTemplate.values[1].receiptNames, { ko: '반반', vi: 'Nửa không cay + nửa Dijinda' });
  assert.equal(s08Template.values.length, 7);
  assert.deepEqual(s08Template.values.map(value => value.sortOrder), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(result.optionTemplates.some(template => template.id === 'old-hcx'), false);
  assert.deepEqual(result.optionTemplates.find(template => template.id === 'old-shared').menuIds, ['menu-other']);
  assert.ok(result.optionTemplates.some(template => template.id === 'unrelated-orphan'), 'unrelated orphan templates are outside this merge scope');
  assert.equal(result.optionTemplateCount, 4);
  assert.deepEqual(mergeCukcukDetailOptions(result, config, details), result, 'repeating the merge is deterministic');
});

test('detail option merge fails closed on expected category or value count drift', () => {
  const categoryMismatch = fixture();
  categoryMismatch.config.detailOptionSources.HCX.expectedCategoryCount = 2;
  assert.throws(
    () => mergeCukcukDetailOptions(categoryMismatch.published, categoryMismatch.config, categoryMismatch.details),
    /expected 2 active categories but received 1/i
  );

  const valueMismatch = fixture();
  valueMismatch.config.detailOptionSources.HCX.expectedValueCount = 3;
  assert.throws(
    () => mergeCukcukDetailOptions(valueMismatch.published, valueMismatch.config, valueMismatch.details),
    /expected 3 active values but received 2/i
  );
});

test('detail option merge requires exactly one published menu and one matching detail', () => {
  const missingDetail = fixture();
  missingDetail.details.details = missingDetail.details.details.filter(detail => detail.Id !== 'menu-hcx');
  assert.throws(
    () => mergeCukcukDetailOptions(missingDetail.published, missingDetail.config, missingDetail.details),
    /detail for HCX .* resolved to 0 records/i
  );

  const duplicateMenu = fixture();
  duplicateMenu.published.menus.push({ id: 'menu-hcx-copy', cukcukCode: 'HCX', optionTemplateIds: [] });
  assert.throws(
    () => mergeCukcukDetailOptions(duplicateMenu.published, duplicateMenu.config, duplicateMenu.details),
    /product code HCX resolved to 2 published menus/i
  );
});

test('detail option merge rejects duplicate or blank addition ids and invalid prices', () => {
  const duplicate = fixture();
  duplicate.details.details[0].AdditionCategories[0].Additions[1].InActive = false;
  duplicate.details.details[0].AdditionCategories[0].Additions[1].Id = 'hcx-plain';
  duplicate.config.detailOptionSources.HCX.expectedValueCount = 3;
  assert.throws(
    () => mergeCukcukDetailOptions(duplicate.published, duplicate.config, duplicate.details),
    /duplicate addition id hcx-plain/i
  );

  const blank = fixture();
  blank.details.details[0].AdditionCategories[0].Additions[0].Id = '   ';
  assert.throws(
    () => mergeCukcukDetailOptions(blank.published, blank.config, blank.details),
    /addition id is blank or contains whitespace/i
  );

  for (const invalidPrice of [-1, 'not-a-number', null]) {
    const invalid = fixture();
    invalid.details.details[0].AdditionCategories[0].Additions[0].Price = invalidPrice;
    assert.throws(
      () => mergeCukcukDetailOptions(invalid.published, invalid.config, invalid.details),
      /addition hcx-plain has an invalid price/i
    );
  }
});

test('shared CUKCUK groups are replaced with menu-specific Jjapkoba spice levels', () => {
  const fullId = '42257f0b-e1f2-4b69-b7ce-d59d43a69f87';
  const halfId = '2813d1e7-250b-49ae-9f76-e5b40f451492';
  const spiceIds = [
    '3b59138e-b848-41aa-a45d-9fa1b915fbcf',
    'b4ff5c57-e25c-4275-a6a9-4a25ba70e497',
    '90f5ee61-9405-4725-a244-24b23222ee4f'
  ];
  const published = {
    menus: [
      { id: fullId, cukcukCode: '(KX02)', optionTemplateIds: ['shared-spice', 'shared-extras'] },
      { id: halfId, cukcukCode: '(KX14)', optionTemplateIds: ['shared-spice', 'shared-extras'] },
      { id: 'dijinda', cukcukCode: 'DIJINDA', optionTemplateIds: ['shared-spice'] }
    ],
    optionTemplates: [
      { id: 'shared-spice', menuIds: [fullId, halfId, 'dijinda'], values: spiceIds.slice(0, 2).map(id => ({ id })) },
      { id: 'shared-extras', menuIds: [fullId, halfId], values: [{ id: 'legacy-extra' }] }
    ]
  };
  const config = {
    detailOptionSources: {
      '(KX02)': {
        expectedCategoryCount: 2,
        expectedValueCount: 7,
        expectedValueIds: [spiceIds, ['full-extra-1', 'full-extra-2', 'full-extra-3', 'full-extra-4']],
        templateNames: [{ ko: '매운 단계' }, { ko: '짭코바 추가 옵션' }]
      },
      '(KX14)': {
        expectedCategoryCount: 2,
        expectedValueCount: 7,
        expectedValueIds: [spiceIds, ['half-extra-1', 'half-extra-2', 'half-extra-3', 'half-extra-4']],
        templateNames: [{ ko: '매운 단계' }, { ko: '짭코바 반마리 추가 옵션' }]
      }
    },
    menuOptionOverrides: {
      '(KX02)': { rules: { [`cukcuk-detail:${fullId}:0`]: { required: true, minSelections: 1, maxSelections: 1 } } },
      '(KX14)': { rules: { [`cukcuk-detail:${halfId}:0`]: { required: true, minSelections: 1, maxSelections: 1 } } }
    }
  };
  const spice = spiceIds.map((id, index) => ({
    Id: id,
    Description: `${index + 1}단계 | Cấp ${index + 1}`,
    Price: 0,
    InActive: false
  }));
  const detail = (id, prefix) => ({
    Id: id,
    AdditionCategories: [
      { Additions: spice },
      { Additions: Array.from({ length: 4 }, (_, index) => ({
        Id: `${prefix}-extra-${index + 1}`,
        Description: `${prefix} 추가 ${index + 1} | Thêm ${index + 1}`,
        Price: index * 1000,
        InActive: false
      })) }
    ]
  });

  const result = mergeCukcukDetailOptions(published, config, {
    details: [detail(fullId, 'full'), detail(halfId, 'half')]
  });
  const full = result.menus.find(menu => menu.id === fullId);
  const half = result.menus.find(menu => menu.id === halfId);
  const fullSpiceId = `cukcuk-detail:${fullId}:0`;
  const halfSpiceId = `cukcuk-detail:${halfId}:0`;

  assert.deepEqual(full.optionTemplateIds, [fullSpiceId, `cukcuk-detail:${fullId}:1`]);
  assert.deepEqual(half.optionTemplateIds, [halfSpiceId, `cukcuk-detail:${halfId}:1`]);
  assert.deepEqual(full.optionRules[fullSpiceId], { required: true, minSelections: 1, maxSelections: 1 });
  assert.deepEqual(half.optionRules[halfSpiceId], { required: true, minSelections: 1, maxSelections: 1 });
  assert.deepEqual(result.optionTemplates.find(template => template.id === fullSpiceId).values.map(value => value.id), spiceIds);
  assert.deepEqual(result.optionTemplates.find(template => template.id === halfSpiceId).values.map(value => value.id), spiceIds);
  assert.deepEqual(result.optionTemplates.find(template => template.id === `cukcuk-detail:${fullId}:1`).values.map(value => value.id), [
    'full-extra-1', 'full-extra-2', 'full-extra-3', 'full-extra-4'
  ]);
  assert.deepEqual(result.optionTemplates.find(template => template.id === `cukcuk-detail:${halfId}:1`).values.map(value => value.id), [
    'half-extra-1', 'half-extra-2', 'half-extra-3', 'half-extra-4'
  ]);
  assert.deepEqual(result.optionTemplates.find(template => template.id === 'shared-spice').menuIds, ['dijinda']);
  assert.equal(result.optionTemplates.some(template => template.id === 'shared-extras'), false);

  const graphFull = detail(fullId, 'full');
  const tableQrFull = {
    InventoryItemID: fullId,
    InventoryItemAdditionsCategory: graphFull.AdditionCategories.map(category => ({
      InventoryItemAdditions: category.Additions.map(addition => ({
        InventoryItemAdditionID: addition.Id,
        Description: addition.Description,
        UnitPrice: addition.Price,
        Inactive: addition.InActive
      }))
    }))
  };
  const tableQrConfig = {
    ...config,
    detailOptionSources: { '(KX02)': config.detailOptionSources['(KX02)'] },
    menuOptionOverrides: { '(KX02)': config.menuOptionOverrides['(KX02)'] }
  };
  const tableQrResult = mergeCukcukDetailOptions(published, tableQrConfig, { details: [tableQrFull] });
  assert.deepEqual(
    tableQrResult.optionTemplates.find(template => template.id === fullSpiceId).values.map(value => value.id),
    spiceIds
  );
  assert.deepEqual(
    tableQrResult.optionTemplates.find(template => template.id === `cukcuk-detail:${fullId}:1`).values.map(value => value.additionalPrice),
    [0, 1000, 2000, 3000]
  );

  const swapped = { details: [detail(fullId, 'full'), detail(halfId, 'half')] };
  swapped.details[0].AdditionCategories.reverse();
  assert.throws(
    () => mergeCukcukDetailOptions(published, config, swapped),
    /category 0 active value ids do not match/i
  );
});
