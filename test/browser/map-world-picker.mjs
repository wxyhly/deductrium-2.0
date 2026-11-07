// Run: node test/browser/map-world-picker.mjs [repository root]
// Requires Chrome and playwright, or PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs.
// Serves the existing generated js/ tree without compiling application files.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp} from 'node:fs/promises';
import {resolve, extname, sep, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const region = {hash:'1', edge:4, side:-1};
const entry = {mainHash:'1', edge:4, tileId:'entry'};
const fixture = {
    format:'deductrium-world-v2', id:'world-picker-browser', title:'World picker browser test',
    revision:1, mode:'extension', region, entry, spawn:{tileId:'entry', rotation:0},
    banks:{}, migrations:[], tiles:[{id:'entry', hash:'1,4', type:0, text:'Mod entrance'}],
};
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) {res.writeHead(403).end(); return;}
        res.setHeader('Content-Type', ({'.js':'text/javascript', '.mjs':'text/javascript',
            '.html':'text/html', '.css':'text/css', '.json':'application/json'})[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch {res.writeHead(404).end();}
});
const ready = async page => {
    await page.waitForFunction(() => window.mapEditor || !document.getElementById('fatal').hidden);
    assert.equal(await page.locator('#fatal').isVisible(), false, await page.locator('#fatal').textContent());
    await page.waitForSelector('#pick-region', {state:'attached'});
};
const openProject = async page => {
    if (!await page.locator('#project-panel').isVisible()) await page.locator('#open-project').click();
    for (const id of ['publish-settings', 'region-settings']) {
        if (!await page.locator('#' + id).evaluate(element => element.open))
            await page.locator('#' + id + ' > summary').click();
    }
};
const canvasReady = async page => {
    if (await page.locator('#task-panel').isVisible()) await page.locator('#close-panel').click();
    if (page.viewportSize().width <= 700 && await page.locator('#toggle-inspector').getAttribute('aria-expanded') === 'true')
        await page.locator('#toggle-inspector').click();
    await page.locator('#map').scrollIntoViewIfNeeded();
};
const projectState = page => page.evaluate(() => ({
    json:JSON.stringify(mapEditor.project.toJSON()),
    undo:mapEditor.project._undo.length, redo:mapEditor.project._redo.length,
}));
const formState = page => page.evaluate(() => Object.fromEntries([
    'region-hash', 'region-edge', 'region-side', 'world-main-hash', 'world-entry-edge',
    'world-entry-tile', 'world-revision', 'world-mode', 'world-spawn', 'world-rotation',
    'tile-name', 'tile-type', 'text-mode', 'text-plain', 'tile-script', 'tile-data',
].map(id => [id, document.getElementById(id).value])));
const pointOnTile = (page, hash) => page.evaluate(async hash => {
    const {Hvec} = await import('/js/hy/algebra.js');
    const world = mapEditor.world, rect = document.getElementById('map').getBoundingClientRect();
    const rotor = world.atlasTile.rotors.get(hash);
    if (!rotor) throw Error(`Tile ${hash} has no visible rotor`);
    const point = world.localCamMat.mul(rotor).apply(new Hvec());
    const scale = world.localDraw.scale / (point.z + 1) * Math.min(rect.width, rect.height) / 2;
    const result = {x:rect.x + rect.width / 2 + point.x * scale, y:rect.y + rect.height / 2 + point.y * scale};
    if (mapEditor.hashAtPoint(result.x, result.y) !== hash) throw Error(`Projected center does not hit ${hash}`);
    const target = document.elementFromPoint(result.x, result.y);
    if (target !== document.getElementById('map')) throw Error(`Tile ${hash} is covered by ${target?.id || target?.className || target?.tagName}`);
    return result;
}, hash);
const clickTile = async (page, hash) => {
    const point = await pointOnTile(page, hash);
    await page.mouse.click(point.x, point.y);
};
const dragCanvas = async page => {
    const rect = await page.locator('#map').boundingBox();
    const before = await page.evaluate(() => JSON.stringify(mapEditor.world.localCamMat));
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 28, rect.y + rect.height / 2 + 15, {steps:6});
    await page.mouse.up();
    assert.notEqual(await page.evaluate(() => JSON.stringify(mapEditor.world.localCamMat)), before, 'picker preserves real camera dragging');
};
const downloadProject = async page => {
    const event = page.waitForEvent('download');
    await page.locator('#export-project').click();
    return JSON.parse(await readFile(await (await event).path(), 'utf8'));
};
const upload = (page, name, value) => page.locator('#file').setInputFiles({
    name, mimeType:'application/json', buffer:Buffer.from(JSON.stringify(value)),
});
const rendered = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function testPersistence(page) {
    const expected = await page.evaluate(() => mapEditor.project.toJSON());
    const saved = await downloadProject(page);
    assert.deepEqual(saved, expected, 'project download includes applied region and entry');
    await page.reload(); await ready(page);
    assert.deepEqual(await page.evaluate(() => mapEditor.project.toJSON()), expected, 'browser draft restores applied world configuration');
    const previous = await page.evaluateHandle(() => mapEditor.project);
    await upload(page, 'restored-picker.project.json', saved);
    await page.waitForFunction(previous => mapEditor.project !== previous, previous);
    await previous.dispose();
    assert.deepEqual(await page.evaluate(() => mapEditor.project.toJSON()), expected, 'downloaded project round-trips through the actual file input');
    await downloadProject(page);
}
async function testReadonly(page) {
    await page.locator('#mode').selectOption('select');
    await page.evaluate(() => mapEditor.selectHash('1', {jump:true}));
    await canvasReady(page);
    const before = await projectState(page);
    await clickTile(page, '1');
    assert.equal(await page.evaluate(() => mapEditor.selectedHash), '1');
    assert.equal(await page.locator('#tile-fields').evaluate(element => element.disabled), true);
    assert.equal(await page.locator('#apply-tile').isDisabled(), true);
    assert.equal(await page.locator('#remove-tile').isDisabled(), true);
    assert.match(await page.locator('#tile-meta').textContent(), /官方地图.*只读/);
    await clickTile(page, '1,4');
    assert.equal(await page.locator('#tile-fields').evaluate(element => element.disabled), false);
    assert.deepEqual(await projectState(page), before, 'readonly and editable selection preserve project/history');
    assert.deepEqual(await page.evaluate(() => ({official:mapEditor.project.canEdit('1'), mod:mapEditor.project.canEdit('1,4')})),
        {official:false, mod:true}, 'applied half-plane preserves official readonly and mod editability');
}
const openInspector = async page => {
    await canvasReady(page);
    if (page.viewportSize().width <= 700 && await page.locator('#toggle-inspector').getAttribute('aria-expanded') !== 'true')
        await page.locator('#toggle-inspector').click();
};
const beginPicker = async (page, kind) => {
    await openProject(page);
    await page.locator('#pick-' + kind).click();
    assert.equal(await page.locator('#world-picker-toolbar').isVisible(), true);
    assert.equal(await page.locator('#world-picker-toolbar').getAttribute('data-kind'), kind);
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), true, 'a fresh picker requires actual map clicks');
    await page.locator('#map').scrollIntoViewIfNeeded();
};
const overlayImage = async page => {
    await rendered(page);
    return page.locator('canvas.world-picker-overlay').screenshot();
};
async function assertShading(page, region, picking = false) {
    await rendered(page);
    const samples = await page.evaluate(async region => {
        const {Hvec} = await import('/js/hy/algebra.js');
        const {regionContains} = await import('/tools/map-editor/geometry.mjs');
        const world = mapEditor.world, overlay = document.querySelector('.world-picker-overlay');
        const rect = overlay.getBoundingClientRect(), ctx = overlay.getContext('2d');
        const scale = world.localDraw.scale * Math.min(rect.width, rect.height) / 2;
        const opposite = {...region, side:-region.side}, samples = {mod:[], outside:[]};
        for (const [hash, rotor] of world.atlasTile.rotors) {
            if (hash === region.hash) continue;
            const point = world.localCamMat.mul(rotor).apply(new Hvec());
            const x = rect.width / 2 + point.x / (point.z + 1) * scale;
            const y = rect.height / 2 + point.y / (point.z + 1) * scale;
            if (x < 8 || x > rect.width - 8 || y < 8 || y > rect.height - 8
                || Math.hypot(x - rect.width / 2, y - rect.height / 2) > scale * .85) continue;
            const group = regionContains(hash, region, world.atlasTile) ? 'mod'
                : regionContains(hash, opposite, world.atlasTile) ? 'outside' : null;
            if (group) samples[group].push({hash, rgba:[...ctx.getImageData(
                Math.round(x * overlay.width / rect.width), Math.round(y * overlay.height / rect.height), 1, 1).data]});
        }
        return samples;
    }, region);
    assert.ok(samples.mod.length && samples.outside.length, 'sample visible whole tiles on both sides of the boundary');
    const shaded = picking ? samples.mod : samples.outside;
    const unshaded = picking ? samples.outside : samples.mod;
    assert.deepEqual(shaded.filter(({rgba:[r,g,b,a]}) => !a || g <= r || g <= b), [],
        picking ? 'while picking, the mod half-plane is shaded green'
            : 'after confirmation, the readonly half-plane is shaded green');
    assert.deepEqual(unshaded.filter(({rgba:[,,,a]}) => a !== 0), [],
        picking ? 'while picking, the readonly half-plane stays unshaded'
            : 'after confirmation, the writable mod half-plane stays unshaded');
}
const nonadjacentOfficial = page => page.evaluate(async () => {
    const {Hvec} = await import('/js/hy/algebra.js');
    const w = mapEditor.world, canvas = document.getElementById('map'), rect = canvas.getBoundingClientRect();
    const modHash = mapEditor.project.tiles.get('1,4').hash;
    for (const [hash, rotor] of w.atlasTile.rotors) {
        const tile = mapEditor.officialTiles.get(hash);
        if (!tile || ![0,3].includes(tile.type)) continue;
        const path = hash ? hash.split(',').map(Number) : [];
        if (Array.from({length:6}, (_,edge) => w.atlasTile.getNeighborAndDir(path, edge, true)[0].join(',')).includes(modHash)) continue;
        const p = w.localCamMat.mul(rotor).apply(new Hvec());
        const scale = w.localDraw.scale / (p.z + 1) * Math.min(rect.width, rect.height) / 2;
        const x = rect.x + rect.width / 2 + p.x * scale, y = rect.y + rect.height / 2 + p.y * scale;
        if (x < rect.x + 24 || x > rect.right - 24 || y < rect.y + 24 || y > rect.bottom - 24) continue;
        if (mapEditor.hashAtPoint(x,y) === hash && document.elementFromPoint(x,y) === canvas) return hash;
    }
    throw Error('No unobscured nonadjacent official walkable tile is visible');
});
async function testRegionPicker(page, viewport, screenshots) {
    await page.evaluate(() => mapEditor.selectHash('1,4', {jump:true}));
    await canvasReady(page);
    await page.locator('#mode').selectOption('1');
    await openInspector(page);
    await page.locator('#tile-name').fill('Unapplied tile draft');
    const before = await projectState(page), oldForms = await formState(page);
    const dirty = await page.evaluate(() => mapEditor.dirty);
    await beginPicker(page, 'region');
    await dragCanvas(page);
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), true, 'drag does not select a boundary');
    await clickTile(page, '1,4');
    assert.equal(await page.locator('.world-picker-edges button').count(), 6);
    await page.locator('#world-picker-edge-0').click();
    assert.equal(await page.locator('#world-picker-edge-0').getAttribute('aria-pressed'), 'true');
    await page.locator('#world-picker-flip').click();
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), true, 'opposite side excludes the mod entrance');
    await page.locator('#world-picker-flip').click();
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), false);
    assert.deepEqual(await formState(page), oldForms, 'in-progress picking preserves every existing form draft');
    assert.deepEqual(await projectState(page), before, 'paint tool cannot draw while the picker owns canvas clicks');
    await page.locator('#world-picker-cancel').click();
    assert.equal(await page.locator('#world-picker-toolbar').isVisible(), false);
    assert.deepEqual(await formState(page), oldForms, 'Cancel preserves the old tile and world forms');
    assert.deepEqual(await projectState(page), before, 'Cancel preserves project and history');
    assert.equal(await page.evaluate(() => mapEditor.dirty), dirty, 'Cancel preserves dirty state');
    await openInspector(page); await page.locator('#reset-form').click();
    await page.evaluate(() => mapEditor.selectHash('1', {jump:true}));
    await beginPicker(page, 'region');
    await clickTile(page, '1');
    await page.locator('#world-picker-edge-4').click();
    const firstSide = await overlayImage(page);
    await page.locator('#world-picker-flip').click();
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), false);
    assert.equal(firstSide.equals(await overlayImage(page)), false, 'flipping changes the rendered half-plane');
    await page.screenshot({path:join(screenshots, `region-${viewport.width}.png`)});
    const unconfirmed = await projectState(page);
    await page.locator('#world-picker-confirm').click();
    assert.deepEqual(await projectState(page), unconfirmed, 'Confirm writes only region draft fields');
    assert.equal(await page.locator('#region-hash').inputValue(), '1');
    assert.equal(await page.locator('#region-edge').inputValue(), '4');
    assert.equal(await page.locator('#region-side').inputValue(), '-1');
    assert.equal(await page.evaluate(() => mapEditor.dirty), true, 'confirmed region remains an unapplied draft');
    await page.locator('#region-apply').click();
    assert.equal(await page.locator('#world-settings-status').getAttribute('data-error'), 'false');
    assert.deepEqual(await page.evaluate(() => mapEditor.project.region), region);

    // Form input must update the same overlay without prematurely changing the model.
    await canvasReady(page); const initialOverlay = await overlayImage(page);
    await openProject(page);
    await page.locator('#region-side').selectOption('1');
    await canvasReady(page);
    assert.equal(initialOverlay.equals(await overlayImage(page)), false, 'manual side edits redraw the overlay');
    assert.deepEqual(await page.evaluate(() => mapEditor.project.region), region);
    await openProject(page); await page.locator('#region-side').selectOption('-1');
    await canvasReady(page);
    assert.equal(initialOverlay.equals(await overlayImage(page)), true, 'restoring the form restores the preview geometry');
    await page.evaluate(() => mapEditor.selectHash('1,4', {jump:true}));
    await beginPicker(page, 'region'); await clickTile(page, '1,4');
    await page.locator('#world-picker-edge-0').click();
    await page.locator('#world-picker-confirm').click();
    assert.deepEqual(await page.evaluate(() => mapEditor.project.region), region, 'new region still waits for Apply');
    await page.locator('#region-apply').click();
    assert.deepEqual(await page.evaluate(() => mapEditor.project.region), {hash:'1,4', edge:0, side:1}, 'Apply commits the selected equivalent boundary');
    assert.equal(await page.locator('#mode').inputValue(), '1', 'picker preserves the chosen paint tool');
    await testReadonly(page);
}
async function testEntryPicker(page, viewport, screenshots) {
    await page.evaluate(() => mapEditor.selectHash('1', {jump:true}));
    await canvasReady(page); await page.locator('#mode').selectOption('1');
    await openProject(page); await page.locator('#world-revision').fill('2');
    const before = await projectState(page), forms = await formState(page);
    await beginPicker(page, 'entry');
    await clickTile(page, '1,4');
    assert.match(await page.locator('#world-picker-status').textContent(), /先选择官方/);
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), true);
    await clickTile(page, await nonadjacentOfficial(page)); await clickTile(page, '1,4');
    assert.match(await page.locator('#world-picker-status').textContent(), /必须直接相邻/);
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), true, 'nonadjacent official/mod pair cannot confirm');
    await dragCanvas(page); await clickTile(page, '1');
    assert.match(await page.locator('#world-picker-status').textContent(), /第 2 步/);
    await clickTile(page, '1,4');
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), false);
    assert.deepEqual(await projectState(page), before, 'entry selection cannot paint the existing mod tile');
    assert.deepEqual(await formState(page), forms, 'entry preview keeps the old world form intact');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#world-picker-toolbar').isVisible(), false, 'Escape cancels entry picking');
    assert.deepEqual(await formState(page), forms); assert.deepEqual(await projectState(page), before);
    await beginPicker(page, 'entry'); await clickTile(page, '1'); await clickTile(page, '1,4');
    await page.screenshot({path:join(screenshots, `entry-${viewport.width}.png`)});
    await page.locator('#world-picker-confirm').click();
    assert.deepEqual(await projectState(page), before, 'entry Confirm does not apply world settings');
    assert.equal(await page.locator('#world-main-hash').inputValue(), '1');
    assert.equal(await page.locator('#world-entry-edge').inputValue(), '4');
    assert.equal(await page.locator('#world-entry-tile').inputValue(), 'entry');
    assert.equal(await page.locator('#world-revision').inputValue(), '2', 'entry Confirm preserves unrelated world drafts');
    assert.equal(await page.locator('#region-hash').inputValue(), forms['region-hash']);
    const adjacency = await page.evaluate(() => {
        const official = document.getElementById('world-main-hash').value.split(',').map(Number);
        const edge = Number(document.getElementById('world-entry-edge').value);
        const id = document.getElementById('world-entry-tile').value;
        return {neighbor:mapEditor.project.polygon.getNeighborAndDir(official, edge, true)[0].join(','),
            mod:[...mapEditor.project.tiles.values()].find(tile => tile.id === id).hash};
    });
    assert.deepEqual(adjacency, {neighbor:'1,4', mod:'1,4'}, 'generated edge describes genuine native adjacency');
    await canvasReady(page); const validEntryOverlay = await overlayImage(page);
    await openProject(page); await page.locator('#world-main-hash').fill('');
    await canvasReady(page);
    assert.equal(validEntryOverlay.equals(await overlayImage(page)), false, 'manual official-entry field changes redraw the connecting overlay');
    assert.deepEqual(await projectState(page), before, 'manual entry edits remain drafts');
    await openProject(page); await page.locator('#world-main-hash').fill('1');
    await canvasReady(page);
    assert.equal(validEntryOverlay.equals(await overlayImage(page)), true, 'restoring official-entry field restores the connecting overlay');
    await openProject(page);
    await page.locator('#world-apply').click();
    assert.equal(await page.locator('#world-settings-status').getAttribute('data-error'), 'false');
    assert.equal(await page.evaluate(() => mapEditor.project.world.revision), 2);
    assert.deepEqual(await page.evaluate(() => mapEditor.project.world.entry), entry);
    await testPersistence(page); await testReadonly(page);
}
async function testStandaloneEntry(page, viewport, screenshots) {
    const standalone = structuredClone(fixture);
    standalone.id = 'world-picker-standalone'; standalone.mode = 'standalone'; delete standalone.entry;
    await upload(page, 'standalone.world.json', standalone);
    await page.waitForFunction(() => mapEditor.project.id === 'world-picker-standalone');
    const visibleHashes = page => page.evaluate(async () => [...(await import('/js/hy/maploader.js')).blockMap.keys()].sort());
    assert.deepEqual(await visibleHashes(page), ['1,4'], 'standalone initially displays only mod tiles');
    await page.evaluate(() => mapEditor.selectHash('1', {jump:true}));
    await canvasReady(page); await page.locator('#mode').selectOption('1');
    const before = await projectState(page), forms = await formState(page);
    await beginPicker(page, 'entry');
    assert.equal((await visibleHashes(page)).length, 2121, 'entry picker temporarily displays the official base');
    await clickTile(page, '1'); await clickTile(page, '1,4');
    await page.keyboard.press('Escape');
    assert.deepEqual(await projectState(page), before); assert.deepEqual(await formState(page), forms);
    assert.deepEqual(await visibleHashes(page), ['1,4'], 'Cancel removes the temporary official base');
    await beginPicker(page, 'entry'); await clickTile(page, '1'); await clickTile(page, '1,4');
    await page.screenshot({path:join(screenshots, `standalone-entry-${viewport.width}.png`)});
    await page.locator('#world-picker-confirm').click();
    assert.deepEqual(await projectState(page), before, 'standalone entry confirmation changes drafts only');
    assert.equal(await page.evaluate(() => mapEditor.project.world.mode), 'standalone');
    assert.equal(await page.locator('#world-mode').inputValue(), 'extension');
    assert.equal(await page.locator('#world-main-hash').inputValue(), '1');
    assert.equal(await page.locator('#world-entry-edge').inputValue(), '4');
    assert.equal(await page.locator('#world-entry-tile').inputValue(), 'entry');
    assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 1, 'temporary official base never enters the project');
    await page.locator('#world-apply').click();
    assert.equal(await page.locator('#world-settings-status').getAttribute('data-error'), 'false');
    assert.equal(await page.evaluate(() => mapEditor.project.world.mode), 'extension');
    assert.deepEqual(await page.evaluate(() => mapEditor.project.world.entry), entry);
    assert.equal((await visibleHashes(page)).length, 2121, 'official base becomes visible after applying extension mode');
    await testReadonly(page); await testPersistence(page);
}
async function testEdgeButtonHitTargets(page, viewport, screenshots) {
    await canvasReady(page);
    await page.locator('#file-menu > summary').click();
    await page.locator('#new-project').click();
    await page.waitForFunction(() => mapEditor.project.tiles.size === 0);
    await page.evaluate(() => mapEditor.selectHash('', {jump:true}));
    await canvasReady(page); await page.locator('#mode').selectOption('1');
    const before = await projectState(page), forms = await formState(page);
    await beginPicker(page, 'region');
    const rect = await page.locator('#map').boundingBox();
    const point = viewport.width <= 700 ? {x:262, y:448}
        : {x:rect.x + rect.width * .68, y:rect.y + rect.height * .65};
    assert.equal(await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.id, point), 'map', 'empty-world reproduction starts on an unobscured canvas point');
    const boundaryHash = await page.evaluate(({x,y}) => mapEditor.hashAtPoint(x,y), point);
    await page.mouse.click(point.x, point.y); await rendered(page);
    await page.screenshot({path:join(screenshots, `empty-region-edges-${viewport.width}.png`)});
    const buttons = await page.locator('.world-picker-edges button').evaluateAll(buttons => buttons.map(button => {
        const r = button.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
        return {id:button.id, width:r.width, height:r.height, center:{x:r.x + r.width/2, y:r.y + r.height/2},
            self:button === target || button.contains(target), actual:target?.id || target?.className || target?.tagName};
    }));
    assert.equal(buttons.length, 6);
    assert.deepEqual(buttons.filter(button => !button.self || button.width < 44 || button.height < 44), [],
        `every edge has an unobscured 44px hit target: ${JSON.stringify(buttons)}`);
    await page.evaluate(hash => {
        // Centre the boundary so both entire neighbouring polygons remain visible for pixel checks.
        const world = mapEditor.world;
        world.localCamMat = world.atlasTile.rotors.get(hash).conj();
        mapEditor.redraw();
    }, boundaryHash);
    for (let edge = 0; edge < 6; edge++) {
        await page.locator(`#world-picker-edge-${edge}`).click();
        assert.equal(await page.locator(`#world-picker-edge-${edge}`).getAttribute('aria-pressed'), 'true');
        await assertShading(page, {hash:boundaryHash, edge, side:1}, true);
        await page.locator('#world-picker-flip').click();
        await assertShading(page, {hash:boundaryHash, edge, side:-1}, true);
        await page.locator('#world-picker-flip').click();
    }
    await page.keyboard.press('Escape');
    assert.deepEqual(await projectState(page), before, 'empty-world edge selection cannot paint tiles');
    assert.deepEqual(await formState(page), forms, 'Escape preserves blank-world forms');
    assert.equal(await page.locator('#world-picker-toolbar').isVisible(), false);

    // The first extension setup cannot be applied until its range exists.
    // Its draft mode must still expose the official boundary for visual picking.
    await openProject(page); await page.locator('#world-mode').selectOption('extension');
    const extensionDraft = await formState(page);
    await beginPicker(page, 'region');
    assert.equal(await page.evaluate(async () => (await import('/js/hy/maploader.js')).blockMap.size), 2120,
        'an unapplied extension mode exposes the official base while picking its first range');
    await clickTile(page, '1'); await page.locator('#world-picker-edge-4').click();
    await page.locator('#world-picker-flip').click();
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), false,
        'the valid outside half-plane accepts every official polygon on its readonly side');
    await page.keyboard.press('Escape');
    assert.deepEqual(await projectState(page), before, 'draft extension range selection keeps the empty project untouched');
    assert.deepEqual(await formState(page), extensionDraft, 'cancelling keeps the unapplied extension form');
    assert.equal(await page.evaluate(async () => (await import('/js/hy/maploader.js')).blockMap.size), 0,
        'cancelling removes the temporary official base from an empty project');
}

