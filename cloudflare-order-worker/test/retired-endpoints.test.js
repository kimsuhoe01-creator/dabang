import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

test('retired voice-order endpoints return 404 while the worker remains healthy', async () => {
  for (const path of ['/api/voice/realtime', '/api/voice/interpret']) {
    const response = await worker.fetch(new Request('https://worker.test' + path, {
      method: 'POST',
      headers: { Origin: 'https://kimsuhoe01-creator.github.io' }
    }), {});
    assert.equal(response.status, 404, path);
  }
  const health = await worker.fetch(new Request('https://worker.test/health'), {});
  assert.equal(health.status, 200);
});
