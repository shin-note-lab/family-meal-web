import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const html = read('index.html');
const edge = read('supabase/functions/family-meal-notion-primary/index.ts');
const origin = 'https://shin-note-lab.github.io';
const pageId = '11111111-1111-1111-1111-111111111111';

// No host fetch is exposed: every unexpected network request fails the test.
function harness({ confirmed = true, role = 'member', sameFamily = true } = {}) {
  let handler;
  const calls = [];
  let page = { id: pageId, parent: { data_source_id: '61e16ebf-d39a-4989-9c6b-a23f0c3a8524' }, properties: {} };
  const reply = x => new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } });
  const fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.includes('/auth/v1/user')) return reply({ id: 'fake-user', email_confirmed_at: confirmed ? '2026-01-01' : null });
    if (url.includes('/rest/v1/family_members?')) return reply(role ? [{ role, family_id: 'fake-family' }] : []);
    if (url.includes('/rest/v1/family_app_scope?')) return reply([{ family_id: sameFamily ? 'fake-family' : 'other-family' }]);
    if (url === 'https://recipes.example.test/dish') return new Response('<img src="https://images.example.test/dish.jpg">', { headers: { 'Content-Type': 'text/html' } });
    if (url === 'https://images.example.test/dish.jpg') return new Response(new Uint8Array(150), { headers: { 'Content-Type': 'image/jpeg' } });
    if (url.endsWith('/file_uploads')) return reply({ id: 'fake-upload' });
    if (url.endsWith('/file_uploads/fake-upload/send')) return reply({ status: 'uploaded' });
    if (url.includes('/data_sources/') && url.endsWith('/query')) return reply({ results: [page], has_more: false });
    if (url.endsWith('/pages') && opts.method === 'POST') {
      page.properties = JSON.parse(opts.body).properties;
      return reply(page);
    }
    if (url.endsWith('/pages/' + pageId)) {
      if (opts.method === 'PATCH') {
        const props = JSON.parse(opts.body).properties;
        if (props['料理写真']?.files?.[0]?.file_upload) props['料理写真'] = { files: [{ file: { url: 'https://files.example.test/saved.jpg' } }] };
        Object.assign(page.properties, props);
      }
      // Notion includes plain_text in its read response.
      for (const p of Object.values(page.properties)) for (const k of ['title', 'rich_text']) if (p[k]) p[k] = p[k].map(x => ({ ...x, plain_text: x.text.content }));
      return reply(page);
    }
    throw Error('Unexpected mocked network request');
  };
  const context = vm.createContext({ URL, Response, Request, Headers, AbortSignal, Uint8Array, FormData, Blob, atob, crypto: globalThis.crypto, console: { error() {} }, fetch,
    Deno: { env: { get: k => k === 'SUPABASE_URL' ? 'https://backend.example.test' : 'fake-test-secret' }, serve: fn => { handler = fn; } } });
  vm.runInContext(edge, context);
  return { context, calls, invoke: (body, headers = {}, method = 'POST') => handler(new Request('https://gateway.example.test', { method, headers: { Origin: origin, Authorization: 'Bearer fake-session', 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })) };
}

test('all inline scripts, service worker and Edge snapshot parse', () => {
  let count = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=|application\/ld\+json|application\/json/i.test(m[1])) continue;
    new vm.Script(m[2]); count++;
  }
  assert.ok(count > 0);
  new vm.Script(read('sw.js'));
  new vm.Script(edge);
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.scope, './');
  assert.equal(manifest.start_url, './');
});

test('frontend meal slots retain latest row without modifying input', () => {
  const code = html.slice(html.indexOf('function latestBySlot('), html.indexOf('function slotRows('));
  const context = vm.createContext({});
  vm.runInContext(code, context);
  const rows = [{ id: 'a', meal_date: '2026-11-01', meal_type: '朝', updated_at: '2026-10-01' }, { id: 'b', meal_date: '2026-11-01', meal_type: '朝', updated_at: '2026-10-02' }];
  const result = context.latestBySlot(rows);
  assert.equal(result.length, 1); assert.equal(result[0].id, 'b'); assert.equal(rows.length, 2);
});

