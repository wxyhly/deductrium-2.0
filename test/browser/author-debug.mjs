// After the normal build: node test/browser/author-debug.mjs [repository root]
// npm-installed Playwright is the default. Optional PLAYWRIGHT_MODULE points to its entry file;
// PLAYWRIGHT_CHANNEL selects chrome/msedge, PLAYWRIGHT_EXECUTABLE_PATH selects any Chromium.
// No compilation, source rewriting, Game/HS/TT mocks, or external server is required.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const playwright = process.env.PLAYWRIGHT_MODULE;
const {chromium} = await import(playwright ? pathToFileURL(resolve(playwright)).href : 'playwright');
async function launch() {
    const {PLAYWRIGHT_CHANNEL:channel, PLAYWRIGHT_EXECUTABLE_PATH:executablePath} = process.env;
    if (channel || executablePath) return chromium.launch({headless:true, ...(channel ? {channel} : {}), ...(executablePath ? {executablePath} : {})});
    const failures = [];
    for (const candidate of [undefined, 'chrome', 'msedge']) {
        try { return await chromium.launch({headless:true, ...(candidate ? {channel:candidate} : {})}); }
        catch (error) { failures.push(`${candidate ?? 'bundled chromium'}: ${error.message}`); }
    }
    throw new Error('Install Playwright Chromium or select PLAYWRIGHT_CHANNEL / PLAYWRIGHT_EXECUTABLE_PATH.\n' + failures.join('\n'));
}
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/__author-debug-frame') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><iframe title="地图预览" style="position:fixed;inset:0;width:100%;height:100%;border:0" src="/?author-debug&amp;map-editor-preview&amp;embedded=1"></iframe>');
            return;
        }
        const path = decodeURIComponent(url.pathname);
        const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
        if (!file.startsWith(root + sep)) {res.writeHead(403).end(); return;}
        res.setHeader('Content-Type', ({'.js':'text/javascript', '.mjs':'text/javascript', '.html':'text/html; charset=utf-8', '.css':'text/css', '.json':'application/json'})[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch {res.writeHead(404).end();}
});
const tile = (id, hash, type, script = '', extra = {}) => ({id, hash, type, text:id, data:{script, ...extra}});
const tiles = [
    tile('start', '', 0, 'on start\nadd count starts 1\nunlock rule .i\nunlock reward macro\nend'),
    tile('prize', '1', 3, 'on collect\ngive money 12\ngive currency type 3\ngive key red\nset flag ready\nadd count claims 1\nend'),
    tile('blocked', '2', 2, 'on pass\nrequire key missing\ngive money 999\nend'),
    tile('branch', '3', 0, 'on touch\nevent repeat\nif flag ready\nadd count visits 1\nelse\ngive money 999\nend\nend'),
    tile('confirm', '4', 2, 'on pass\nconfirm "作者调试确认"\ntake money 2\nset flag confirmed\nend'),
    tile('exception', '1,1', 0, 'on touch\ntake money 9999\nend'),
];
const manifest = {format:'deductrium-world-v1', id:'author-browser', title:'作者调试验证', revision:1,
    mode:'standalone', spawn:{tileId:'start', rotation:0}, banks:{}, migrations:[], tiles};
const preview = {tiles:tiles.map(({hash, id, ...block}) => [hash, {...block, name:id}])};
let previewHash = 2166136261;
for (const c of JSON.stringify(preview.tiles)) previewHash = Math.imul(previewHash ^ c.charCodeAt(0), 16777619);
const previewMode = 'map-editor-preview-' + (previewHash >>> 0).toString(16);
const ordinaryKeys = ['deductrium2_survival', 'deductrium2_creative', 'deductrium2_world-author-browser',
    'deductrium2_' + previewMode, ...Array.from({length:4}, (_, i) => 'deductrium2_slot' + i)];