async function testConfirmedReadonlyShading(page, viewport, screenshots) {
    await canvasReady(page);
    await page.locator('#file-menu > summary').click();
    await page.locator('#new-project').click();
    await page.evaluate(() => mapEditor.selectHash('', {jump:true}));
    await beginPicker(page, 'region');
    const rect = await page.locator('#map').boundingBox();
    const point = viewport.width <= 700 ? {x:262, y:448}
        : {x:rect.x + rect.width * .68, y:rect.y + rect.height * .65};
    assert.equal(await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.id, point), 'map');
    const hash = await page.evaluate(({x,y}) => mapEditor.hashAtPoint(x,y), point);
    await page.mouse.click(point.x, point.y);
    await page.locator('#world-picker-edge-2').click();
    const chosen = {hash, edge:2, side:1};
    const centerBoundary = () => page.evaluate(hash => {
        const world = mapEditor.world;
        mapEditor.selectHash(hash, {jump:true});
        world.localCamMat = world.atlasTile.rotors.get(hash).conj();
        mapEditor.redraw();
    }, hash);
    await centerBoundary();
    await assertShading(page, chosen, true);
    const before = await projectState(page);
    await page.locator('#world-picker-confirm').click();
    assert.deepEqual(await projectState(page), before, 'confirmation preserves the saved writable range until Apply');
    assert.match(await page.locator('#world-settings-status').textContent(), /涂色侧不可写/);
    await canvasReady(page);
    await assertShading(page, chosen);
    await openProject(page); await page.locator('#region-apply').click();
    assert.deepEqual(await page.evaluate(() => mapEditor.project.region), chosen, 'shading never inverts the saved writable side');
    await canvasReady(page); await assertShading(page, chosen);
    assert.deepEqual(await page.evaluate(async region => {
        const {regionContains} = await import('/tools/map-editor/geometry.mjs');
        return [...mapEditor.world.atlasTile.rotors.keys()].filter(hash =>
            mapEditor.project.canEdit(hash) !== regionContains(hash, region, mapEditor.world.atlasTile));
    }, chosen), [], 'actual edit permissions agree with the unshaded half-plane');
    await page.reload(); await ready(page);
    assert.deepEqual(await page.evaluate(() => mapEditor.project.region), chosen);
    await canvasReady(page); await centerBoundary(); await assertShading(page, chosen);
    await page.screenshot({path:join(screenshots, `readonly-applied-${viewport.width}.png`)});
}

