import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateAndBuildOrder } from '../src/order.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../../data/cukcuk-menu.json', import.meta.url), 'utf8'));
const menuId = '57b1fe70-fe33-4654-9d58-575f277749be';
const templateId = `cukcuk-detail:${menuId}:0`;
const size330 = 'dc46801f-c5c7-4b94-82f0-014b2c1aad69';
const size640 = '38465a50-9825-4244-8887-bbc1fd87efbd';

test('A02 sends 330cc x2 and 640cc x1 as independent parent and addition quantities', () => {
  const order = validateAndBuildOrder({
    clientOrderId: 'sapporo-quantity-proof',
    orderedAt: '2026-08-30T14:00:00.000Z',
    language: 'ko',
    table: { id: 'table-1', name: 'A-1' },
    items: [
      { menuId, quantity: 2, options: [{ templateId, valueId: size330 }] },
      { menuId, quantity: 1, options: [{ templateId, valueId: size640 }] }
    ]
  }, catalog, 'branch-1');

  assert.equal(order.OrderDetails.length, 4);
  const [parent330, addition330, parent640, addition640] = order.OrderDetails;
  assert.deepEqual([parent330.ItemId, parent330.Quantity, parent330.Price], [menuId, 2, 0]);
  assert.deepEqual([addition330.AdditionId, addition330.Quantity, addition330.Price], [size330, 2, 77000]);
  assert.equal(addition330.ParentId, parent330.Id);
  assert.deepEqual([parent640.ItemId, parent640.Quantity, parent640.Price], [menuId, 1, 0]);
  assert.deepEqual([addition640.AdditionId, addition640.Quantity, addition640.Price], [size640, 1, 165000]);
  assert.equal(addition640.ParentId, parent640.Id);
  assert.notEqual(parent330.Id, parent640.Id);
  assert.equal(order.OrderDetails.reduce((sum,detail) => sum + detail.Quantity * detail.Price, 0), 319000);
});