const state = page => page.evaluate(() => structuredClone(game.saveload.serialize()));
const trace = page => page.evaluate(() => game.authorDebug.session.traces());
const hit = (page, hash) => page.evaluate(hash => game.hyLayer.world.hitTest(hash.split(',').map(Number)), hash);
async function ready(page) {
    await page.waitForFunction(() => window.game || document.getElementById('world-load-error'), null, {timeout:30000});
    assert.equal(await page.locator('#world-load-error').count(), 0, 'Game must load successfully: ' + await page.locator('body').innerText());
    assert.equal(await page.evaluate(() => Boolean(window.game.hsLayer && window.game.ttLayer && window.game.hyLayer)), true);
}
async function seed(page, isolate = false) {
    await page.addInitScript(({manifest, preview, ordinaryKeys, isolate}) => {
        localStorage.setItem('deductrium2_world_manifest', JSON.stringify(manifest));
        localStorage.setItem('deductrium2_map_preview', JSON.stringify(preview));
        if (isolate && !localStorage.getItem('__author_debug_seeded')) {
            for (const key of ordinaryKeys) localStorage.setItem(key, 'preserve:' + key);
            localStorage.setItem('__author_debug_seeded', '1');
        }
    }, {manifest, preview, ordinaryKeys, isolate});
}
async function isolated(page) {
    assert.deepEqual(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), ordinaryKeys), ordinaryKeys.map(key => 'preserve:' + key));
    assert.equal(await page.evaluate(() => game.progressLayer.saveload === game.saveload), true, 'Progress and Game must share the actual isolated SaveLoad');
    const slots = await page.evaluate(() => Array.from({length:4}, (_, i) => game.saveload.slotKey(i)));
    assert.equal(new Set(slots).size, 4);
    assert.ok(slots.every(key => key.includes('world-author-debug:') && !ordinaryKeys.includes(key)));
}
async function bounds(page, viewport) {
    const box = await page.locator('#author-debug-panel').boundingBox();
    assert.ok(box && box.x >= 7 && box.x + box.width <= viewport.width - 7, JSON.stringify({viewport, box}));
    assert.ok(box.y >= 0 && box.y + box.height <= viewport.height, JSON.stringify({viewport, box}));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}

