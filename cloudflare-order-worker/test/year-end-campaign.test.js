import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../../',import.meta.url);
const source=fs.readFileSync(new URL('assets/year-end-campaign.js',root),'utf8');
const context={Intl,Date};
vm.runInNewContext(source,context);
const campaign=context.DABANG_YEAR_END;

test('year-end promotion follows Vietnam dates and stops after December',()=>{
  assert.equal(campaign.activeAt(new Date('2026-11-25T16:59:59Z')),false);
  assert.equal(campaign.activeAt(new Date('2026-11-25T17:00:00Z')),true);
  assert.equal(campaign.activeAt(new Date('2026-12-31T16:59:59Z')),true);
  assert.equal(campaign.activeAt(new Date('2026-12-31T17:00:00Z')),false);
});

test('all four languages promote the two live combo codes',()=>{
  assert.deepEqual(Array.from(campaign.codes),['COMBOFAMILY599','COMBOCOUPLE289']);
  for(const lang of ['ko','vi','zh','en']){
    assert.ok(campaign.copy[lang].nav);
    assert.ok(campaign.copy[lang].description);
    assert.ok(campaign.copy[lang].action);
  }
  const config=JSON.parse(fs.readFileSync(new URL('data/cukcuk-table-qr-layout.json',root),'utf8'));
  assert.equal(config.menuNameOverrides.COMBOFAMILY599.ko,'패밀리 콤보');
});
