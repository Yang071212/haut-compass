import test from 'node:test';
import assert from 'node:assert/strict';
import { chinaDay, shouldSaveSnapshot, updateSnapshot } from '../scripts/update-snapshot.mjs';

const previous = {
  updatedAt: '2026-10-27T00:05:00.000Z',
  campus: [{ title: 'Yesterday' }], projects: [], competitions: [], frontier: [], sources: [],
  schedule: { enabled: true, time: '08:30', fallbackTime: '09:17', fallbackUntil: '23:17', retryIntervalMinutes: 60, timezone: 'Asia/Shanghai', timing: 'best-effort' },
  delivery: { mode: 'mirror', checkedAt: '2026-10-27T00:30:00.000Z', upstreamMode: 'live', attempts: 1 },
};
const now = new Date('2026-10-28T01:00:00.000Z');
const response = (data) => new Response(JSON.stringify({ ...data, delivery: { mode: 'live' } }));

test('freshness uses Shanghai midnight rather than the UTC date', () => {
  assert.equal(chinaDay('2026-10-27T15:59:59Z'), '2026-10-27');
  assert.equal(chinaDay('2026-10-27T16:00:00Z'), '2026-10-28');
});

test('a successful HTTP response with yesterday data is not a successful daily sync', async () => {
  const result = await updateSnapshot({ previous, now, requireCurrentDay: true, maxAttempts: 1, fetcher: async () => response(previous) });
  assert.equal(result.ok, false);
  assert.equal(result.data.updatedAt, previous.updatedAt);
  assert.equal(result.data.delivery.mode, 'snapshot');
  assert.ok(result.data.delivery.warning);
});

test('catch-up retries an unfinished daily source and accepts the completed current day', async () => {
  let calls = 0;
  const fresh = { ...previous, updatedAt: '2026-10-28T00:05:42.000Z', campus: [{ title: 'Today' }] };
  const result = await updateSnapshot({ previous, now, requireCurrentDay: true, maxAttempts: 2, sleep: async () => {}, fetcher: async () => response(++calls === 1 ? previous : fresh) });
  assert.equal(result.ok, true);
  assert.equal(result.data.updatedAt, fresh.updatedAt);
  assert.equal(result.data.delivery.attempts, 2);
  assert.equal(result.data.schedule.fallbackUntil, '23:17');
});

test('hourly checks do not rewrite a snapshot solely to advance its check time', () => {
  assert.equal(shouldSaveSnapshot(previous, { ...previous, delivery: { ...previous.delivery, checkedAt: now.toISOString(), attempts: 2 } }), false);
});

test('a real content change is published even if the upstream timestamp stays the same', () => {
  assert.equal(shouldSaveSnapshot(previous, { ...previous, projects: [{ repo: 'example/updated', stars: 10 }] }), true);
});

test('a newly failed or recovered source updates the visible warning', () => {
  const failed = { ...previous, delivery: { ...previous.delivery, mode: 'snapshot', warning: 'Last attempt failed' } };
  assert.equal(shouldSaveSnapshot(previous, failed), true);
  assert.equal(shouldSaveSnapshot(failed, previous), true);
});
