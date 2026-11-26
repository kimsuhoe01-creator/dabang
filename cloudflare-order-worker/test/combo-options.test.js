import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { validateAndBuildOrder } from '../src/order.js';

const root = new URL('../../', import.meta.url);
const catalog = JSON.parse(fs.readFileSync(new URL('data/cukcuk-menu.json', root), 'utf8'));
const browserScript = fs.readFileSync(new URL('assets/combo-options.js', root), 'utf8');
const browser = { window: {} };
vm.runInNewContext(browserScript, browser);
const comboUI = browser.window.DABANG_COMBO_OPTIONS;
const menu = code => catalog.menus.find(item => item.cukcukCode === code);
const groups = item => item.optionTemplateIds.map(id => catalog.optionTemplates.find(template => template.id === id));
const selected = (item, ids) => ids.map(id => {
  const template = groups(item).find(group => group.values.some(value => value.id === id));
  assert.ok(template, `missing CUKCUK addition ${id}`);
  return { templateId: template.id, valueId: id };
});
const order = (code, ids) => {
  const item = menu(code);
  return validateAndBuildOrder({
    clientOrderId: 'combo-order-1',
    table: { id: 'table-1', name: 'A-1' },
    items: [{ menuId: item.id, quantity: 1, options: selected(item, ids) }]
  }, catalog, 'branch-1');
};

const bone = 'f688cfab-85e2-4a3c-84ea-48cd2b56fcf7';
const boneless = '6e0215ac-2c13-4f72-9b1d-fd47691e0627';
const wings = 'a99769de-2e48-437e-814a-30c3dd3e3d59';
const jjapkoba = 'b948e319-8ef2-483c-92e9-768be31535ef';
const normal = ['9b8f3856-60ff-4d08-b111-9e87ea20e22e', '5b311b20-6191-403f-8612-08cf8648b49d'];
const wingFlavors = ['18be4708-e8af-476b-a8f0-d575157450f0', '22731f9b-95ae-4fc2-9dc2-bbd3ced496b7'];
const spicySoup = '92987c76-3de9-4491-98f9-508013c0fe9e';
const regularUdon = 'd067d9f5-70b7-4a28-9b01-6914ed4f0b66';
const spicyUdon = '36e1c914-9c90-4746-9c4a-cb01c6585cea';
const spiceLevel2 = 'b4ff5c57-e25c-4275-a6a9-4a25ba70e497';

test('family and couple combo catalog points to live QR products and poster images', () => {
  for (const [code, id, price] of [
    ['COMBOFAMILY599', '185b4e50-fb4e-477e-8793-caf45dc7024c', 599000],
    ['COMBOCOUPLE289', '147fbd38-5b27-409d-b2a1-9abee13015e3', 289000]
  ]) {
    const item = menu(code);
    assert.equal(item.id, id);
    assert.equal(item.price, price);
    assert.equal(item.available, true);
    assert.equal(item.optionTemplateIds.length, code === 'COMBOFAMILY599' ? 7 : 8);
    assert.ok(fs.existsSync(new URL(`assets/menu/${id}.png`, root)));
  }
});

test('tablet combo choices show only the matching flavor group', () => {
  for (const code of ['COMBOFAMILY599', 'COMBOCOUPLE289']) {
    const item = menu(code);
    const options = comboUI.build(item, groups(item), catalog.optionTemplates);
    assert.equal(options[0].comboRole, 'type');
    assert.equal(options[1].values.length, 10);
    assert.equal(options[2].values.length, 8);
    assert.equal(options[1].maxSelections, code === 'COMBOFAMILY599' ? 2 : 1);
    const prepared = options.map(group => ({ ...group, _values: group.values }));
    for (const [typeId, normalVisible, wingsVisible] of [[bone, true, false], [wings, false, true]]) {
      const selections = [[typeId], [], [], []];
      assert.equal(comboUI.active(prepared[1], prepared, selections), normalVisible);
      assert.equal(comboUI.active(prepared[2], prepared, selections), wingsVisible);
    }
    if (code === 'COMBOCOUPLE289') {
      assert.equal(comboUI.active(prepared[1], prepared, [[jjapkoba], [], [], []]), false);
      assert.equal(comboUI.active(prepared[2], prepared, [[jjapkoba], [], [], []]), false);
      assert.equal(comboUI.active(prepared[4], prepared, [[jjapkoba], [], [], [], []]), true);
      assert.equal(comboUI.active(prepared[4], prepared, [[bone], [], [], [], []]), false);
    }
  }
});

test('family combo sends one type, two matching flavors, and optional spicy soup', () => {
  const regular = order('COMBOFAMILY599', [bone, ...normal]);
  assert.equal(regular.OrderDetails[0].Price, 599000);
  assert.equal(regular.OrderDetails.length, 4);
  assert.equal(order('COMBOFAMILY599', [wings, ...wingFlavors, spicySoup]).OrderDetails.length, 5);
  assert.throws(() => order('COMBOFAMILY599', [bone, normal[0]]), /맛/);
  assert.throws(() => order('COMBOFAMILY599', [wings, wingFlavors[0], normal[0]]), /맛/);
  assert.throws(() => order('COMBOFAMILY599', [bone, boneless, ...normal]), /종류/);
});

test('couple combo accepts half chicken or jjapkoba, one udon flavor, and rejects mixed choices', () => {
  const standard = order('COMBOCOUPLE289', [boneless, normal[0], regularUdon]);
  assert.equal(standard.OrderDetails[0].Price, 289000);
  assert.equal(standard.OrderDetails.length, 4);
  assert.equal(order('COMBOCOUPLE289', [wings, wingFlavors[0], spicyUdon]).OrderDetails.length, 4);
  assert.equal(order('COMBOCOUPLE289', [jjapkoba, regularUdon, spiceLevel2]).OrderDetails.length, 4);
  assert.throws(() => order('COMBOCOUPLE289', [jjapkoba, normal[0], regularUdon, spiceLevel2]), /맛/);
  assert.throws(() => order('COMBOCOUPLE289', [jjapkoba, regularUdon]), /매운 단계/);
  assert.throws(() => order('COMBOCOUPLE289', [boneless, normal[0]]), /국물/);
  assert.throws(() => order('COMBOCOUPLE289', [boneless, normal[0], regularUdon, spicyUdon]), /국물/);
});