test('URL guards reject unsafe literal destinations and credentials', () => {
  const h = harness();
  for (const raw of ['http://example.test', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://user:pass@example.test', 'https://example.test:444', 'https://host.internal']) assert.throws(() => h.context.publicHttps(raw));
  assert.equal(h.context.publicHttps('https://recipes.example.test/dish').hostname, 'recipes.example.test');
});

test('recipe candidates resolve relative paths and remove duplicates', () => {
  const h = harness();
  const result = h.context.recipePhotoCandidates('<img src="/a.jpg"><img src="/a.jpg"><img src="http://bad.test/a.jpg">', 'https://recipes.example.test/dish');
  assert.deepEqual(Array.from(result), ['https://recipes.example.test/a.jpg']);
});

test('CORS rejects foreign origins before any fetch; OPTIONS is read only', async () => {
  const h = harness();
  assert.equal((await h.invoke({}, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.invoke({}, {}, 'OPTIONS')).status, 204);
  assert.equal(h.calls.length, 0);
});

test('unconfirmed users, nonmembers and other families cannot reach Notion', async () => {
  for (const config of [{ confirmed: false }, { role: null }, { sameFamily: false }]) {
    const h = harness(config); const res = await h.invoke({ table: 'foods', action: 'list' });
    assert.ok([401, 403].includes(res.status));
    assert.ok(h.calls.every(x => !x.url.includes('api.notion.com')));
  }
});

test('member cannot invite or enumerate family members', async () => {
  const h = harness();
  for (const action of ['family_invite', 'family_members_list']) assert.equal((await h.invoke({ action })).status, 403);
});

test('recipe preview requires valid table and HTTPS URL', async () => {
  const h = harness();
  for (const body of [{ table: 'menus', recipe_url: 'https://recipes.example.test/dish' }, { table: 'foods', recipe_url: 'http://recipes.example.test/dish' }]) assert.equal((await h.invoke({ action: 'recipe_photo_preview_url', ...body })).status, 400);
  const res = await h.invoke({ action: 'recipe_photo_preview_url', table: 'foods', recipe_url: 'https://recipes.example.test/dish' });
  assert.equal(res.status, 200); assert.deepEqual((await res.json()).image_urls, ['https://images.example.test/dish.jpg']);
});

test('mocked food create/edit, selected photo upload and reread preserve preferences', async () => {
  const h = harness();
  const row = { name: '架空の料理', recipe_url: 'https://recipes.example.test/dish', categories: ['副菜'], ryo_preference: '好き', aoi_preference: '未確認' };
  assert.equal((await h.invoke({ table: 'foods', action: 'create', row })).status, 200);
  assert.equal((await h.invoke({ table: 'foods', action: 'update', id: pageId, row: { ...row, name: '架空の料理・編集' } })).status, 200);
  const bad = await h.invoke({ table: 'foods', action: 'recipe_photo_external', id: pageId, image_url: 'https://images.example.test/not-a-candidate.jpg' });
  assert.equal(bad.status, 409);
  assert.equal((await h.invoke({ table: 'foods', action: 'recipe_photo_external', id: pageId, image_url: 'https://images.example.test/dish.jpg' })).status, 200);
  const res = await h.invoke({ table: 'foods', action: 'list' }); const saved = (await res.json()).rows[0];
  assert.equal(saved.name, '架空の料理・編集'); assert.equal(saved.photo_url, 'https://files.example.test/saved.jpg');
  assert.equal(saved.photo_source, row.recipe_url); assert.equal(saved.ryo_preference, '好き'); assert.equal(saved.aoi_preference, '未確認');
});

test('PWA ignores API requests and uses navigation fallback with a mocked cache', async () => {
  const handlers = {}; const calls = [];
  const context = vm.createContext({ URL, self: { location: { origin }, addEventListener: (type, fn) => { handlers[type] = fn; } },
    caches: { match: async key => { calls.push(key); return 'offline-page'; } }, fetch: async () => { throw Error('offline'); } });
  vm.runInContext(read('sw.js'), context);
  handlers.fetch({ request: { url: 'https://backend.example.test/api', method: 'GET' }, respondWith() { assert.fail('API must not be cached'); } });
  let response;
  handlers.fetch({ request: { url: origin + '/family-meal-web/', method: 'GET', mode: 'navigate' }, respondWith(p) { response = p; } });
  assert.equal(await response, 'offline-page'); assert.deepEqual(calls, ['./index.html']);
});
