// End-to-end test: local mode, v1 migration, and two-device Google Drive sync.
// Google is faked: a stub GIS script and an in-memory Drive (no real account or network needed).
// Run from the repo root: node tests/e2e.js   (needs Playwright + Chromium; see CLAUDE.md)
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fwlib-e2e-'));
const RAW = fs.readFileSync(path.join(ROOT, 'framework-library.html'), 'utf8');
const WITH_ID = RAW.replace("var GOOGLE_CLIENT_ID = '';", "var GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';");
assert(WITH_ID !== RAW, 'client id placeholder not found');
const ORIGIN = 'https://plms.test';

// ---------- fake Drive ----------
const drive = { files: {}, seq: 0, calls: [], fail401: false };
function listFiles() { return Object.values(drive.files).map(f => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime })); }
function touch(f) { f.modifiedTime = new Date(Date.now() + (drive.seq++)).toISOString(); }
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' };
async function driveHandler(route) {
  const req = route.request(), url = new URL(req.url()), m = req.method();
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  drive.calls.push(m + ' ' + url.pathname);
  const auth = (await req.allHeaders())['authorization'] || '';
  if (!auth.startsWith('Bearer tok-') || drive.fail401) return route.fulfill({ status: 401, headers: CORS, body: '{"error":"unauth"}' });
  const json = (o, st = 200) => route.fulfill({ status: st, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
  let mm;
  if (url.pathname === '/drive/v3/about') return json({ user: { emailAddress: 'tester@example.com' } });
  if (url.pathname === '/drive/v3/files' && m === 'GET') { assert.equal(url.searchParams.get('spaces'), 'appDataFolder'); return json({ files: listFiles() }); }
  if ((mm = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/))) {
    const f = drive.files[mm[1]]; if (!f) return json({ error: 'nf' }, 404);
    if (m === 'GET') { assert.equal(url.searchParams.get('alt'), 'media'); return route.fulfill({ status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: f.content }); }
    if (m === 'DELETE') { delete drive.files[mm[1]]; return route.fulfill({ status: 204, headers: CORS }); }
  }
  if (url.pathname === '/upload/drive/v3/files' && m === 'POST') {
    assert.equal(url.searchParams.get('uploadType'), 'multipart');
    const ct = req.headers()['content-type']; const b = ct.match(/boundary=(.+)$/)[1];
    const parts = req.postData().split('--' + b).filter(p => p && p !== '--' && p.trim() !== '--');
    const body = p => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '');
    const meta = JSON.parse(body(parts[0])), content = body(parts[1]);
    JSON.parse(content);
    assert.deepEqual(meta.parents, ['appDataFolder']);
    const id = 'f' + (++drive.seq); drive.files[id] = { id, name: meta.name, content }; touch(drive.files[id]);
    return json({ id });
  }
  if ((mm = url.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/)) && m === 'PATCH') {
    const f = drive.files[mm[1]]; if (!f) return json({ error: 'nf' }, 404);
    JSON.parse(req.postData()); f.content = req.postData(); touch(f); return json({ id: f.id });
  }
  return json({ error: 'unhandled ' + m + ' ' + url.pathname }, 400);
}
const GIS = `window.google={accounts:{oauth2:{
  initTokenClient:function(cfg){ window.__cfg=cfg; return {requestAccessToken:function(o){ window.__reqs=(window.__reqs||[]).concat([o]);
    setTimeout(function(){ cfg.callback({access_token:'tok-'+Date.now(), expires_in:3600, scope:cfg.scope}); }, 20); }}; },
  hasGrantedAllScopes:function(r,s){ return (r.scope||'').split(' ').indexOf(s)>=0; }
}}};`;

function stateDoc() { const f = Object.values(drive.files).find(f => f.name === 'state.json'); return f && JSON.parse(f.content); }
function names() { return Object.values(drive.files).map(f => f.name).sort(); }

