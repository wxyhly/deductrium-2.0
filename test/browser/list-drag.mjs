import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const fixture = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style/list.css">
<style>
body { margin: 12px; font: 16px sans-serif; }
.list-wrapper { height: 240px; overflow-y: auto; border: 1px solid #888; margin-bottom: 16px; }
.item-row { min-height: 32px; }
</style>
<div id="list" class="list-wrapper"><div class="rows-container"></div></div>
<div id="other" class="list-wrapper"><div class="rows-container"></div></div>
<button id="outside">Outside</button>
<script type="module">
import {TreeListViewer} from '/js/listmgr.js';
window.setup = (kind = 'long') => {
  window.view?.destroy(); window.otherView?.destroy();
  document.querySelectorAll('.list-wrapper').forEach(el => el.scrollTop = 0);
  window.changes = 0; window.clicks = 0; window.calls = []; window.block = false;
  const data = kind === 'long' ? Array.from({length: 70}, (_, i) => ({uuid: i + 1, name: 'T' + (i + 1)})) : [
    {uuid: 1, name: 'A', children: [{uuid: 2, name: 'Nested', children: [{uuid: 3, name: 'Child'}]}, {uuid: 4, name: 'Sibling'}]},
    {uuid: 5, name: 'B', children: [{uuid: 6, name: 'B child'}]}, {uuid: 7, name: 'Root'}
  ];
  window.view = new TreeListViewer(data, document.getElementById('list'), '240px');
  view.renderContent = (item, dom) => { dom.textContent = item.name; };
  view.onAfterChange = () => changes++;
  view.onRowClick = () => clicks++;
  view.allowDrop = (source, target, position) => { calls.push([source.uuid, target?.uuid ?? null, position]); return !block; };
  view.refresh();
  // Deliberately reuse UUIDs: a drag in one viewer must never use another viewer's nodes.
  window.otherView = new TreeListViewer([{uuid: 1, name: 'Other A'}, {uuid: 5, name: 'Other B'}], document.getElementById('other'), '120px');
  window.nativeStarts = 0; window.wheels = 0;
};
document.addEventListener('dragstart', () => nativeStarts++);
document.addEventListener('wheel', () => wheels++, {passive: true});
setup();
</script>`;
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/list-drag') { res.setHeader('Content-Type', 'text/html'); res.end(fixture); return; }
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', ({'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json'})[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
});
const cell = (page, id, list = 'list') => page.locator(`#${list} .cell-name[data-uuid="${id}"]`);
const point = async (locator, fraction = .5) => {
    const r = await locator.boundingBox(); assert.ok(r, 'visible drag handle');
    return {x: r.x + Math.min(r.width / 2, 20), y: r.y + r.height * fraction};
};
const begin = async (page, id, fraction = .5) => {
    await cell(page, id).scrollIntoViewIfNeeded();
    const p = await point(cell(page, id), fraction);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await page.mouse.move(p.x + 9, p.y + 8, {steps: 5});
    await page.waitForFunction(() => !!document.querySelector('#list .dragging'));
    return {x: p.x + 9, y: p.y + 8};
};
const tree = page => page.evaluate(() => JSON.stringify(view.data));
const moveTo = async (page, id, fraction = .75, list = 'list') => {
    const p = await point(cell(page, id, list), fraction);
    await page.mouse.move(p.x, p.y, {steps: 5}); return p;
};
const clean = async page => assert.equal(await page.locator('.dragging, [class*="drop-before"], [class*="drop-after"], [class*="drop-inside"]').count(), 0);
let browser;
try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
    browser = await chromium.launch({headless: true, channel: 'chrome'});
    for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
        const context = await browser.newContext({viewport, hasTouch: true});
        const page = await context.newPage(); const errors = [];
        page.setDefaultTimeout(8000);
        page.on('pageerror', e => errors.push(e.message));
        try {
            await page.goto(origin + '/list-drag'); await page.waitForFunction(() => !!window.view);
            await cell(page, 2).click();
            assert.equal(await page.evaluate(() => clicks), 1, 'ordinary name click remains a row click');
            await page.evaluate(() => setup());
            await begin(page, 2);
            const box = await page.locator('#list').boundingBox();
            const hover = {x: box.x + 20, y: box.y + box.height * .65};
            await page.mouse.move(hover.x, hover.y, {steps: 5});
            await page.mouse.wheel(0, 420);
            await page.waitForFunction(() => document.getElementById('list').scrollTop > 100);
            await page.waitForTimeout(100);
            const observed = await page.evaluate(p => ({scroll: document.getElementById('list').scrollTop, nativeStarts, wheels,
                under: document.elementFromPoint(p.x, p.y)?.closest('.item-row')?.dataset.uuid,
                marked: document.querySelector('#list .drop-after, #list .drop-before')?.dataset.uuid,
                after: !!document.querySelector('#list .drop-after')}), hover);
            assert.equal(observed.nativeStarts, 0, 'mouse drag does not enter the browser native drag loop');
            assert.ok(observed.wheels > 0);
            assert.equal(observed.marked, observed.under, 'stationary pointer follows rows moved by the wheel');
            await page.mouse.up();
            const order = await page.evaluate(() => view.data.map(n => n.uuid));
            assert.equal(order.indexOf(2), order.indexOf(Number(observed.under)) + (observed.after ? 1 : -1));
            assert.equal(await page.evaluate(() => changes), 1); await clean(page);

            for (const cancel of ['Escape', 'blur', 'lostButton', 'pointercancel', 'refresh', 'destroy']) {
                await page.evaluate(() => setup()); const before = await tree(page);
                await begin(page, 2); await moveTo(page, 5);
                if (cancel === 'Escape') await page.keyboard.press('Escape');
                else await page.evaluate(cancel => {
                    if (cancel === 'blur') window.dispatchEvent(new Event('blur'));
                    if (cancel === 'lostButton') document.dispatchEvent(new PointerEvent('pointermove', {pointerId: view.mouseDrag.pointerId, buttons: 0}));
                    if (cancel === 'pointercancel') document.dispatchEvent(new PointerEvent('pointercancel', {pointerId: view.mouseDrag.pointerId}));
                    if (cancel === 'refresh') view.refresh();
                    if (cancel === 'destroy') view.destroy();
                }, cancel);
                await page.mouse.up(); await clean(page);
                assert.equal(await tree(page), before, cancel + ' does not reorder');
                assert.equal(await page.evaluate(() => changes), 0);
                if (cancel !== 'destroy') assert.equal(await page.evaluate(() => clicks), 0, cancel + ' does not execute a row click');
            }
            await page.evaluate(() => setup()); await begin(page, 2); await moveTo(page, 5);
            await page.evaluate(() => { window.block = true; }); await page.mouse.up();
            assert.equal(await page.evaluate(() => changes), 0, 'permission is checked again on release'); await clean(page);
            await begin(page, 2); await moveTo(page, 5);
            assert.equal(await page.locator('#list .drop-after-disallowed').count(), 1);
            await page.mouse.up(); assert.equal(await page.evaluate(() => changes), 0); await clean(page);

            await page.evaluate(() => setup()); const before = await tree(page);
            await begin(page, 2); await moveTo(page, 5, .75, 'other');
            assert.equal(await page.locator('#other .drop-before, #other .drop-after, #other .drop-inside').count(), 0, 'foreign viewer with matching UUIDs is not a target');
            await page.mouse.up(); assert.equal(await tree(page), before); await clean(page);
            await cell(page, 2).click(); assert.equal(await page.evaluate(() => clicks), 1, 'next click is not swallowed');

            await page.evaluate(() => { setup('nested'); view.expandedFolders = new Set([1, 2, 5]); view.refresh(); document.getElementById('list').style.height = '360px'; });
            await begin(page, 7); await moveTo(page, 2); await page.mouse.up();
            assert.deepEqual(await page.evaluate(() => view.findNode(2).children.map(n => n.uuid)), [3, 7], 'drop into an expanded nested folder');
            await begin(page, 3);
            await page.locator('#list .drop-placeholder').scrollIntoViewIfNeeded();
            const placeholder = await point(page.locator('#list .drop-placeholder'));
            await page.mouse.move(placeholder.x, placeholder.y); await page.mouse.up();
            assert.deepEqual(await page.evaluate(() => view.findNode(2).children.map(n => n.uuid)), [7, 3], 'placeholder moves to the end of the current parent');
            await clean(page);

            await page.evaluate(() => { setup('nested'); view.expandedFolders = new Set([1, 2, 5]); view.refresh(); document.getElementById('list').style.height = '360px'; });
            const touch = await context.newCDPSession(page);
            const start = await point(cell(page, 3)), end = await point(cell(page, 6), .75);
            await touch.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{...start, id: 1}]});
            await page.waitForFunction(() => !!document.querySelector('#list .dragging'));
            await touch.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{...end, id: 1}]});
            await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
            assert.ok(await page.evaluate(() => view.findNode(5).children.some(n => n.uuid === 3)), 'touch long press still moves an item');
            await touch.detach(); await clean(page);
            assert.deepEqual(errors, []);
            console.log(JSON.stringify({viewport, wheel: observed.scroll, cancellationPaths: 6, nested: true, permissions: true, touch: true, errors}));
        } finally { await context.close(); }
    }
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
