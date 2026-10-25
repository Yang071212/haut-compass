import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { updateSnapshot, validateData, SOURCE_URL } from '../scripts/update-snapshot.mjs';

const ROOT = new URL('../public/', import.meta.url);
const PROJECT_BASE = new URL('https://example.github.io/haut-compass/');
const previous = {
  updatedAt: '2026-10-24T01:00:00.000Z', campus: [{ title: '原始校园通知' }],
  projects: [], competitions: [], frontier: [], sources: [],
};
const now = new Date('2026-10-24T02:00:00.000Z');

test('all HTML asset paths stay under a GitHub Pages project prefix and exist', async () => {
  const html = await readFile(new URL('index.html', ROOT), 'utf8');
  const paths = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const target of paths) {
    if (target.startsWith('#') || /^(?:https?:|data:|mailto:)/.test(target)) continue;
    assert.ok(target.startsWith('./'), `Expected relative asset path: ${target}`);
    const resolved = new URL(target, PROJECT_BASE);
    assert.ok(resolved.pathname.startsWith('/haut-compass/'));
    await access(new URL(target.split('#')[0], ROOT));
  }
  assert.match(html, /href="\.\/licenses\.txt"/);
});

test('data requests, SVG sprites, manifest and worker use relative paths', async () => {
  const app = await readFile(new URL('app.js', ROOT), 'utf8');
  assert.match(app, /fetch\('\.\/data\/snapshot\.json'/);
  assert.match(app, /register\('\.\/sw\.js'/);
  assert.match(app, /href="\.\/icons\.svg#/);
  assert.doesNotMatch(app, /fetch\('\/api\//);
  assert.doesNotMatch(app, /(?:href="|register\(')\/(?!\/)/);
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', ROOT), 'utf8'));
  for (const key of ['id', 'start_url', 'scope']) {
    assert.equal(new URL(manifest[key], PROJECT_BASE).pathname, '/haut-compass/');
  }
  for (const icon of manifest.icons) {
    assert.ok(new URL(icon.src, PROJECT_BASE).pathname.startsWith('/haut-compass/'));
    await access(new URL(icon.src, ROOT));
  }
});

test('service worker caches and controls only the project subtree', async () => {
  const sw = await readFile(new URL('sw.js', ROOT), 'utf8');
  const handlers = {};
  const context = {
    URL,
    self: { location: { href: new URL('sw.js', PROJECT_BASE).href }, addEventListener: (event, handler) => { handlers[event] = handler; } },
  };
  vm.runInNewContext(`${sw}\nglobalThis.testBase = BASE.href; globalThis.testAssets = ASSETS;`, context);
  assert.equal(context.testBase, PROJECT_BASE.href);
  for (const asset of context.testAssets) {
    assert.ok(new URL(asset, PROJECT_BASE).pathname.startsWith('/haut-compass/'));
    await access(new URL(asset === './' ? 'index.html' : asset, ROOT));
  }
  let intercepted = false;
  handlers.fetch({ request: { url: 'https://example.github.io/other-project/app.js', method: 'GET' }, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});

async function offlineWorkerResponse(payload) {
  const handlers = {};
  const cached = new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
  vm.runInNewContext(await readFile(new URL('sw.js', ROOT), 'utf8'), {
    URL, Response, Headers,
    fetch: async () => { throw new TypeError('Network unavailable'); },
    caches: { match: async () => cached.clone() },
    self: {
      location: { href: new URL('sw.js', PROJECT_BASE).href },
      addEventListener: (name, handler) => { handlers[name] = handler; },
    },
  });
  let result;
  handlers.fetch({
    request: { method: 'GET', url: new URL('data/snapshot.json', PROJECT_BASE).href, mode: 'cors' },
    respondWith: (promise) => { result = promise; },
  });
  return result;
}

async function interfaceHarness(fetcher, storedData, clock = now) {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, {
      hidden: false, textContent: '', innerHTML: '', dataset: {},
      classList: { toggle() {} }, setAttribute() {}, removeAttribute() {}, addEventListener() {},
      querySelector: (child) => node(`${selector} ${child}`),
    });
    return nodes.get(selector);
  };
  const storage = new Map(storedData ? [['compass-data', JSON.stringify(storedData)]] : []);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock.getTime(); }
  }
  const context = vm.createContext({
    URL, Response, Headers, Date: Clock, fetch: fetcher,
    location: { hash: '' }, navigator: {},
    document: { querySelector: node, querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {} },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: () => 1, clearTimeout() {},
  });
  vm.runInContext(`${await readFile(new URL('app.js', ROOT), 'utf8')}\nglobalThis.testUI={loadData,refresh,getData:()=>state.data};`, context);
  await context.testUI.loadData();
  return { ui: context.testUI, node };
}

test('service worker marks offline JSON without changing its original data timestamp', async () => {
  const response = await offlineWorkerResponse({ ...previous, delivery: { mode: 'mirror' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Compass-Offline'), '1');
  assert.equal(response.headers.get('Content-Type'), 'application/json');
  assert.equal((await response.json()).updatedAt, previous.updatedAt);
});

test('initial offline load from the worker shows a cache warning and never claims a successful refresh', async () => {
  const payload = { ...previous, delivery: { mode: 'mirror' } };
  const { ui, node } = await interfaceHarness(() => offlineWorkerResponse(payload));
  assert.equal(await ui.loadData(), false);
  assert.equal(node('#connection-banner').hidden, false);
  assert.match(node('#connection-banner').innerHTML, /上次缓存的内容/);
  assert.equal(ui.getData().updatedAt, previous.updatedAt);
  await ui.refresh();
  assert.match(node('#toast').textContent, /暂未获取到新的镜像内容/);
  assert.doesNotMatch(node('#toast').textContent, /已重新读取|更新已完成/);
  assert.equal(node('#refresh-button').disabled, false);
});

test('network failure with local saved data shows its age and an unsuccessful refresh message', async () => {
  const { ui, node } = await interfaceHarness(async () => { throw new TypeError('Network unavailable'); }, previous);
  assert.equal(ui.getData().updatedAt, previous.updatedAt);
  assert.match(node('#connection-banner').innerHTML, /上次保存的内容/);
  await ui.refresh();
  assert.match(node('#toast').textContent, /暂未获取到新的镜像内容/);
});

test('network failure without cached data shows the failure instead of a successful refresh toast', async () => {
  const { ui, node } = await interfaceHarness(async () => { throw new TypeError('Network unavailable'); });
  assert.equal(ui.getData(), null);
  await ui.refresh();
  assert.match(node('#content').innerHTML, /暂时没有连上信息源/);
  assert.match(node('#connection-banner').innerHTML, /数据读取失败/);
  assert.match(node('#toast').textContent, /暂未获取到新的镜像内容/);
});

test('successful online reread retains the source timestamp and uses the online refresh message', async () => {
  const { ui, node } = await interfaceHarness(async () => new Response(JSON.stringify({ ...previous, delivery: { mode: 'mirror', checkedAt: now.toISOString() } })));
  assert.equal(await ui.loadData(), true);
  assert.equal(node('#connection-banner').hidden, true);
  assert.equal(ui.getData().updatedAt, previous.updatedAt);
  await ui.refresh();
  assert.match(node('#toast').textContent, /已重新读取镜像内容/);
  assert.match(node('#toast').textContent, /09:30 补同步/);
  assert.match(node('#footer-update').textContent, /原数据更新.*镜像同步/);
  assert.equal(node('#refresh-button span').textContent, '读取镜像');
});

test('HTTP 200 with stale data warns and never claims to have refreshed successfully', async () => {
  const stale = { ...previous, updatedAt: '2026-10-20T00:00:00Z', delivery: { mode: 'mirror' } };
  const { ui, node } = await interfaceHarness(async () => new Response(JSON.stringify(stale)));
  assert.equal(await ui.loadData(), false);
  assert.match(node('#connection-banner').innerHTML, /超过36小时/);
  await ui.refresh();
  assert.match(node('#toast').textContent, /暂未获取到新的镜像内容/);
  assert.equal(ui.getData().updatedAt, stale.updatedAt);
});

test('HTTP 200 with a retained snapshot is not treated as a successful update', async () => {
  const { ui, node } = await interfaceHarness(async () => new Response(JSON.stringify({ ...previous, delivery: { mode: 'snapshot' } })));
  assert.equal(await ui.loadData(), false);
  assert.match(node('#connection-banner').innerHTML, /同步未成功/);
  await ui.refresh();
  assert.match(node('#toast').textContent, /暂未获取到新的镜像内容/);
});

test('incomplete browser data is rejected instead of replacing saved collections', async () => {
  const { ui } = await interfaceHarness(async () => new Response(JSON.stringify({ updatedAt: previous.updatedAt, campus: [] })), previous);
  assert.equal(await ui.loadData(), false);
  assert.equal(ui.getData().campus[0].title, '原始校园通知');
});

test('bundled data has valid collections and its original timestamp', async () => {
  const data = validateData(JSON.parse(await readFile(new URL('data/snapshot.json', ROOT), 'utf8')));
  assert.ok(data.campus.length > 0);
  assert.ok(data.projects.length > 0);
  assert.ok(data.competitions.length > 0);
  assert.ok(data.frontier.length > 0);
  assert.equal(data.schedule.time, '08:30');
});

test('successful mirror fetch validates live data and preserves source timestamps', async () => {
  const source = { ...previous, updatedAt: '2026-10-24T01:30:00.000Z', delivery: { mode: 'live' } };
  const result = await updateSnapshot({ previous, now, fetcher: async (url) => {
    assert.equal(url, SOURCE_URL);
    return new Response(JSON.stringify(source));
  } });
  assert.equal(result.ok, true);
  assert.equal(result.data.updatedAt, source.updatedAt);
  assert.equal(result.data.delivery.mode, 'mirror');
  assert.equal(result.data.delivery.checkedAt, now.toISOString());
  assert.equal(result.data.schedule.time, '08:30');
  assert.equal(result.data.schedule.fallbackTime, '09:30');
});

for (const [label, firstResponse] of [
  ['network timeout', () => { throw new TypeError('Network unavailable'); }],
  ['503', () => new Response('Temporarily unavailable', { status: 503 })],
  ['429', () => new Response('Rate limited', { status: 429 })],
  ['unfinished refresh', () => new Response(JSON.stringify({ ...previous, delivery: { mode: 'live' }, refreshing: true }))],
]) {
  test(`${label} is retried before publishing a complete live response`, async () => {
    let calls = 0;
    const source = { ...previous, delivery: { mode: 'live' }, refreshing: false };
    const result = await updateSnapshot({ previous, now, sleep: async () => {}, fetcher: async () => {
      if (++calls === 1) return firstResponse();
      return new Response(JSON.stringify(source));
    } });
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.equal(result.data.delivery.attempts, 2);
    assert.equal(result.data.refreshing, false);
  });
}

test('exhausted retries preserve old content and do not forge the data timestamp', async () => {
  let calls = 0;
  const result = await updateSnapshot({ previous, now, sleep: async () => {}, fetcher: async () => {
    calls++;
    return new Response('Temporarily unavailable', { status: 503 });
  } });
  assert.equal(calls, 3);
  assert.equal(result.ok, false);
  assert.equal(result.data.updatedAt, previous.updatedAt);
  assert.deepEqual(result.data.campus, previous.campus);
  assert.equal(result.data.delivery.mode, 'snapshot');
});

test('Pages workflow has a later backup sync after the 08:30 primary sync', async () => {
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '30 0 \* \* \*'/);
  assert.match(workflow, /cron: '30 1 \* \* \*'/);
});

for (const [label, fetcher] of [
  ['403', async () => new Response('Blocked', { status: 403 })],
  ['HTML', async () => new Response('<html>Blocked</html>')],
  ['upstream snapshot', async () => new Response(JSON.stringify({ ...previous, delivery: { mode: 'snapshot' } }))],
  ['stale source', async () => new Response(JSON.stringify({ ...previous, updatedAt: '2026-10-20T00:00:00Z', delivery: { mode: 'live' } }))],
  ['future source', async () => new Response(JSON.stringify({ ...previous, updatedAt: '2026-10-28T00:00:00Z', delivery: { mode: 'live' } }))],
  ['date regression', async () => new Response(JSON.stringify({ ...previous, updatedAt: '2026-10-24T00:00:00Z', delivery: { mode: 'live' } }))],
]) {
  test(`${label} retains old content and timestamp with a visible warning`, async () => {
    const result = await updateSnapshot({ previous, now, fetcher });
    assert.equal(result.ok, false);
    assert.equal(result.data.updatedAt, previous.updatedAt);
    assert.deepEqual(result.data.campus, previous.campus);
    assert.equal(result.data.delivery.mode, 'snapshot');
    assert.match(result.data.delivery.warning, /不代表更新成功/);
  });
}

test('all first-party JavaScript parses', async () => {
  for (const target of ['../public/app.js', '../public/sw.js', '../scripts/update-snapshot.mjs']) {
    execFileSync(process.execPath, ['--check', fileURLToPath(new URL(target, import.meta.url))]);
  }
});