let browser;
const failures = [];
try {
    browser = await launch();
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const viewport of [{width:1440, height:1000}, {width:390, height:844}, {width:320, height:700}]) {
        for (const mode of ['world', 'preview', 'iframe']) {
            const context = await browser.newContext({viewport});
            try {
                const page = await context.newPage(), errors = [];
                page.on('pageerror', error => errors.push(error.message));
                let accepted = false;
                page.on('dialog', dialog => accepted ? dialog.accept() : dialog.dismiss());
                await seed(page, true);
                await page.goto(origin + (mode === 'world' ? '/?mod-world&author-debug' : mode === 'preview' ? '/?map-editor-preview&author-debug&extra=1' : '/__author-debug-frame'));
                const gamePage = mode === 'iframe' ? await (await page.locator('iframe').elementHandle()).contentFrame() : page;
                assert.ok(gamePage, 'preview iframe must exist');
                await ready(gamePage);
                await gamePage.locator('#author-debug-panel').waitFor();
                await bounds(gamePage, viewport);
                const prefix = mode === 'world' ? 'mod:author-browser::' : '';
                const id = name => prefix + name;
                const expectedMode = 'world-author-debug:' + encodeURIComponent(mode === 'world' ? 'world-author-browser' : previewMode);
                assert.equal(await gamePage.evaluate(() => game.saveload.saveMode), expectedMode);
                assert.equal((await state(gamePage)).ms.counts[id('starts')], 1, 'combined queries/iframe must load the custom preview rather than the official map');
                await isolated(gamePage);
                assert.ok((await trace(gamePage)).some(e => e.event === 'start' && e.phase === 'host' && e.outcome === 'pass'));

                assert.equal(await hit(gamePage, '2'), false);
                const blocked = (await trace(gamePage)).find(e => e.kind === 'condition' && e.result === false && e.tileId === id('blocked'));
                assert.ok(blocked); assert.equal(blocked.line, 2); assert.match(blocked.source, /^require key /);
                assert.equal((await state(gamePage)).D, 0);
                assert.equal(await hit(gamePage, '1'), true);
                assert.equal(await hit(gamePage, '1'), true);
                assert.equal((await state(gamePage)).D, 12, 'once collect must not repeat');
                assert.equal((await state(gamePage)).balances.type, 3);
                assert.equal(await hit(gamePage, '3'), true);
                assert.ok((await trace(gamePage)).some(e => e.kind === 'not-run' && e.line === 6 && e.tileId === id('branch')));
                assert.equal(await hit(gamePage, '4'), false);
                assert.equal((await state(gamePage)).D, 12);
                assert.ok((await trace(gamePage)).some(e => e.phase === 'host' && e.reason?.includes('取消确认')));
                accepted = true;
                assert.equal(await hit(gamePage, '4'), true);
                assert.equal((await state(gamePage)).D, 10);
                assert.equal(await hit(gamePage, '1,1'), false);
                assert.ok((await trace(gamePage)).some(e => e.outcome === 'exception' && e.tileId === id('exception') && e.line === 2));
                assert.equal((await state(gamePage)).D, 10);

                await gamePage.evaluate(async () => {
                    const {HSParser} = await import('/js/hs/core/parser.js');
                    game.hsLayer.hilbertSystem.fromCmd([new HSParser().parse('.i $a', 'cmd')]);
                    game.saveload.cancelPendingSave();
                });
                const before = await state(gamePage);
                assert.ok(before.ms.keys.includes(id('red')) && before.ms.flags.includes(id('ready')));
                assert.deepEqual(before.ms.eventDone[id('prize')], ['collect']);
                assert.ok(before.hs && before.tt && before.hy, 'snapshot contains actual proof and geometry layers');
                const panel = gamePage.locator('#author-debug-panel');
                await panel.getByLabel('快照名称').fill('浏览器/快照');
                await panel.getByRole('button', {name:'捕获快照', exact:true}).click();
                await gamePage.evaluate(async () => {
                    const {HSParser} = await import('/js/hs/core/parser.js');
                    game.hsLayer.hilbertSystem.fromCmd([new HSParser().parse('.i $b', 'cmd')]);
                    game.ttLayer.deserialize({table:[], active:-1});
                    game.deductrium = 2; game.mapScript.keys = []; game.mapScript.flags = [];
                    game.mapScript.counts = {}; game.mapScript.eventDone = {};
                    game.hyLayer.world.currentTile = [2]; game.hyLayer.world.atlasTile.generateRotors([2]);
                    game.saveload.notifySave();
                });
                assert.notDeepEqual(await state(gamePage), before);
                await panel.getByRole('button', {name:'恢复快照', exact:true}).click();
                assert.deepEqual(await state(gamePage), before, 'real Game snapshot restores HS/TT/HY, money, inventory, once marks and events');
                await gamePage.evaluate(() => {game.saveload.cancelPendingSave(); game.saveload.save(); for (let i = 0; i < 4; i++) game.saveload.saveToKey(game.saveload.slotKey(i)); game.authorDebug.refresh();});
                await isolated(gamePage);
                assert.match(await panel.locator('pre').innerText(), /proof/);
                assert.match(await panel.locator('ol').innerText(), /第 2 行/);
                const saved = await gamePage.evaluate(() => JSON.parse(LZString.decompressFromUTF16(localStorage.getItem(game.saveload.saveKey))).data);
                assert.deepEqual(saved, before);
                assert.equal(Object.hasOwn(saved, 'trace'), false);
                assert.equal(Object.hasOwn(saved, 'authorDebug'), false);
                await page.reload();
                const reloaded = mode === 'iframe' ? await (await page.locator('iframe').elementHandle()).contentFrame() : page;
                await ready(reloaded);
                assert.deepEqual(await state(reloaded), before, 'reload keeps restored state and never repeats start/collect');
                await isolated(reloaded);
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({viewport, mode, gameTrace:'PASS', snapshot:'PASS', saveIsolation:'PASS', reload:'PASS'}));
            } catch (error) {
                failures.push(new Error(`${viewport.width}px ${mode}: ${error.message}`, {cause:error}));
                console.error(`${viewport.width}px ${mode}: FAIL: ${error.message}`);
            } finally {await context.close();}
        }
    }
    // Exact creative URL behavior is intentionally retained, including its existing mixed-query fallback.
    for (const [query, mode, debug] of [
        ['', 'survival', false], ['?creative', 'creative', false], ['?author-debug', 'survival', false],
        ['?creative&author-debug', 'survival', false], ['?mod-world', 'world-author-browser', false],
        ['?map-editor-preview', previewMode, false], ['?map-editor-preview&extra=1', previewMode, false],
        ['?author-debug&mod-world', 'world-author-debug:world-author-browser', true],
        ['?mod-world&map-editor-preview&author-debug', 'world-author-debug:world-author-browser', true],
    ]) {
        const context = await browser.newContext();
        try {
            const page = await context.newPage(), errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await seed(page); await page.goto(origin + '/' + query); await ready(page);
            assert.equal(await page.evaluate(() => game.saveload.saveMode), mode, query);
            assert.equal(await page.locator('#author-debug-panel').count(), debug ? 1 : 0, query);
            assert.deepEqual(errors, []);
        } catch (error) {
            failures.push(new Error(`query ${query || '(empty)'}: ${error.message}`, {cause:error}));
            console.error(`query ${query || '(empty)'}: FAIL: ${error.message}`);
        } finally {await context.close();}
    }
    if (failures.length) throw new AggregateError(failures, `${failures.length} author-debug browser scenarios failed`);
    console.log('author-debug mode switches: PASS');
} finally {
    await browser?.close();
    if (server.listening) await new Promise(done => server.close(done));
}