let browser;
try {
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const {chromium} = await import(process.env.PLAYWRIGHT_MODULE
        ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
    browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH
        ? {executablePath:process.env.CHROME_PATH} : {channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'})});
    const screenshots = await mkdtemp(join(tmpdir(), 'deductrium-world-picker-'));
    const url = `http://127.0.0.1:${server.address().port}/tools/map-editor/index.html`;
    for (const viewport of [{width:1440, height:1000}, {width:390, height:844}]) {
        const context = await browser.newContext({viewport, acceptDownloads:true, colorScheme:'light'});
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        try {
            await page.goto(url); await ready(page);
            await upload(page, 'picker.world.json', fixture);
            await page.waitForFunction(() => mapEditor.project.id === 'world-picker-browser');
            assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 1, 'world fixture contains mod tiles only');
            assert.deepEqual(await page.evaluate(() => mapEditor.project.region), region);
            assert.deepEqual(await page.evaluate(() => mapEditor.project.world.entry), entry);
            await page.evaluate(() => mapEditor.selectHash('1', {jump:true}));
            await canvasReady(page);
            const officialBase = await page.evaluate(async () => {
                const {blockMap} = await import('/js/hy/maploader.js');
                return JSON.stringify([...blockMap].filter(([hash]) => hash !== '1,4').sort(([a],[b]) => a.localeCompare(b)));
            });
            assert.equal(JSON.parse(officialBase).length, 2120, 'full official map is loaded independently of the mod fixture');
            assert.equal(JSON.parse(officialBase).find(([hash]) => hash === '1')[1].type, 0);
            await downloadProject(page);
            await testRegionPicker(page, viewport, screenshots);
            await testEntryPicker(page, viewport, screenshots);
            assert.equal(await page.evaluate(async () => {
                const {blockMap} = await import('/js/hy/maploader.js');
                return JSON.stringify([...blockMap].filter(([hash]) => hash !== '1,4').sort(([a],[b]) => a.localeCompare(b)));
            }), officialBase, 'picker interactions leave all 2120 official tile bodies unchanged');
            await testStandaloneEntry(page, viewport, screenshots);
            await testEdgeButtonHitTargets(page, viewport, screenshots);
            await testConfirmedReadonlyShading(page, viewport, screenshots);
            assert.deepEqual(errors, []);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no mobile horizontal overflow');
            console.log(JSON.stringify({viewport, region:'PASS', entry:'PASS', standaloneEntry:'PASS', edgeHitTargets:'PASS', readonlyShading:'preview/confirm/apply/reload PASS',
                canvas:'click/drag/edge/flip/cancel/paint suppression', drafts:'explicit apply/preservation/manual overlay sync',
                persistence:'project download/upload/browser restore', officialReadonly:'PASS', errors, screenshots}));
        } finally {await context.close();}
    }
} finally {
    await browser?.close();
    if (server.listening) await new Promise(done => server.close(done));
}
