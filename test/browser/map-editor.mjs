import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp} from 'node:fs/promises';
import {resolve, extname, sep, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', ({'.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json'})[extname(file)] || 'text/plain;charset=utf-8');
        res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const screenshots = await mkdtemp(join(tmpdir(), 'deductrium-full-map-editor-'));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = origin + '/tools/map-editor/index.html';
const snapshot = page => page.evaluate(() => JSON.stringify(mapEditor.project.toJSON()));
const waitReady = async page => {
    await page.waitForFunction(() => window.mapEditor || !document.getElementById('fatal').hidden);
    assert.equal(await page.locator('#fatal').isVisible(), false, await page.locator('#fatal').textContent());
};
const disclose = async (page, id) => {
    if (!await page.locator(id).evaluate(element => element.open)) await page.locator(id + ' > summary').click();
};
const openPanel = async (page, name) => {
    if (!await page.locator('#' + name + '-panel').isVisible()) await page.locator('#open-' + name).click();
};
const closePanel = async page => {
    if (await page.locator('#task-panel').isVisible()) await page.locator('#close-panel').click();
};
const openInspector = async page => {
    await closePanel(page);
    if (await page.locator('#toggle-inspector').isVisible() && await page.locator('#toggle-inspector').getAttribute('aria-expanded') !== 'true') await page.locator('#toggle-inspector').click();
};
const canvasReady = async page => {
    await closePanel(page);
    if (await page.locator('#toggle-inspector').isVisible() && await page.locator('#toggle-inspector').getAttribute('aria-expanded') === 'true') await page.locator('#toggle-inspector').click();
};
const fileAction = async (page, id) => {
    await disclose(page, '#file-menu'); await page.locator(id).click();
};
const save = async (page, id) => {
    if (['#export-source', '#recover-draft'].includes(id)) await disclose(page, '#file-menu');
    const event = page.waitForEvent('download'); await page.locator(id).click();
    return readFile(await (await event).path(), 'utf8');
};
const upload = (page, name, text) => page.locator('#file').setInputFiles({name, mimeType: name.endsWith('.json') ? 'application/json' : 'text/plain', buffer: Buffer.from(text)});
const applyTile = async (page, {type, name, text, script = '', data = '{}'}) => {
    await openInspector(page);
    await page.locator('#tile-type').selectOption(String(type));
    await page.locator('#tile-name').fill(name);
    await page.locator('#text-mode').selectOption('languages');
    await page.locator('#text-zh').fill(text);
    await page.locator('#text-en').fill('English ' + name);
    await disclose(page, '#script-section');
    await disclose(page, '#data-section');
    await page.locator('#tile-script').fill(script);
    await page.locator('#tile-data').fill(data);
    await page.locator('#apply-tile').click();
    await page.waitForFunction(expected => mapEditor.selected?.name === expected && document.getElementById('pending').hidden, name);
};

try {
    browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
    for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
        const context = await browser.newContext({viewport, acceptDownloads: true, colorScheme: 'light'});
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let acceptDialogs = true;
        page.on('dialog', dialog => acceptDialogs ? dialog.accept() : dialog.dismiss());
        await page.goto(url); await waitReady(page);
        assert.ok(await page.evaluate(() => mapEditor.project.tiles.size) > 100, 'official map loaded');
        assert.ok(await page.locator('.tile-row').count() > 0);
        assert.equal(await page.locator('#task-panel').isVisible(), false, 'task panels start collapsed');
        for (const id of ['#map-language', '#project-id', '#module-library', '#tile-script', '#tile-data', '#export-world', '#play-world']) {
            assert.equal(await page.locator(id).isVisible(), false, `${id} progressively disclosed`);
        }
        assert.equal(await page.locator('#world-settings').count(), 1, 'world settings integration container');
        const initialCanvas = await page.locator('#map').boundingBox();
        assert.ok(initialCanvas.height > viewport.height * .5, 'canvas owns the initial screen');
        if (viewport.width < 700) assert.ok(initialCanvas.y < (await page.locator('#inspector').boundingBox()).y, 'mobile canvas precedes property drawer');
        assert.equal(await page.evaluate(async () => {
            const {LocalDraw} = await import('/js/hy/localdraw.js');
            const {tileTextColor, tileDisplayText} = await import('/js/hy/appearance.js');
            const w = mapEditor.world;
            return w.localDraw.drawPlayer === LocalDraw.prototype.drawPlayer && w.localDraw.textTo === LocalDraw.prototype.textTo &&
                w.localDraw.drawPolygon === LocalDraw.prototype.drawPolygon && w.onTextColor === tileTextColor && w.onTileText === tileDisplayText;
        }), true, 'native player, fonts, polygons and shared appearance callbacks');
        await page.locator('#map').scrollIntoViewIfNeeded();
        await page.screenshot({path: join(screenshots, `official-${viewport.width}.png`)});

        await openPanel(page, 'tiles');
        await openPanel(page, 'modules');
        assert.equal(await page.locator('#tiles-panel').isVisible(), false, 'task panels are exclusive');
        assert.equal(await page.locator('#module-library').isVisible(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#task-panel').isVisible(), false);
        await page.locator('#dismiss-note').click();

        await fileAction(page, '#new-project');
        assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 0);
        const emptyState = await snapshot(page);
        await openInspector(page);
        await page.locator('#tile-name').fill('not-applied');
        assert.equal(await snapshot(page), emptyState, 'typing is not Apply');
        await openPanel(page, 'project'); await closePanel(page);
        assert.equal(await page.locator('#tile-name').inputValue(), 'not-applied', 'panel disclosure retains pending fields');
        if (viewport.width < 700) {
            await page.locator('#toggle-inspector').click();
            assert.equal(await page.locator('#pending').isVisible(), true, 'collapsed drawer retains pending marker');
            await openInspector(page);
        }
        acceptDialogs = false;
        await page.locator('#neighbors button[data-edge="0"]').click();
        assert.equal(await page.evaluate(() => mapEditor.selectedHash), '', 'cancelled navigation protects pending form');
        assert.equal(await page.locator('#tile-name').inputValue(), 'not-applied');
        acceptDialogs = true;
        const blockedSave = await snapshot(page);
        await page.locator('#export-project').click();
        assert.equal(await snapshot(page), blockedSave, 'save does not silently apply fields');
        assert.match(await page.locator('#status').textContent(), /先 Apply/);
        await page.locator('#reset-form').click();

        // External settings share navigation/save protection, with an explicit Apply escape hatch.
        await page.evaluate(() => {
            window.testPending = true;
            window.unregisterTestPending = mapEditor.registerPendingGuard(() => window.testPending);
        });
        await page.locator('#export-project').click();
        assert.match(await page.locator('#status').textContent(), /请先应用世界设置/);
        assert.equal(await page.locator('#project-panel').isVisible(), true);
        acceptDialogs = false;
        await Promise.all([page.waitForEvent('dialog'), fileAction(page, '#official-map')]);
        assert.equal(await snapshot(page), emptyState, 'external pending cancellation keeps project');
        acceptDialogs = true;
        const externalApply = await page.evaluate(() => {
            let blocked = false;
            try { mapEditor.applyProject(() => {}); } catch { blocked = true; }
            let applied = false;
            mapEditor.applyProject(() => { applied = true; }, 'external Apply', {allowExternalPending: true});
            window.testPending = false; window.unregisterTestPending();
            return {blocked, applied};
        });
        assert.deepEqual(externalApply, {blocked: true, applied: true});
        await openInspector(page);
        await page.locator('#tile-name').fill('pending-fields');
        assert.equal(await page.evaluate(() => {
            try { mapEditor.applyProject(() => {}, 'external Apply', {allowExternalPending: true}); return false; }
            catch { return true; }
        }), true, 'external Apply never bypasses tile pending guard');
        await page.locator('#reset-form').click();

        await applyTile(page, {type: 3, name: 'reward', text: '奖励提示\n第二行', script: 'disable axiom a3\ngive key red', data: '{"getD":3,"scriptRepeat":true,"custom":{"keep":true}}'});
        const rewardState = await snapshot(page);
        assert.equal(await page.evaluate(() => mapEditor.selected.data.script), 'disable axiom a3\ngive key red');
        assert.equal(await page.evaluate(() => mapEditor.selected.data.scriptRepeat), true);
        await page.locator('#tile-data').fill('{bad JSON');
        await page.locator('#apply-tile').click();
        assert.equal(await snapshot(page), rewardState, 'invalid JSON has no partial commit');
        await page.locator('#reset-form').click();
        await page.locator('#tile-script').fill('this is not a map command');
        await page.locator('#apply-tile').click();
        assert.equal(await snapshot(page), rewardState, 'invalid DSL has no partial commit');
        assert.equal(await page.locator('#status').getAttribute('data-error'), 'true');
        await page.locator('#reset-form').click();

        await page.locator('#neighbors button[data-edge="0"]').click();
        assert.equal(await page.evaluate(() => mapEditor.selectedHash), '0');
        await applyTile(page, {type: 2, name: 'gate', text: '拿到钥匙后通过', script: 'require key red\nenable axiom a3', data: '{"p":true,"requiresReward":"reward"}'});
        assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 2);
        await page.locator('#undo').click(); assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 1);
        await page.locator('#redo').click(); assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 2);
        await openPanel(page, 'project');
        await page.locator('#project-id').fill('browser-map'); await page.locator('#project-title').fill('浏览器地图');
        await page.locator('#apply-project').click(); assert.equal(await page.evaluate(() => mapEditor.project.title), '浏览器地图');
        await page.locator('#undo').click(); assert.notEqual(await page.evaluate(() => mapEditor.project.title), '浏览器地图');
        await page.locator('#redo').click(); assert.equal(await page.evaluate(() => mapEditor.project.title), '浏览器地图');

        await canvasReady(page);
        await disclose(page, '#view-menu');
        await page.locator('#map-language').selectOption('en');
        assert.equal(await page.evaluate(() => mapEditor.world.onTileText(mapEditor.selected).includes('English gate')), true);
        await page.locator('#map-language').selectOption('zh');
        await page.locator('#theme-select').selectOption('dark');
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        await page.locator('#theme-select').selectOption('light');
        await page.locator('#view-menu > summary').click();

        // Actual canvas hit testing selects an empty native hyperbolic domain.
        await page.locator('#map').scrollIntoViewIfNeeded();
        const target = await page.evaluate(async () => {
            const {Hvec} = await import('/js/hy/algebra.js');
            const w = mapEditor.world, rect = document.getElementById('map').getBoundingClientRect();
            for (const [hash, rotor] of w.atlasTile.rotors) {
                if (mapEditor.project.tiles.has(hash)) continue;
                const p = w.localCamMat.mul(rotor).apply(new Hvec());
                if (p.z > 5) continue;
                const scale = w.localDraw.scale / (p.z + 1) * Math.min(rect.width, rect.height) / 2;
                return {hash, x: rect.x + rect.width / 2 + p.x * scale, y: rect.y + rect.height / 2 + p.y * scale};
            }
        });
        assert.ok(target); await page.mouse.click(target.x, target.y);
        assert.equal(await page.evaluate(() => mapEditor.selectedHash), target.hash, 'click selects empty tile');
        assert.equal(await page.evaluate(() => mapEditor.selected), undefined);
        const beforeDrag = await page.evaluate(() => JSON.stringify(mapEditor.world.localCamMat));
        const box = await page.locator('#map').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, {steps: 6}); await page.mouse.up();
        assert.notEqual(await page.evaluate(() => JSON.stringify(mapEditor.world.localCamMat)), beforeDrag, 'real moveCam drag');

        // Paint and erase by clicking a real domain, with history.
        await page.locator('#locate').click(); await page.locator('#mode').selectOption('1');
        await page.locator('#map').scrollIntoViewIfNeeded();
        const paintBox = await page.locator('#map').boundingBox();
        await page.mouse.click(paintBox.x + paintBox.width / 2, paintBox.y + paintBox.height / 2);
        assert.equal(await page.evaluate(() => mapEditor.selected.type), 1);
        await page.locator('#mode').selectOption('erase');
        await page.locator('#map').scrollIntoViewIfNeeded();
        const eraseBox = await page.locator('#map').boundingBox();
        await page.mouse.click(eraseBox.x + eraseBox.width / 2, eraseBox.y + eraseBox.height / 2);
        assert.equal(await page.evaluate(() => mapEditor.selected), undefined);
        await page.locator('#undo').click(); assert.equal(await page.evaluate(() => mapEditor.selected.type), 1);
        await page.locator('#redo').click(); assert.equal(await page.evaluate(() => mapEditor.selected), undefined);
        await page.locator('#mode').selectOption('select');

        // Export a real selected module and register it through the file input.
        await page.locator('#home').click();
        await page.locator('#mode').selectOption('1'); await page.locator('#multi-select').check();
        const beforeMulti = await snapshot(page);
        const multiBox = await page.locator('#map').boundingBox();
        await page.mouse.click(multiBox.x + multiBox.width / 2, multiBox.y + multiBox.height / 2);
        assert.deepEqual(await page.evaluate(() => mapEditor.selection), [''], 'checkbox selects without Shift');
        assert.equal(await snapshot(page), beforeMulti, 'multi-select overrides paint without modifying tiles');
        await page.mouse.click(multiBox.x + multiBox.width / 2, multiBox.y + multiBox.height / 2);
        assert.deepEqual(await page.evaluate(() => mapEditor.selection), [], 'checkbox toggles selection off');
        await page.locator('#multi-select').uncheck(); await page.locator('#mode').selectOption('select');
        await openPanel(page, 'tiles'); await page.locator('#select-filtered').click(); await closePanel(page);
        assert.equal(await page.evaluate(() => mapEditor.selection.length), 2);
        await page.locator('#open-module-export').click();
        await page.locator('#module-export-id').fill('room');
        const moduleText = await save(page, '#export-module'), module = JSON.parse(moduleText);
        assert.equal(module.format, 'deductrium-map-module-v1'); assert.equal(module.tiles.length, 2);
        await upload(page, 'room.json', moduleText);
        await page.waitForFunction(() => mapEditor.project.modules.has('room'));
        await page.locator('#mount-at').fill('[]'); await page.locator('#preview-mount').click();
        assert.equal(await page.locator('#confirm-mount').isDisabled(), true);
        assert.equal(await page.locator('#mount-preview').getAttribute('data-error'), 'true', 'readable collision preview');
        await page.locator('#mount-at').fill('[3,2,2]'); await page.locator('#mount-rotation').selectOption('2');
        await page.locator('#preview-mount').click();
        assert.equal(await page.locator('#confirm-mount').isDisabled(), false, await page.locator('#mount-preview').textContent());
        const beforePreview = await snapshot(page); await page.locator('#preview-mount').click();
        assert.equal(await snapshot(page), beforePreview, 'preview is read-only');
        await page.locator('#confirm-mount').click();
        assert.equal(await page.evaluate(() => mapEditor.project.instances.length), 1);
        assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 4);
        const instance = page.locator('.instance[data-instance="instance-1"]');
        await instance.getByRole('button', {name: '定位', exact: true}).click();
        assert.equal(await page.locator('#tile-name').isDisabled(), true, 'mounted tile cannot be edited');
        await instance.getByRole('button', {name: '旋转 +1', exact: true}).click();
        assert.equal(await page.evaluate(() => mapEditor.project.instances[0].rotation), 3);
        await instance.getByRole('button', {name: '填入放置表单', exact: true}).click();
        await page.locator('#mount-at').fill('[4,2,2]');
        await instance.getByRole('button', {name: '预览移动', exact: true}).click();
        assert.equal(await page.locator('#mount-preview').getAttribute('data-error'), 'false');
        await instance.getByRole('button', {name: '移动到表单位置', exact: true}).click();
        assert.deepEqual(await page.evaluate(() => mapEditor.project.instances[0].at), [4, 2, 2]);
        await instance.getByRole('button', {name: '分离', exact: true}).click();
        assert.equal(await page.evaluate(() => mapEditor.project.instances.length), 0);
        await page.locator('#undo').click(); assert.equal(await page.evaluate(() => mapEditor.project.instances.length), 1);
        await instance.getByRole('button', {name: '删除实例', exact: true}).click();
        assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 2);
        await page.locator('#undo').click(); assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 4);

        await closePanel(page);
        const source = await save(page, '#export-source'); assert.match(source, /export const mapData/);
        const projectText = await save(page, '#export-project');
        assert.equal(JSON.parse(projectText).title, '浏览器地图');
        assert.equal(await page.evaluate(() => mapEditor.dirty), false);
        const protectedState = await snapshot(page);
        await upload(page, 'bad.json', '{"format":"bad"}');
        await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('导入失败'));
        assert.equal(await snapshot(page), protectedState, 'project import failure keeps old project');
        await upload(page, 'bad-module.json', '{"format":"deductrium-map-module-v1","id":"bad"}');
        await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('导入失败'));
        assert.equal(await snapshot(page), protectedState, 'module import failure keeps old project');
        await upload(page, 'map.ts', source);
        await page.waitForFunction(() => mapEditor.project.instances.length === 0 && mapEditor.project.modules.size === 0);
        assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 4);
        await upload(page, 'project.json', projectText);
        await page.waitForFunction(() => mapEditor.project.instances.length === 1);
        assert.equal(await snapshot(page), protectedState, 'project file round trip');
        await page.reload(); await waitReady(page);
        assert.equal(await snapshot(page), protectedState, 'draft restoration');
        assert.equal(await page.locator('#map-note').isVisible(), false, 'dismissed hint persists separately from project');

        const popupEvent = context.waitForEvent('page'); await page.locator('#play-map').click();
        const popup = await popupEvent; await popup.waitForURL(/map-editor-preview/);
        const payload = await page.evaluate(() => JSON.parse(localStorage.getItem('deductrium2_map_preview')));
        assert.equal(payload.tiles.length, 4); assert.equal(Object.hasOwn(payload, 'source'), false);
        assert.deepEqual(Object.keys(payload.tiles[0][1]).sort(), ['data', 'name', 'text', 'type'].sort());
        await popup.close();

        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'responsive layout has no horizontal overflow');
        await page.locator('#map').scrollIntoViewIfNeeded(); await page.screenshot({path: join(screenshots, `editor-${viewport.width}.png`)});
        assert.deepEqual(errors, [], 'no uncaught browser errors');
        console.log(JSON.stringify({viewport, checks: 'progressive disclosure, exclusive panels, mobile drawer/pending fields, confirm cancellation, save protection, checkbox multi-selection, native rendering, Apply, invalid JSON/DSL, history, metadata, language/theme, empty hit, drag, brush/erase, selection/module, collision/mount/move/rotate/detach/remove, import/export, restoration, preview payload, layout'}));
        await context.close();
    }

    // Storage failures retain manual export; malformed drafts are never overwritten.
    const blocked = await browser.newContext({acceptDownloads: true});
    await blocked.addInitScript(() => { Storage.prototype.setItem = function() { throw Error('blocked storage'); }; });
    const blockedPage = await blocked.newPage(); blockedPage.on('dialog', dialog => dialog.accept());
    await blockedPage.goto(url); await waitReady(blockedPage);
    await fileAction(blockedPage, '#new-project');
    await applyTile(blockedPage, {type: 0, name: 'storage', text: '仍然可导出'});
    assert.match(await blockedPage.locator('#draft-status').textContent(), /不可用/);
    assert.equal(JSON.parse(await save(blockedPage, '#export-project')).tiles.length, 1);
    await blockedPage.locator('#play-map').click();
    assert.match(await blockedPage.locator('#status').textContent(), /blocked storage/);
    await blocked.close();

    const recovery = await browser.newContext({acceptDownloads: true});
    await recovery.addInitScript(() => {
        if (!sessionStorage.getItem('bad-draft-seeded')) {
            localStorage.setItem('deductrium-map-editor-project-v1', '{bad draft'); sessionStorage.setItem('bad-draft-seeded', 'true');
        }
    });
    const recoveryPage = await recovery.newPage(); recoveryPage.on('dialog', dialog => dialog.accept());
    await recoveryPage.goto(url); await waitReady(recoveryPage);
    assert.match(await recoveryPage.locator('#status').textContent(), /旧草稿未能恢复/);
    assert.equal(await save(recoveryPage, '#recover-draft'), '{bad draft');
    await fileAction(recoveryPage, '#new-project');
    await applyTile(recoveryPage, {type: 0, name: 'retained', text: '新工作'});
    assert.equal(await recoveryPage.evaluate(() => localStorage.getItem(mapEditor.storageKey)), '{bad draft');
    assert.equal(JSON.parse(await save(recoveryPage, '#export-project')).tiles.length, 1);
    await recovery.close();
    console.log('PASS storage failure and malformed-draft retention; screenshots: ' + screenshots);
} finally {
    await browser?.close(); await new Promise(done => server.close(done));
}
