// Run: node test/browser/map-attachment.mjs [repository root]
// Uses generated js/ as-is. Set PLAYWRIGHT_MODULE and optionally MAP_EDITOR_URL.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp} from 'node:fs/promises';
import {resolve, extname, sep, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const fixture = {
    format:'deductrium-map-project-v1', id:'attachment-browser', title:'Origin attachment regression',
    version:1, tiling:{p:6,q:4}, tiles:[{
        id:'origin-entry', hash:'', type:0, name:'front', text:{ja:'入口', en:'Original entry'},
        data:{script:'// Keep this source exactly\r\nrequire tile wing::next == road\r\nmessage "入口 → next"',
            unknown:{preserve:['IDs', 'script', {nested:true}]}},
    }],
    modules:[{
        format:'deductrium-map-module-v1', id:'corridor', title:'Existing corridor', version:1,
        tiling:{p:6,q:4}, tiles:[{id:'next', at:[], type:0, name:'next', text:'Existing neighbor',
            data:{script:'require tile next == road', info:{zh:'原有提示', en:'Keep this info'}}}], ports:{},
    }],
    instances:[{id:'wing', moduleId:'corridor', at:[3], rotation:2}],
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
    await page.waitForSelector('#pick-entry', {state:'attached'});
};
const upload = async (page, value = fixture) => {
    const previous = await page.evaluateHandle(() => mapEditor.project);
    await page.locator('#file').setInputFiles({name:'attachment.project.json', mimeType:'application/json',
        buffer:Buffer.from(JSON.stringify(value))});
    await page.waitForFunction(previous => mapEditor.project !== previous, previous);
    await previous.dispose();
};
const canvasReady = async page => {
    if (await page.locator('#task-panel').isVisible()) await page.locator('#close-panel').click();
    if (page.viewportSize().width <= 700 && await page.locator('#toggle-inspector').getAttribute('aria-expanded') === 'true')
        await page.locator('#toggle-inspector').click();
};
const openInspector = async page => {
    await canvasReady(page);
    if (page.viewportSize().width <= 700 && await page.locator('#toggle-inspector').getAttribute('aria-expanded') !== 'true')
        await page.locator('#toggle-inspector').click();
};
const openProject = async page => {
    if (!await page.locator('#project-panel').isVisible()) await page.locator('#open-project').click();
    for (const id of ['publish-settings', 'region-settings'])
        if (!await page.locator('#' + id).evaluate(element => element.open))
            await page.locator('#' + id + ' > summary').click();
};
const projectState = page => page.evaluate(() => ({json:mapEditor.project.toJSON(),
    tiles:[...mapEditor.project.tiles.values()], undo:mapEditor.project._undo.length, redo:mapEditor.project._redo.length}));
const formState = page => page.evaluate(() => Object.fromEntries([
    'region-hash', 'region-edge', 'region-side', 'world-main-hash', 'world-entry-edge',
    'world-entry-tile', 'world-revision', 'world-mode', 'world-spawn', 'world-rotation',
    'world-banks', 'world-migrations', 'tile-name', 'tile-type', 'text-mode',
    'text-plain', 'text-zh', 'text-en', 'text-other', 'tile-script', 'tile-data',
].map(id => [id, document.getElementById(id).value])));
const scene = page => page.evaluate(async () => [...(await import('/js/hy/maploader.js')).blockMap]);
const official = page => page.evaluate(() => [...mapEditor.officialTiles]);
const begin = async page => {
    await openProject(page); await page.locator('#pick-entry').click();
    assert.equal(await page.locator('#world-picker-toolbar').isVisible(), true);
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), true);
};
const pointOnTile = (page, hash) => page.evaluate(async hash => {
    const {Hvec} = await import('/js/hy/algebra.js');
    const world = mapEditor.world, canvas = document.getElementById('map'), rect = canvas.getBoundingClientRect();
    const rotor = world.atlasTile.rotors.get(hash);
    if (!rotor) throw Error(`No visible rotor for ${hash || 'origin'}`);
    const p = world.localCamMat.mul(rotor).apply(new Hvec());
    const scale = world.localDraw.scale / (p.z + 1) * Math.min(rect.width, rect.height) / 2;
    const center = {x:rect.x + rect.width / 2 + p.x * scale, y:rect.y + rect.height / 2 + p.y * scale};
    for (const [dx,dy] of [[0,0], [0,24], [24,0], [-24,0], [0,-24]]) {
        const point = {x:center.x + dx, y:center.y + dy};
        if (mapEditor.hashAtPoint(point.x,point.y) === hash && document.elementFromPoint(point.x,point.y) === canvas)
            return point;
    }
    throw Error(`Tile ${hash || 'origin'} is covered or outside the canvas`);
}, hash);
const clickTile = async (page, hash) => {
    const point = await pointOnTile(page, hash);
    await page.mouse.click(point.x, point.y);
};
const dragCanvas = async page => {
    const point = await pointOnTile(page, '');
    const before = await page.evaluate(() => JSON.stringify(mapEditor.world.localCamMat));
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.mouse.move(point.x + 24, point.y + 12, {steps:6}); await page.mouse.up();
    assert.notEqual(await page.evaluate(() => JSON.stringify(mapEditor.world.localCamMat)), before,
        'actual dragging still moves the camera while the picker owns clicks');
};
const assertModOnly = async (page, expected) => {
    const visible = await scene(page);
    assert.deepEqual(visible.map(([hash]) => hash).sort(), expected.tiles.map(tile => tile.hash).sort(),
        'source selection renders only existing mod tiles, without the overlaid official map');
    for (const tile of expected.tiles)
        assert.equal(JSON.stringify(visible.find(([hash]) => hash === tile.hash)[1].data), JSON.stringify(tile.data));
};
const assertOfficialOnly = async (page, expected) => {
    assert.deepEqual(await scene(page), expected, 'anchor selection renders the untouched official map, without old mod overrides');
};
async function sourceToAnchor(page, original, base) {
    await assertModOnly(page, original);
    await clickTile(page, '');
    await assertOfficialOnly(page, base);
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), true,
        'overlapping origin click selects the stable mod source, rather than confirming an official origin');
}
async function edgeButton(page, edge) {
    const button = page.locator(`#world-picker-edge-${edge}`);
    const hit = await button.evaluate(element => {
        const r = element.getBoundingClientRect();
        return {width:r.width, height:r.height,
            own:document.elementFromPoint(r.x + r.width / 2,r.y + r.height / 2) === element};
    });
    assert.ok(hit.width >= 44 && hit.height >= 44 && hit.own, `edge ${edge} has an unobscured 44px target`);
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
}
async function previewPlacement(page) {
    await clickTile(page, '1');
    assert.equal(await page.locator('.world-picker-edges button').count(), 6);
    await edgeButton(page, 0);
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), true,
        'a destination occupied by the official origin rejects the entire placement');
    for (let edge = 0; edge < 6; edge++) await edgeButton(page, edge);
    await edgeButton(page, 4);
    for (let turn = 0; turn < 6; turn++) {
        if (!await page.locator('#world-picker-confirm').isDisabled()) return;
        await page.locator('#world-picker-rotate').click();
    }
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), false,
        `one of the six rigid rotations must fit: ${await page.locator('#world-picker-status').textContent()}`);
}
async function testCancellation(page, base) {
    await upload(page);
    await page.evaluate(() => mapEditor.selectHash('', {jump:true}));
    await openInspector(page); await page.locator('#tile-name').fill('Unapplied name draft');
    await openProject(page); await page.locator('#world-revision').fill('7');
    await page.locator('#mode').selectOption('1');
    const before = await projectState(page), forms = await formState(page), dirty = await page.evaluate(() => mapEditor.dirty);
    for (const phase of ['source', 'anchor', 'preview', 'staged']) {
        await begin(page); await assertModOnly(page, before);
        await dragCanvas(page);
        assert.equal(await page.locator('#world-picker-confirm').isDisabled(), true, 'drag cannot select or paint a source');
        if (phase !== 'source') await sourceToAnchor(page, before, base);
        if (phase === 'preview' || phase === 'staged') {
            await page.locator('#world-picker-reselect').click();
            await sourceToAnchor(page, before, base);
            await previewPlacement(page);
            if (phase === 'preview') {
                const first = await page.locator('#world-picker-status').textContent();
                await page.locator('#world-picker-rotate').click();
                assert.notEqual(await page.locator('#world-picker-status').textContent(), first, 'rotation changes the placement preview');
            }
        }
        assert.deepEqual(await projectState(page), before, `${phase} preview preserves project, instances and history`);
        assert.deepEqual(await formState(page), forms, `${phase} preview preserves every raw form draft`);
        if (phase === 'staged') {
            await page.locator('#world-picker-confirm').click();
            assert.deepEqual(await projectState(page), before, 'confirmed relocation is still only a draft');
            assert.equal(await page.locator('#world-entry-tile').inputValue(), 'origin-entry');
            assert.equal(await page.locator('#world-cancel-placement').isVisible(), true);
            await page.locator('#world-cancel-placement').click();
            assert.equal(await page.locator('#world-cancel-placement').isVisible(), false);
        } else if (phase === 'anchor') await page.locator('#world-picker-cancel').click();
        else await page.keyboard.press('Escape');
        assert.equal(await page.locator('#world-picker-toolbar').isVisible(), false);
        assert.deepEqual(await projectState(page), before, `${phase} cancellation preserves project/history`);
        assert.deepEqual(await formState(page), forms, `${phase} cancellation preserves old world and tile drafts`);
        assert.equal(await page.evaluate(() => mapEditor.dirty), dirty);
        await assertModOnly(page, before);
    }
}
const tileContents = tiles => tiles.map(({hash, ...tile}) => tile).sort((a,b) => a.id.localeCompare(b.id));
async function testStalePreview(page, base) {
    await upload(page, {...fixture, tiles:[{...fixture.tiles[0], data:{}}], modules:[], instances:[]});
    await page.evaluate(() => mapEditor.selectHash('', {jump:true}));
    await canvasReady(page); await page.locator('#mode').selectOption('1');
    const initial = await projectState(page);
    await page.evaluate(() => mapEditor.applyProject(project => project.put('3', {
        type:0, text:'Undo-added neighbor', data:{},
    })));
    const twoTiles = await projectState(page);
    assert.equal(twoTiles.tiles.length, 2);
    await begin(page); await sourceToAnchor(page, twoTiles, base); await previewPlacement(page);
    const identity = await page.evaluateHandle(() => mapEditor.project);
    await page.locator('#undo').click();
    assert.equal(await page.evaluate(previous => mapEditor.project === previous, identity), true,
        'the real Undo button mutates the same project object');
    await identity.dispose();
    assert.deepEqual((await projectState(page)).json, initial.json);
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), true,
        'Undo invalidates the two-tile candidate immediately, before Confirm');
    await assertModOnly(page, initial);
    assert.equal(await page.locator('#world-cancel-placement').isVisible(), false);

    // Redo must not resurrect the stale candidate. Generate a fresh one explicitly.
    await page.locator('#redo').click();
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), true);
    await sourceToAnchor(page, twoTiles, base); await previewPlacement(page);
    // Also cover a change without a notification: Confirm must compare live JSON itself.
    await page.evaluate(() => mapEditor.project.undo());
    await page.locator('#world-picker-confirm').click();
    assert.equal(await page.locator('#world-picker-toolbar').isVisible(), true);
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), true,
        'Confirm rejects a candidate whose source changed without a project-change event');
    assert.equal(await page.locator('#world-cancel-placement').isVisible(), false);
    await assertModOnly(page, initial);

    const current = await projectState(page);
    await sourceToAnchor(page, current, base); await previewPlacement(page);
    await page.locator('#world-picker-confirm').click();
    assert.equal(await page.locator('#world-cancel-placement').isVisible(), true,
        'a regenerated candidate can still be staged');
    assert.deepEqual(await projectState(page), current);
    await page.evaluate(() => mapEditor.project.redo());
    const changed = await projectState(page);
    await page.locator('#world-apply').click();
    assert.equal(await page.locator('#world-settings-status').getAttribute('data-error'), 'true');
    assert.match(await page.locator('#world-settings-status').textContent(), /项目已变化/,
        'the existing settings guard still rejects changes after Confirm');
    assert.deepEqual(await projectState(page), changed);
    await page.locator('#world-cancel-placement').click();
}
async function download(page, id) {
    const event = page.waitForEvent('download'); await page.locator('#' + id).click();
    return JSON.parse(await readFile(await (await event).path(), 'utf8'));
}
async function testApply(page, base, screenshots) {
    await upload(page);
    await page.evaluate(() => mapEditor.selectHash('', {jump:true}));
    await canvasReady(page); await page.locator('#mode').selectOption('1');
    const before = await projectState(page);
    assert.deepEqual(before.tiles.map(t => t.hash).sort(), ['', '3']);
    await begin(page); await sourceToAnchor(page, before, base); await previewPlacement(page);
    await page.screenshot({path:join(screenshots, `attachment-preview-${page.viewportSize().width}.png`)});
    assert.deepEqual(await projectState(page), before, 'valid rigid preview is not a project edit');
    await page.locator('#world-picker-confirm').click();
    assert.deepEqual(await projectState(page), before, 'Confirm stages entry, region and relocation without moving a tile');
    assert.equal(await page.locator('#world-mode').inputValue(), 'extension');
    assert.equal(await page.locator('#world-main-hash').inputValue(), '1');
    assert.equal(await page.locator('#world-entry-edge').inputValue(), '4');
    assert.equal(await page.locator('#world-entry-tile').inputValue(), 'origin-entry');
    assert.equal(await page.locator('#world-spawn').inputValue(), 'origin-entry', 'empty spawn is filled from the chosen stable source ID');
    const stagedRegion = {hash:await page.locator('#region-hash').inputValue(),
        edge:Number(await page.locator('#region-edge').inputValue()), side:Number(await page.locator('#region-side').inputValue())};
    assert.equal(await page.evaluate(() => mapEditor.dirty), true);
    await page.locator('#world-apply').click();
    assert.equal(await page.locator('#world-settings-status').getAttribute('data-error'), 'false',
        await page.locator('#world-settings-status').textContent());
    const applied = await projectState(page);
    assert.equal(applied.undo, before.undo + 1, 'world settings, half-plane and the entire mod move form ONE undo item');
    assert.equal(applied.redo, 0);
    assert.deepEqual(tileContents(applied.tiles), tileContents(before.tiles), 'stable IDs, names, source scripts and arbitrary data survive unchanged');
    assert.deepEqual(applied.json.modules, before.json.modules, 'the local module library is not rewritten');
    assert.deepEqual(applied.json.instances.map(({at,rotation,...instance}) => instance),
        before.json.instances.map(({at,rotation,...instance}) => instance), 'instance identity and module references survive');
    assert.notDeepEqual(applied.json.instances, before.json.instances, 'module placement coordinates move with the raw source');
    assert.ok(applied.tiles.every(tile => !['', '3'].includes(tile.hash)), 'both old origin coordinates are vacated');
    assert.deepEqual(applied.json.region, stagedRegion);
    assert.equal(applied.json.world.mode, 'extension');
    assert.deepEqual(applied.json.world.entry, {mainHash:'1', edge:4, tileId:'origin-entry'});
    const checks = await page.evaluate(async () => {
        const {regionContains} = await import('/tools/map-editor/geometry.mjs');
        const {buildWorld} = await import('/tools/map-editor/publish.mjs');
        const {blockMap} = await import('/js/hy/maploader.js');
        const p = mapEditor.project, poly = p.polygon, region = p.region, opposite = {...region, side:-region.side};
        const entry = p.world.entry, tile = [...p.tiles.values()].find(t => t.id === entry.tileId);
        const neighbor = poly.getNeighborAndDir([1],4,true)[0].join(',');
        const mod = [...p.tiles.values()];
        return {exactNeighbor:tile.hash === neighbor,
            modInside:mod.every(t => regionContains(t.hash,region,poly)),
            officialOutside:[...mapEditor.officialTiles.keys()].every(h => regionContains(h,opposite,poly)),
            noOverlap:mod.every(t => !mapEditor.officialTiles.has(t.hash)),
            adjacency:Array.from({length:6},(_,e)=>poly.getNeighborAndDir(tile.hash.split(',').map(Number),e,true)[0].join(','))
                .includes(mod.find(t => t.id === 'wing::next').hash),
            readonly:!p.canEdit('1') && mod.every(t => p.canEdit(t.hash)),
            officialRendered:[...mapEditor.officialTiles].every(([h,t]) => JSON.stringify(blockMap.get(h)) === JSON.stringify(t)),
            published:buildWorld(p)};
    });
    for (const key of ['exactNeighbor', 'modInside', 'officialOutside', 'noOverlap', 'adjacency', 'readonly', 'officialRendered'])
        assert.equal(checks[key], true, key);
    assert.deepEqual(await official(page), base, 'all 2120 official tiles retain their original content');
    await canvasReady(page); await page.screenshot({path:join(screenshots, `attachment-applied-${page.viewportSize().width}.png`)});
    await page.locator('#undo').click();
    assert.deepEqual((await projectState(page)).json, before.json, 'one Undo restores raw coordinates, instances and world settings together');
    await assertModOnly(page, before);
    await page.locator('#redo').click();
    assert.deepEqual((await projectState(page)).json, applied.json, 'one Redo restores the complete attachment');
    const saved = await download(page, 'export-project');
    assert.deepEqual(saved, applied.json);
    await openProject(page); const published = await download(page, 'export-world');
    assert.deepEqual(published, checks.published, 'actual world download includes the relocated coordinates and stable IDs');
    await page.reload(); await ready(page);
    assert.deepEqual((await projectState(page)).json, saved, 'browser draft restores moved module placements');
    await upload(page, saved);
    assert.deepEqual((await projectState(page)).json, saved, 'saved project file reconstructs the moved instances');
    await upload(page, published);
    const reopened = await page.evaluate(async () => (await import('/tools/map-editor/publish.mjs')).buildWorld(mapEditor.project));
    assert.deepEqual(reopened, published, 'published world file round-trips the complete relocated mod');
    return saved;
}
async function testAdjacentAndManual(page, saved, base) {
    await upload(page, saved);
    await page.evaluate(() => mapEditor.selectHash('1', {jump:true}));
    const before = await projectState(page), forms = await formState(page);
    await begin(page);
    assert.equal((await scene(page)).length, base.length + before.tiles.length, 'nonoverlapping mod retains the existing direct attachment workflow');
    await clickTile(page, '1');
    await clickTile(page, before.tiles.find(t => t.id === 'origin-entry').hash);
    assert.equal(await page.locator('#world-picker-confirm').isDisabled(), false);
    await page.locator('#world-picker-confirm').click();
    assert.deepEqual(await projectState(page), before, 'direct-path Confirm remains draft-only');
    assert.equal(await page.locator('#world-entry-tile').inputValue(), 'origin-entry');
    await page.reload(); await ready(page);
    await page.evaluate(() => mapEditor.selectHash('1', {jump:true}));
    const resetForms = await formState(page);
    await begin(page); await page.locator('#world-picker-relocate').click();
    await assertModOnly(page, before);
    await page.keyboard.press('Escape');
    assert.deepEqual(await formState(page), resetForms, 'manual relocation Cancel restores the existing attachment form');
    assert.deepEqual((await projectState(page)).json, before.json);
    assert.equal(forms['world-entry-tile'], 'origin-entry');
}

