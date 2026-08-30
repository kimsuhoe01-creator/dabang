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
