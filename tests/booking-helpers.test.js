const test = require('node:test');
const assert = require('node:assert/strict');

const { buildReservationUrl, shouldFallbackToRedirect } = require('../www/booking-helpers.js');

test('buildReservationUrl builds the official rail reservation URL', () => {
  const url = buildReservationUrl({
    fromStation: '680',
    toStation: '2800',
    date: '2026-04-15',
    time: '08:30',
    trainNumber: '1234',
    scheduleType: '1',
    trainType: 'empty',
  });

  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://www.rail.co.il');
  assert.equal(parsed.searchParams.get('page'), 'trip-reservation');
  assert.equal(parsed.searchParams.get('fromStation'), '680');
  assert.equal(parsed.searchParams.get('toStation'), '2800');
  assert.equal(parsed.searchParams.get('date'), '2026-04-15');
  assert.equal(parsed.searchParams.get('time'), '08:30');
  assert.equal(parsed.searchParams.get('trainNumber'), '1234');
});

test('Cloudflare 403 and network errors fall back to redirect mode', () => {
  assert.equal(
    shouldFallbackToRedirect(new Error('HTTP 403: <title>Attention Required! | Cloudflare</title>')),
    true
  );

  assert.equal(shouldFallbackToRedirect(new Error('fetch failed')), true);
  assert.equal(shouldFallbackToRedirect(new Error('HTTP 401: Unauthorized')), false);
});