let browser;
try {
    if (!process.env.MAP_EDITOR_URL) await new Promise(done => server.listen(0, '127.0.0.1', done));
    const {chromium} = await import(process.env.PLAYWRIGHT_MODULE
        ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
    browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH
        ? {executablePath:process.env.CHROME_PATH} : {channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'})});
    const screenshots = await mkdtemp(join(tmpdir(), 'deductrium-attachment-'));
    const url = process.env.MAP_EDITOR_URL || `http://127.0.0.1:${server.address().port}/tools/map-editor/index.html`;
    for (const viewport of [{width:1440,height:1000}, {width:390,height:844}]) {
        const context = await browser.newContext({viewport, acceptDownloads:true, colorScheme:'light'});
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        try {
            await page.goto(url); await ready(page);
            const base = await official(page); assert.equal(base.length, 2120);
            await testStalePreview(page, base);
            await testCancellation(page, base);
            const saved = await testApply(page, base, screenshots);
            await testAdjacentAndManual(page, saved, base);
            assert.deepEqual(errors, []);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            console.log(JSON.stringify({viewport, relocation:'PASS', cancellation:'source/anchor/preview/staged + raw drafts PASS',
                geometry:'exact neighbor/all six vertices/official 2120 unchanged PASS',
                identity:'tile/module/script/data PASS', history:'single Undo/Redo + stale-preview rejection PASS',
                persistence:'project/world download + reload/upload PASS', directPath:'PASS', errors, screenshots}));
        } catch (error) {
            await page.screenshot({path:join(screenshots, `attachment-failure-${viewport.width}.png`)}).catch(() => {});
            console.error(JSON.stringify({viewport, status:await page.locator('#world-picker-status').textContent().catch(() => ''),
                worldStatus:await page.locator('#world-settings-status').textContent().catch(() => ''), errors, screenshots}));
            throw error;
        } finally {await context.close();}
    }
} finally {
    await browser?.close();
    if (server.listening) await new Promise(done => server.close(done));
}