async function device(browser, html) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: GIS }));
  await ctx.route('https://www.googleapis.com/**', driveHandler);
  await ctx.route(ORIGIN + '/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  return page;
}
const book = f => path.join(ROOT, 'Books', f);
async function importBooks(page, files) { await page.setInputFiles('#filein', files.map(book)); await page.waitForTimeout(200); }
async function waitSync(page) { await page.waitForFunction(() => { const b = document.querySelector('#syncbtn'); return b && !b.hidden && b.dataset.s !== 'busy'; }, null, { timeout: 5000 }); await page.waitForTimeout(50); return page.$eval('#syncbtn', b => b.dataset.s); }
async function state(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('fwlib.v1'))); }
async function addCat(page, bookId, text) {
  await page.goto(ORIGIN + '/framework-library.html#/book/' + bookId);
  await page.click('#addcat'); await page.fill('#catin', text); await page.press('#catin', 'Enter');
}

(async () => {
  const browser = await chromium.launch();
  let ok = 0; const pass = m => { ok++; console.log('PASS', m); };

  // ---------- 1. local-only mode (no client id) ----------
  let p = await device(browser, RAW);
  await p.goto(ORIGIN + '/framework-library.html');
  assert.equal(await p.textContent('.greet'), 'Your shelf is empty.');
  assert.equal(await p.$$eval('.shelf .book', x => x.length), 0);
  pass('no books by default');
  await importBooks(p, ['frameworks-101.json', 'nist-csf-2.json', 'nist-ai-rmf.json']);
  assert.equal(await p.$$eval('.shelf .book', x => x.length), 3);
  assert.equal(await p.$('.chips'), null, 'no chips without categories');
  await addCat(p, 'nist-csf-2', 'NIST, Security');
  await addCat(p, 'nist-ai-rmf', 'nist, AI');   // "nist" must reuse existing "NIST"
  let st = await state(p);
  assert.deepEqual(st.lib['nist-csf-2'].cats, ['NIST', 'Security']);
  assert.deepEqual(st.lib['nist-ai-rmf'].cats, ['NIST', 'AI']);
  pass('categories added, case-insensitive reuse');
  await p.goto(ORIGIN + '/framework-library.html#/');
  const chips = await p.$$eval('.chips .chip', x => x.map(c => c.textContent.trim()));
  assert.deepEqual(chips, ['All 3', 'AI 1', 'NIST 2', 'Security 1', 'Uncategorised 1']);
  await p.click('.chips .chip[data-f="NIST"]');
  assert.equal(await p.$$eval('.shelf .book', x => x.length), 2);
  assert.equal(await p.textContent('.shelf-head h2'), 'NIST');
  await p.click('.chips .chip:has-text("Uncategorised")');
  assert.deepEqual(await p.$$eval('.shelf .book .ct', x => x.map(e => e.textContent)), ['Frameworks 101']);
  await p.reload();
  assert.equal(await p.textContent('.shelf-head h2'), 'Uncategorised', 'filter persists');
  pass('filter chips + persistence');
  // remove a category from a book via x
  await p.goto(ORIGIN + '/framework-library.html#/book/nist-csf-2');
  await p.click('[data-rc="Security"]');
  assert.deepEqual((await state(p)).lib['nist-csf-2'].cats, ['NIST']);
  // tapping a tag on the book page opens the library filtered by it
  await p.click('#catrow a[data-f="NIST"]'); await p.waitForTimeout(100);
  assert.equal(await p.textContent('.shelf-head h2'), 'NIST');
  pass('remove category + tag link filters library');
  // read, unread, resume
  await p.goto(ORIGIN + '/framework-library.html#/book/frameworks-101');
  await p.click('.bookhead .btn.primary'); await p.click('#nextbtn'); await p.waitForTimeout(100);
  st = await state(p);
  const doneKeys = Object.keys(st.books['frameworks-101'].done);
  assert.equal(doneKeys.length, 1); assert(st.books['frameworks-101'].done[doneKeys[0]] > 0);
  await p.goto(ORIGIN + '/framework-library.html#/read/frameworks-101/' + doneKeys[0]);
  await p.click('#unread');
  st = await state(p); assert(st.books['frameworks-101'].done[doneKeys[0]] < 0, 'unread stored as negative time');
  await p.goto(ORIGIN + '/framework-library.html#/book/frameworks-101');
  assert.equal(await p.$$eval('.tick.on', x => x.length), 0);
  pass('read / unread');
  // export book includes categories
  const [dl] = await Promise.all([p.waitForEvent('download'), (async () => { await p.goto(ORIGIN + '/framework-library.html#/book/nist-ai-rmf'); await p.click('#expbook'); })()]);
  const exported = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert.deepEqual(exported.categories, ['NIST', 'AI']);
  pass('export includes categories');
  // settings shows not-configured
  await p.goto(ORIGIN + '/framework-library.html#/settings');
  assert((await p.textContent('.set')).includes('Sync is not set up'));
  assert(await p.$eval('#syncbtn', b => b.hidden));
  // JSON categories on import
  const tmpBook = JSON.parse(fs.readFileSync(book('book-template.json'), 'utf8'));
  tmpBook.id = 'cat-test'; tmpBook.categories = ['Cloud', ' Cloud ', 'Governance'];
  fs.writeFileSync(path.join(TMP, 'cat-test.json'), JSON.stringify(tmpBook));
  await p.setInputFiles('#filein', path.join(TMP, 'cat-test.json')); await p.waitForTimeout(200);
  assert.deepEqual((await state(p)).lib['cat-test'].cats, ['Cloud', 'Governance']);
  pass('categories read from book JSON');
  assert.deepEqual(p.errors, []);
  await p.context().close();

  // ---------- 2. migration from the old v1 format ----------
  p = await device(browser, RAW);
  await p.goto(ORIGIN + '/framework-library.html');
  const csf = JSON.parse(fs.readFileSync(book('nist-csf-2.json'), 'utf8'));
  const sec = csf.chapters[0].id + '/' + csf.chapters[0].sections[0].id;
  await p.evaluate(([b, sec]) => localStorage.setItem('fwlib.v1', JSON.stringify({ v: 1, books: { 'nist-csf-2': { done: { [sec]: 1700000000000 }, last: { c: sec.split('/')[0], s: sec.split('/')[1], y: 0 }, quiz: {}, cards: {} }, 'nist-800-53': { done: { 'x/y': 1 }, quiz: {}, cards: {} } }, imported: [b], lastBook: 'nist-csf-2', theme: 'dark' })), [csf, sec]);
  await p.reload();
  assert.equal(await p.$$eval('.shelf .book', x => x.length), 1);
  assert(await p.$('.resume'), 'resume card shown for migrated progress');
  assert.equal(await p.getAttribute('html', 'data-theme'), 'dark');
  await importBooks(p, ['nist-800-53.json']); // formerly built-in: progress re-attaches
  st = await state(p);
  assert.equal(st.v, 2); assert.equal(st.lib['nist-csf-2'].rev, 1);
  assert(st.books['nist-800-53'].done['x/y'], 'old progress kept for re-imported book');
  pass('v1 data migrates; re-imported book keeps old progress');
  assert.deepEqual(p.errors, []);
  await p.context().close();

  // ---------- 3. file:// with a client id ----------
  const fp = path.join(TMP, 'fl-file.html');
  fs.writeFileSync(fp, WITH_ID);
  p = await device(browser, WITH_ID);
  await p.goto('file://' + fp + '#/settings');
  assert((await p.textContent('.set')).includes('needs the app to be opened from its web address'));
  pass('file:// explains https requirement');
  await p.context().close();

  // ---------- 4. two devices syncing ----------
  const A = await device(browser, WITH_ID), B = await device(browser, WITH_ID);
  await A.goto(ORIGIN + '/framework-library.html');
  await importBooks(A, ['frameworks-101.json', 'nist-ai-rmf.json']);
  await addCat(A, 'nist-ai-rmf', 'NIST, AI');
  await A.goto(ORIGIN + '/framework-library.html#/book/frameworks-101');
  await A.click('.bookhead .btn.primary'); await A.click('#nextbtn'); await A.click('#nextbtn'); await A.waitForTimeout(100);
  await A.goto(ORIGIN + '/framework-library.html#/settings');
  await A.waitForFunction(() => window.google);
  await A.click('#gconnect');
  assert.equal(await waitSync(A), 'ok');
  assert.deepEqual(names(), ['book-frameworks-101.json', 'book-nist-ai-rmf.json', 'state.json']);
  let sd = stateDoc();
  assert.deepEqual(sd.lib['nist-ai-rmf'].cats, ['NIST', 'AI']);
  assert.equal(Object.values(sd.progress['frameworks-101'].done).filter(v => v > 0).length, 2);
  assert((await A.textContent('.set')).includes('tester@example.com'));
  assert.equal((await A.evaluate(() => window.__reqs))[0].prompt, 'select_account');
  pass('A connects and uploads library, categories, progress');

  await B.goto(ORIGIN + '/framework-library.html');
  await importBooks(B, ['nist-csf-2.json']);                       // B has its own local book
  await B.goto(ORIGIN + '/framework-library.html#/settings');
  await B.waitForFunction(() => window.google);
  await B.click('#gconnect');
  assert.equal(await waitSync(B), 'ok');
  await B.goto(ORIGIN + '/framework-library.html#/');
  assert.equal(await B.$$eval('.shelf .book', x => x.length), 3, 'B has A books + its own');
  assert(await B.$('.resume'), 'B shows resume from A');
  assert.deepEqual(names(), ['book-frameworks-101.json', 'book-nist-ai-rmf.json', 'book-nist-csf-2.json', 'state.json']);
  pass('B connects, merges local + remote');

  // B: remove a book, change categories, mark unread, read another section
  const secA = Object.keys((await state(B)).books['frameworks-101'].done)[0];
  await B.goto(ORIGIN + '/framework-library.html#/read/frameworks-101/' + secA);
  await B.click('#unread'); await B.waitForTimeout(50);
  await addCat(B, 'nist-csf-2', 'NIST');
  await B.goto(ORIGIN + '/framework-library.html#/book/nist-ai-rmf');
  await B.click('[data-rc="AI"]');
  await B.goto(ORIGIN + '/framework-library.html#/book/frameworks-101');
  await B.click('#rmbook'); await B.waitForTimeout(100);
  assert.equal(await waitSync(B), 'ok');
  // the debounce fires 2s after the last change
  await B.waitForTimeout(2300); assert.equal(await waitSync(B), 'ok');
  assert(!names().includes('book-frameworks-101.json'), 'removed book file deleted from Drive');
  sd = stateDoc(); assert(sd.removed['frameworks-101']); assert.deepEqual(sd.lib['nist-ai-rmf'].cats, ['NIST']);
  pass('B changes pushed (remove, categories, unread)');

  // A offline edit meanwhile: read a section in nist-ai-rmf
  await A.goto(ORIGIN + '/framework-library.html#/book/nist-ai-rmf');
  await A.click('.bookhead .btn.primary'); await A.click('#nextbtn'); await A.waitForTimeout(50);
  await A.click('#syncbtn');
  assert.equal(await waitSync(A), 'ok');
  await A.goto(ORIGIN + '/framework-library.html#/');
  const aTitles = await A.$$eval('.shelf .book .ct', x => x.map(e => e.textContent).sort());
  assert.deepEqual(aTitles, ['NIST AI RMF 1.0', 'NIST CSF 2.0'], 'A: removed book is gone');
  st = await state(A);
  assert.deepEqual(st.lib['nist-ai-rmf'].cats, ['NIST']); assert.deepEqual(st.lib['nist-csf-2'].cats, ['NIST']);
  assert.equal(Object.values(st.books['nist-ai-rmf'].done).filter(v => v > 0).length, 1);
  assert.deepEqual(await A.$$eval('.chips .chip', x => x.map(c => c.textContent.trim())), ['All 2', 'NIST 2']);
  pass('A pulls B changes and keeps its own new progress');

  // B pulls A's progress on return to the tab (visibility) -> use sync button
  await B.click('#syncbtn'); assert.equal(await waitSync(B), 'ok');
  st = await state(B);
  assert.equal(Object.values(st.books['nist-ai-rmf'].done).filter(v => v > 0).length, 1);
  assert.equal(st.lastBook, 'nist-ai-rmf', 'resume points to latest read across devices');
  pass('B pulls A progress; resume follows latest device');

  // reset all progress on B propagates
  await B.goto(ORIGIN + '/framework-library.html#/settings');
  await B.click('#wipe'); await B.click('#gsync'); assert.equal(await waitSync(B), 'ok');
  await A.click('#syncbtn'); assert.equal(await waitSync(A), 'ok');
  st = await state(A);
  assert.equal(Object.values(st.books['nist-ai-rmf'].done).filter(v => v > 0).length, 0, 'reset reached A');
  pass('reset all progress propagates');

  // token expiry -> paused banner -> reconnect
  await A.evaluate(() => localStorage.setItem('fwlib.gtoken', JSON.stringify({ t: 'tok-old', exp: Date.now() - 1000 })));
  await A.reload();
  assert.equal(await A.$eval('#syncbtn', b => b.dataset.s), 'auth');
  assert(await A.isVisible('#syncnote'));
  await A.waitForFunction(() => window.google);
  await A.click('#reauth');
  assert.equal(await waitSync(A), 'ok');
  const req = (await A.evaluate(() => window.__reqs)).pop();
  assert.equal(req.prompt, ''); assert.equal(req.login_hint, 'tester@example.com');
  assert(!(await A.isVisible('#syncnote')));
  pass('expired sign-in shows banner; reconnect uses silent prompt + login hint');

  // server-side 401 mid-session -> auth state, nothing lost
  drive.fail401 = true;
  await A.goto(ORIGIN + '/framework-library.html#/book/nist-csf-2');
  await A.click('.bookhead .btn.primary'); await A.click('#nextbtn');
  await A.waitForTimeout(2300);
  assert.equal(await waitSync(A), 'auth');
  drive.fail401 = false;
  await A.click('#syncbtn'); assert.equal(await waitSync(A), 'ok');
  assert.equal(Object.values(stateDoc().progress['nist-csf-2'].done).filter(v => v > 0).length, 1);
  pass('401 pauses sync; change uploads after reconnect');

  // re-import of a removed book on A brings it back everywhere, replaced book content syncs
  await importBooks(A, ['frameworks-101.json']);
  await A.click('#syncbtn'); assert.equal(await waitSync(A), 'ok');
  await B.click('#syncbtn'); assert.equal(await waitSync(B), 'ok');
  await B.goto(ORIGIN + '/framework-library.html#/');
  assert.equal(await B.$$eval('.shelf .book', x => x.length), 3);
  pass('re-imported book returns on other device');

  // disconnect keeps local data
  await B.goto(ORIGIN + '/framework-library.html#/settings');
  await B.click('#gdisc'); await B.waitForTimeout(200);
  assert(await B.$eval('#syncbtn', b => b.hidden));
  assert.equal((await state(B)).imported.length, 3); assert.equal((await state(B)).google, null);
  assert.equal(await B.evaluate(() => localStorage.getItem('fwlib.gtoken')), null);
  pass('disconnect keeps local books, forgets token');

  // backup export has no Google info
  const [bdl] = await Promise.all([B.waitForEvent('download'), B.click('#bk')]);
  const bk = JSON.parse(fs.readFileSync(await bdl.path(), 'utf8'));
  assert.equal(bk.version, 2); assert(!('google' in bk.state)); assert(bk.state.lib['nist-csf-2']);
  pass('backup v2 without account data');

  // duplicate state.json on Drive (race) gets merged and cleaned up
  const dupContent = JSON.stringify({ lib: {}, removed: {}, progress: { 'nist-csf-2': { done: { 'zz/extra': Date.now() }, quiz: {}, cards: {} } } });
  drive.files['dup'] = { id: 'dup', name: 'state.json', content: dupContent }; touch(drive.files['dup']);
  await A.click('#syncbtn'); assert.equal(await waitSync(A), 'ok');
  assert.equal(names().filter(n => n === 'state.json').length, 1);
  assert(stateDoc().progress['nist-csf-2'].done['zz/extra'] > 0);
  pass('duplicate state files merged into one');

  console.log('Drive calls:', drive.calls.length);
  assert.deepEqual(A.errors.filter(e => !/401/.test(e)), []); assert.deepEqual(B.errors, []);
  console.log('ALL PASSED:', ok);
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
