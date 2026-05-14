const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldServeStatusPage, buildStatusPayload } = require('../cloudflare-worker/worker-helpers.cjs');

test('GET on root shows a worker status page; GET on API paths proxies upstream', () => {
  // root + health: status page
  assert.equal(shouldServeStatusPage('GET', '/'), true);
  assert.equal(shouldServeStatusPage('GET'), true); // default path "/"
  assert.equal(shouldServeStatusPage('GET', '/health'), true);
  assert.equal(shouldServeStatusPage('GET', '/health/'), true);
  // API paths (e.g. searchTrain GET): proxied, not intercepted
  assert.equal(shouldServeStatusPage('GET', '/rjpa/api/v1/timetable/searchTrain'), false);
  assert.equal(shouldServeStatusPage('GET', '/common/api/v1/Otp/Send'), false);
  // POST always proxied
  assert.equal(shouldServeStatusPage('POST'), false);
  assert.equal(shouldServeStatusPage('POST', '/'), false);
});

test('status payload explains that the worker is alive and waiting for POST API calls', () => {
  const payload = buildStatusPayload('/VerifyOtp');

  assert.equal(payload.ok, true);
  assert.equal(payload.path, '/VerifyOtp');
  assert.match(payload.message, /Worker is running/i);
  assert.match(payload.usage, /POST/i);
});
