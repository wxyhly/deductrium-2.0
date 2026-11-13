// Run against the application's compiled JavaScript, with its actual UTF-16 save codec.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {SUPPORTED_ENGINE_VERSION, validatePublication} from '../js/hy/publication.js';
import {parseWorld, worldSaveMeta, migrateWorldSave, worldTileId} from '../js/hy/world.js';
import {importMod, installMods, MOD_LIBRARY_KEY, readModLibrary, saveModLibrary, setModEnabled} from '../js/hy/mods.js';
import {prepareModSave} from '../js/hy/mod-saves.js';
import {parseWorldBundle, exportWorldBundle, importWorldBundle, snapshotWorldBundle, restoreWorldBundleSave,
    readPendingWorldBundle, migrationDiff, WORLD_BUNDLE_FORMAT, WORLD_BUNDLE_PENDING_KEY} from '../js/hy/world-bundle.js';
import {SaveLoad} from '../js/saveload.js';

globalThis.LZString = runInNewContext(readFileSync(new URL('../lib/lz-string.min.js', import.meta.url), 'utf8') + '\nLZString;');
const clone = value => structuredClone(value);
const world = (id = 'room', extra = {}) => parseWorld({format: 'deductrium-world-v1', id, title: id,
    revision: 1, mode: 'standalone', spawn: {tileId: 'start', rotation: 0}, banks: {}, migrations: [],
    tiles: [{id: 'start', hash: '', type: 0, text: ''}, {id: 'gate', hash: '1', type: 2, text: '$A', data: {p: true}},
        {id: 'prize', hash: '2', type: 3, text: 'Prize', data: {getD: 4}}], ...extra});
const extension = (id, dependencies = [], revision = 1) => world(id, {mode: 'extension', revision,
    publication: {engineVersion: '2.0', dependencies}});
const dependency = (id, minRevision = 1, maxRevision) => ({id, minRevision, ...(maxRevision === undefined ? {} : {maxRevision})});
const pack = (mode, data, extra = {}) => LZString.compressToUTF16(JSON.stringify({version: 0, mode, timestamp: 1, data, ...extra}));
const standaloneSave = w => ({world: worldSaveMeta(w), worldPosition: {tileId: 'start', hash: ''},
    D: 12, balances: {reasoning: 12, type: 0}, rw: [worldTileId(w.id, 'prize')], dg: []});
const bundle = (worlds, save) => ({format: WORLD_BUNDLE_FORMAT, worlds, ...(save ? {save} : {})});
function memory(initial = []) {
    const data = new Map(initial), writes = [];
    let failure;
    return {data, writes, fail(fn) {failure = fn;},
        getItem(key) {return data.get(key) ?? null;},
        setItem(key, value) {if (failure?.('set', key, value)) throw Error('quota exceeded'); writes.push(['set', key]); data.set(key, String(value));},
        removeItem(key) {if (failure?.('remove', key)) throw Error('storage denied'); writes.push(['remove', key]); data.delete(key);}};
}

test('legacy publication is optional; metadata and bounded revision ranges round-trip through world parsing', () => {
    assert.equal(SUPPORTED_ENGINE_VERSION, '2.0');
    assert.deepEqual(validatePublication(undefined), {});
    assert.equal(world().publication, undefined);
    const publication = {author: '<b>Author</b>', description: '说明', engineVersion: '2.0.1',
        dependencies: [dependency('base', 2, 5)]};
    const w = world('published', {publication});
    assert.deepEqual(w.publication, publication);
    w.publication.dependencies[0].minRevision = 3;
    assert.equal(publication.dependencies[0].minRevision, 2);
    for (const engineVersion of ['1.9', '3.0']) assert.throws(() => validatePublication({engineVersion}), /Incompatible engine version.*2\.0/);
    for (const value of [{engineVersion: '^2'}, {engineVersion: '02.0'}, {author: 2}, {description: 'x'.repeat(8001)},
        {extra: true}, {dependencies: [dependency('a', 0)]}, {dependencies: [dependency('a', 5, 4)]},
        {dependencies: [dependency('a'), dependency('a')]}, {dependencies: [dependency('room')]},
        {dependencies: Array.from({length: 33}, (_, i) => dependency('d' + i))}])
        assert.throws(() => validatePublication(value, 'room'));
    assert.throws(() => parseWorld({...world(), publication: {engineVersion: '3.0'}}), /Incompatible engine/);
});

test('publication and bundles reject active/exotic JSON without invoking getters or toJSON', () => {
    let calls = 0;
    const getter = Object.defineProperty({}, 'author', {enumerable: true, get() {calls++; return 'executed';}});
    const toJSON = {toJSON() {calls++; return {};}};
    const cyclic = {}; cyclic.author = cyclic;
    const sparse = []; sparse.length = 2;
    for (const value of [getter, toJSON, new Date(), Object.create({author: 'inherited'}), cyclic,
        {author: undefined}, {dependencies: sparse}, {[Symbol('x')]: 'symbol'}, JSON.parse('{"__proto__":{}}')])
        assert.throws(() => validatePublication(value));
    assert.equal(calls, 0);
    let current = {}, deep = current;
    for (let i = 0; i < 34; i++) current = current.child = {};
    assert.throws(() => validatePublication(deep), /depth/);
    const poisoned = Object.defineProperty({}, 'worlds', {enumerable: true, get() {calls++; return [world()];}});
    assert.throws(() => parseWorldBundle(poisoned));
    assert.equal(calls, 0);
});

test('dependency installation never enables files; toggling validates transitive graph and disabling dependents', () => {
    const base = extension('base'), middle = extension('middle', [dependency('base')]);
    const top = extension('top', [dependency('middle')]);
    let entries = importMod([], top);
    const original = clone(entries);
    assert.throws(() => setModEnabled(entries, 'top', true), /missing dependency middle/);
    assert.deepEqual(entries, original);
    entries = importMod(importMod(entries, middle), base);
    assert.ok(entries.every(entry => !entry.enabled));
    assert.throws(() => setModEnabled(entries, 'top', true), /Enable dependency/);
    entries = setModEnabled(entries, 'base', true);
    entries = setModEnabled(entries, 'middle', true);
    entries = setModEnabled(entries, 'top', true);
    const enabled = clone(entries);
    assert.throws(() => setModEnabled(entries, 'base', false), /Enable dependency base/);
    assert.deepEqual(entries, enabled);
    entries = setModEnabled(entries, 'top', false);
    entries = setModEnabled(entries, 'middle', false);
    entries = setModEnabled(entries, 'base', false);
    assert.ok(entries.every(entry => !entry.enabled));
});

test('too old/new revisions and dependency cycles reject without map, name or entry mutations', () => {
    for (const [revision, pattern] of [[1, /too old/], [5, /too new/]]) {
        const entries = [{world: extension('base', [], revision), enabled: true},
            {world: extension('top', [dependency('base', 2, 4)]), enabled: false}];
        const before = clone(entries);
        assert.throws(() => setModEnabled(entries, 'top', true), pattern);
        assert.deepEqual(entries, before);
        const tiles = new Map([['official', {type: 0, text: '', data: {}}]]), names = new Map([['official', 'official']]);
        const bad = clone(entries); bad[1].enabled = true;
        assert.throws(() => installMods(bad, tiles, names), pattern);
        assert.equal(tiles.size, 1); assert.equal(names.size, 1);
        const storage = memory();
        assert.throws(() => saveModLibrary(bad, storage), pattern);
        assert.equal(storage.writes.length, 0);
    }
    const a = extension('a', [dependency('b')]), b = extension('b', [dependency('a')]);
    const entries = [{world: a, enabled: false}, {world: b, enabled: false}], before = clone(entries);
    assert.throws(() => setModEnabled(entries, 'a', true), /dependency cycle/);
    assert.deepEqual(entries, before);
    assert.throws(() => parseWorldBundle(bundle([a, b])), /dependency cycle/);
});

test('portable files round-trip publication and dependencies while keeping normal world imports compatible', () => {
    const base = extension('base'), top = extension('top', [dependency('base')]);
    const encoded = exportWorldBundle([top, base]);
    assert.deepEqual(parseWorldBundle(encoded).worlds, [top, base]);
    const storage = memory();
    importWorldBundle(encoded, storage);
    assert.equal(readModLibrary(storage).length, 2);
    assert.ok(readModLibrary(storage).every(entry => !entry.enabled));
    assert.equal(readPendingWorldBundle(storage), undefined);
    const entries = importMod(readModLibrary(storage), world('legacy'));
    assert.equal(entries[2].world.id, 'legacy');
    assert.throws(() => parseWorldBundle(bundle([top])), /missing dependency base/);
    assert.throws(() => parseWorldBundle(bundle([base, base])), /duplicate world/);
});

test('every world and save is checked before import changes library or pending recovery', () => {
    const w = world(), original = memory([[MOD_LIBRARY_KEY, JSON.stringify({version: 1, mods: []})], ['unrelated', 'keep']]);
    const before = [...original.data];
    for (const input of [bundle([w, {...w, id: 'second', spawn: {tileId: 'missing', rotation: 0}}]),
        bundle([w], {mode: 'world-room', worldId: 'room', compressed: 'invalid'}),
        bundle([w], {mode: 'world-room', worldId: 'other', compressed: pack('world-room', standaloneSave(w))}),
        bundle([w], {mode: 'survival', compressed: pack('creative', {})}),
        bundle([w], {mode: 'world-room', worldId: 'room', compressed: pack('world-room', standaloneSave(w), {version: 99})}),
        bundle([w], {mode: 'world-room', worldId: 'room', compressed: pack('world-room', {...standaloneSave(w), world: {...worldSaveMeta(w), revision: 9}})}),
        bundle([w], {mode: 'survival', compressed: pack('survival', {modWorlds: [worldSaveMeta(extension('absent'))]})})]) {
        assert.throws(() => importWorldBundle(input, original));
        assert.deepEqual([...original.data], before);
        assert.equal(original.writes.length, 0);
    }
});

test('multi-world updates and pending recovery roll back on storage failure', () => {
    const a = world('a'), b = world('b'), newer = clone(a); newer.revision = 2;
    const initial = [{world: a, enabled: false}];
    const storage = memory([[MOD_LIBRARY_KEY, JSON.stringify({version: 1, mods: initial})], ['unrelated', 'keep']]);
    const incoming = bundle([newer, b], {mode: 'world-b', worldId: 'b', compressed: pack('world-b', standaloneSave(b))});
    const before = [...storage.data];
    storage.fail((operation, key) => operation === 'set' && key === MOD_LIBRARY_KEY);
    assert.throws(() => importWorldBundle(incoming, storage), /quota/);
    assert.deepEqual([...storage.data], before);
    storage.fail();
    importWorldBundle(incoming, storage);
    assert.equal(readModLibrary(storage)[0].world.revision, 2);
    assert.equal(readPendingWorldBundle(storage).save.worldId, 'b');
    assert.equal(storage.getItem('unrelated'), 'keep');
    // A later invalid/older file must not install an earlier file from the same bundle.
    const prior = [...storage.data];
    assert.throws(() => importWorldBundle(bundle([world('third'), a]), storage), /higher revision/);
    assert.deepEqual([...storage.data], prior);
});

function liveSave(w = world(), mode = `world-${w.id}`) {
    const storage = memory(); globalThis.localStorage = storage;
    let live = standaloneSave(w), reject = false;
    const save = new SaveLoad(mode, () => clone(live), data => {
        live = clone(data);
        if (reject && data.D === 99) throw Error('real deserialize rejected');
    });
    save.beforeLoad = data => mode.startsWith('world-') ? migrateWorldSave(data, w) : prepareModSave(data, []);
    save.save();
    return {save, storage, live: () => clone(live), setLive: data => {live = clone(data);}, reject: value => {reject = value;}};
}

test('snapshot captures unsaved live progress in actual SaveLoad compressed format without a save write', () => {
    const w = world(), e = liveSave(w), previous = e.save.exportSave();
    e.setLive({...e.live(), D: 77, balances: {reasoning: 77, type: 0}, optional: undefined});
    const writes = e.storage.writes.length;
    const exported = snapshotWorldBundle([{world: w, enabled: false}], e.save, w);
    assert.equal(e.storage.writes.length, writes);
    assert.equal(e.save.exportSave(), previous);
    const pkg = JSON.parse(LZString.decompressFromUTF16(exported.save.compressed));
    assert.equal(pkg.version, 0); assert.equal(pkg.mode, 'world-room'); assert.equal(pkg.data.D, 77);
    assert.equal(Object.hasOwn(pkg.data, 'optional'), false);
    assert.equal(exported.save.worldId, w.id);
    assert.deepEqual(parseWorldBundle(exportWorldBundle(exported.worlds, exported.save)), exported);
});

test('recovery calls the real validator/deserialize, preserves pending save on failure, and restores live/raw after quota error', () => {
    const w = world(), e = liveSave(w), raw = e.save.exportSave(), before = e.live();
    const incoming = bundle([w], {mode: 'world-room', worldId: 'room',
        compressed: pack('world-room', {...before, D: 99, balances: {reasoning: 99, type: 0}})});
    importWorldBundle(incoming, e.storage);
    const prior = [...e.storage.data];
    e.reject(true);
    assert.throws(() => restoreWorldBundleSave(incoming, e.save, [w], e.storage), /real deserialize rejected/);
    assert.deepEqual(e.live(), before); assert.equal(e.save.exportSave(), raw);
    assert.deepEqual([...e.storage.data].sort(), prior.sort());
    e.reject(false);
    e.storage.fail((operation, key) => operation === 'set' && key === e.save.saveKey);
    assert.throws(() => restoreWorldBundleSave(incoming, e.save, [w], e.storage), /quota/);
    assert.deepEqual(e.live(), before); assert.equal(e.save.exportSave(), raw);
    assert.ok(readPendingWorldBundle(e.storage));
    e.storage.fail();
    restoreWorldBundleSave(incoming, e.save, [w], e.storage);
    assert.equal(e.live().D, 99); assert.equal(e.save.exportSave(), incoming.save.compressed);
    assert.equal(readPendingWorldBundle(e.storage), undefined);
});

test('recovery rejects runtime drift, missing validators or wrong worlds before mutation', () => {
    const w = world(), e = liveSave(w), before = e.live(), raw = e.save.exportSave();
    const incoming = snapshotWorldBundle([{world: w, enabled: false}], e.save, w);
    const moved = clone(w); moved.tiles[1].hash = '3';
    const writes = e.storage.writes.length;
    assert.throws(() => restoreWorldBundleSave(incoming, e.save, [moved], e.storage), /Reload bundled world/);
    assert.throws(() => restoreWorldBundleSave(incoming, e.save, [], e.storage), /Enable or enter/);
    const other = new SaveLoad('world-other', () => ({}), () => {throw Error('must not run');});
    assert.throws(() => restoreWorldBundleSave(incoming, other, [w], e.storage), /Enter save mode/);
    e.save.beforeLoad = undefined;
    assert.throws(() => restoreWorldBundleSave(incoming, e.save, [w], e.storage), /requires the game save validator/);
    assert.equal(e.storage.writes.length, writes);
    assert.deepEqual(e.live(), before); assert.equal(e.save.exportSave(), raw);
});

test('normal bundle save requires its saved extensions to be loaded before real validation', () => {
    const base = extension('base'), top = extension('top', [dependency('base')]), e = liveSave(world(), 'survival');
    const data = {D: 33, balances: {reasoning: 33, type: 0}, modWorlds: [worldSaveMeta(base), worldSaveMeta(top)], rw: [], dg: []};
    const incoming = bundle([base, top], {mode: 'survival', compressed: pack('survival', data)});
    importWorldBundle(incoming, e.storage);
    assert.ok(readModLibrary(e.storage).every(entry => !entry.enabled));
    assert.throws(() => restoreWorldBundleSave(incoming, e.save, [], e.storage), /Enable or enter world base/);
    e.save.beforeLoad = value => prepareModSave(value, [{world: base, enabled: true}, {world: top, enabled: true}]);
    restoreWorldBundleSave(incoming, e.save, [base, top], e.storage);
    assert.equal(e.live().D, 33);
});

test('migration diff reports moved, remapped, changed, reset, removed and added tiles using engine goals', () => {
    const old = world(), next = clone(old);
    next.revision = 2;
    next.tiles[1].hash = '3'; next.tiles[1].id = 'new-gate';
    next.tiles[2].data.getD = 5;
    next.tiles.push({id: 'added', hash: '4', type: 0, text: 'new'});
    next.migrations = [{from: 1, to: 2, remap: {gate: 'new-gate'}, reset: ['prize']}];
    const before = clone([old, next]), diff = migrationDiff(old, next);
    assert.equal(diff.valid, true); assert.deepEqual(diff.issues, []);
    assert.deepEqual(diff.moved.map(row => [row.fromId, row.toId, row.fromHash, row.toHash]), [['gate', 'new-gate', '1', '3']]);
    assert.deepEqual(diff.remapped.map(row => row.fromId), ['gate']);
    assert.deepEqual(diff.goalchanges.map(row => row.fromId), ['prize']);
    assert.deepEqual(diff.reset.map(row => row.fromId), ['prize']);
    assert.deepEqual(diff.retained.map(row => row.fromId), ['start', 'gate']);
    assert.deepEqual(diff.added, [{id: 'added', hash: '4'}]);
    assert.deepEqual([old, next], before);
    const deleted = clone(next); deleted.tiles.splice(2, 1); deleted.migrations[0].reset = []; deleted.migrations[0].remap.prize = null;
    assert.deepEqual(migrationDiff(old, deleted).deleted.map(row => row.fromId), ['prize']);
    const missing = clone(next); missing.migrations = [];
    const invalid = migrationDiff(old, missing);
    assert.equal(invalid.valid, false); assert.match(invalid.issues[0], /Missing migration/);
    const cosmetic = clone(old); cosmetic.tiles[0].text = 'new text'; cosmetic.tiles[1].data.color = 'red';
    assert.equal(migrationDiff(old, cosmetic).goalchanges.length, 0);
});

test('multi-hop remaps and explicit same-identity resets match migration semantics', () => {
    const old = world(), next = clone(old); next.revision = 3;
    next.tiles[1].id = 'final'; next.tiles[1].hash = '4';
    next.migrations = [{from: 1, to: 2, remap: {gate: 'intermediate'}, reset: []},
        {from: 2, to: 3, remap: {intermediate: 'final'}, reset: ['prize']}];
    const diff = migrationDiff(old, next);
    assert.equal(diff.valid, true);
    assert.deepEqual(diff.remapped.map(row => [row.fromId, row.toId]), [['gate', 'final']]);
    assert.deepEqual(diff.reset.map(row => row.fromId), ['prize']);
    assert.equal(diff.goalchanges.length, 0);
});

// Opt in with PUBLICATION_BROWSER_TEST=1 and optionally PLAYWRIGHT_MODULE pointing
// at an installed Playwright entrypoint. The same file stays usable with node --test.
test('actual author UI preserves publication and exports raw saves with installed dependency closure',
    {skip: !process.env.PUBLICATION_BROWSER_TEST, timeout: 120_000}, async () => {
    const {createServer} = await import('node:http');
    const {readFile} = await import('node:fs/promises');
    const {resolve, extname, sep} = await import('node:path');
    const {fileURLToPath, pathToFileURL} = await import('node:url');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const fixture = JSON.parse(await readFile(new URL('../examples/intuitionistic-propositional.map-project.json', import.meta.url), 'utf8'));
    fixture.world.publication = {author: 'Existing author', description: 'Existing description', engineVersion: '2.0',
        dependencies: [dependency('publication-base', 2, 2)]};
    const leaf = extension('publication-leaf'), base = extension('publication-base', [dependency(leaf.id)], 2);
    const installed = [base, leaf, extension('unrelated'), world(fixture.id)].map(world => ({world, enabled: false}));
    const library = JSON.stringify({version: 1, mods: installed});
    const server = createServer(async (req, res) => {
        try {
            const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
            if (!file.startsWith(resolve(root) + sep)) {res.writeHead(403).end(); return;}
            res.setHeader('Content-Type', ({'.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html',
                '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml'})[extname(file)] || 'application/octet-stream');
            res.end(await readFile(file));
        } catch {res.writeHead(404).end();}
    });
    let browser;
    try {
        await new Promise(done => server.listen(0, '127.0.0.1', done));
        const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
        browser = await chromium.launch({headless: true, channel: 'chrome'});
        for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
            const context = await browser.newContext({viewport, acceptDownloads: true}), errors = [];
            try {
                await context.addInitScript(({fixture, library}) => {
                    localStorage.setItem('deductrium-map-editor-project-v1', JSON.stringify(fixture));
                    localStorage.setItem('deductrium2_mod_library', library);
                    localStorage.setItem('deductrium2_survival', 'existing-save');
                }, {fixture, library});
                const page = await context.newPage();
                page.on('pageerror', error => errors.push(error.message));
                await page.goto(`http://127.0.0.1:${server.address().port}/tools/map-editor/index.html`);
                const section = title => page.locator('details.author-section').filter({has: page.locator('summary', {hasText: title})});
                const publication = section(/^发布信息$/), bundles = section(/^导出世界包$/);
                await publication.waitFor({state: 'attached'});
                await page.evaluate(() => mapEditor.openPanel('project'));
                await publication.evaluate(el => {el.open = true;});
                await bundles.evaluate(el => {el.open = true;});
                assert.equal(await publication.getByLabel('作者', {exact: true}).inputValue(), fixture.world.publication.author);
                assert.equal(await publication.getByLabel('简介', {exact: true}).inputValue(), fixture.world.publication.description);
                assert.equal(await publication.getByLabel('依赖世界 ID', {exact: true}).inputValue(), base.id);
                await publication.getByRole('button', {name: '应用发布信息', exact: true}).click();
                assert.deepEqual(await page.evaluate(() => mapEditor.project.world.publication), fixture.world.publication);
                const download = async () => {
                    const event = page.waitForEvent('download');
                    await bundles.getByRole('button', {name: '导出世界包', exact: true}).click();
                    return parseWorldBundle(await readFile(await (await event).path(), 'utf8'));
                };
                const maps = await download();
                assert.deepEqual(maps.worlds.map(world => world.id).sort(), [fixture.id, base.id, leaf.id].sort());
                assert.equal(maps.worlds.find(world => world.id === fixture.id).mode, 'extension', 'current edited world overrides installed copy');
                assert.equal(maps.save, undefined);
                const upload = async text => {
                    await bundles.locator('input[type=file]').setInputFiles({name: 'existing.dt', mimeType: 'application/octet-stream', buffer: Buffer.from(text)});
                    await page.waitForFunction(() => [...document.querySelectorAll('.author-section')]
                        .find(el => el.querySelector('summary')?.textContent === '导出世界包').textContent.includes('将附带存档 existing.dt'));
                };
                assert.match(await bundles.locator('input[type=file]').getAttribute('accept'), /\.dt/);
                const raw = pack('survival', {D: 17});
                await upload(raw);
                const normal = await download();
                assert.deepEqual(normal.save, {mode: 'survival', compressed: raw});
                const current = maps.worlds.find(world => world.id === fixture.id);
                const worldRaw = pack(`world-${current.id}`, {world: worldSaveMeta(current), D: 23});
                await upload(worldRaw);
                const isolated = await download();
                assert.deepEqual(isolated.save, {mode: `world-${current.id}`, worldId: current.id, compressed: worldRaw});
                await upload(JSON.stringify({mode: 'survival', compressed: raw}));
                assert.equal((await download()).save.compressed, raw, 'legacy JSON descriptor still works');
                await bundles.locator('input[type=file]').setInputFiles([]);
                let downloads = 0;
                page.on('download', () => downloads++);
                const rejected = async (entries, expected) => {
                    const before = downloads;
                    await page.evaluate(entries => localStorage.setItem('deductrium2_mod_library', JSON.stringify({version: 1, mods: entries})), entries);
                    const stored = await page.evaluate(() => localStorage.getItem('deductrium2_mod_library'));
                    await bundles.getByRole('button', {name: '导出世界包', exact: true}).click();
                    await page.waitForFunction(() => [...document.querySelectorAll('.author-section')]
                        .find(el => el.querySelector('summary')?.textContent === '导出世界包').querySelector('[role=status]').dataset.error === 'true');
                    assert.match(await bundles.locator('[role=status]').textContent(), expected);
                    assert.equal(downloads, before, 'invalid dependency graphs never download');
                    assert.equal(await page.evaluate(() => localStorage.getItem('deductrium2_mod_library')), stored);
                };
                await rejected([], /publication-base/);
                await rejected([{world: base, enabled: false}], /publication-leaf/);
                await rejected([{world: {...base, revision: 1}, enabled: false}, {world: leaf, enabled: false}], /too old|revision/);
                await rejected([{world: base, enabled: false}, {world: {...leaf, publication: {dependencies: [dependency(base.id, 2)]}}, enabled: false}], /cycle/);
                await page.evaluate(library => localStorage.setItem('deductrium2_mod_library', library), library);
                assert.equal((await download()).save, undefined, 'clearing save attachment returns to map-only export');
                assert.equal(await page.evaluate(() => localStorage.getItem('deductrium2_mod_library')), library);
                assert.equal(await page.evaluate(() => localStorage.getItem('deductrium2_survival')), 'existing-save');
                // A refresh keeps drafts on the same object; confirmed load/new replaces it.
                const refresh = () => page.evaluate(() => mapEditor.applyProject(project =>
                    project.setInfo(project.id, project.title + ' refreshed'), 'refreshed', {allowExternalPending: true}));
                await publication.getByLabel('作者', {exact: true}).fill('Old unsaved author');
                await publication.getByLabel('简介', {exact: true}).fill('Old unsaved description');
                await publication.getByLabel('引擎版本（如 2.0）', {exact: true}).fill('9.0');
                await publication.getByLabel('依赖世界 ID', {exact: true}).fill('old-unsaved-dependency');
                await publication.getByRole('button', {name: '应用发布信息', exact: true}).click();
                assert.equal(await publication.locator('[role=status]').getAttribute('data-error'), 'true');
                await page.evaluate(() => {window.publicationProject = mapEditor.project;});
                await refresh();
                assert.equal(await page.evaluate(() => mapEditor.project === window.publicationProject), true);
                assert.equal(await publication.getByLabel('作者', {exact: true}).inputValue(), 'Old unsaved author');
                assert.equal(await publication.getByLabel('简介', {exact: true}).inputValue(), 'Old unsaved description');
                assert.equal(await publication.getByLabel('引擎版本（如 2.0）', {exact: true}).inputValue(), '9.0');
                assert.equal(await publication.getByLabel('依赖世界 ID', {exact: true}).inputValue(), 'old-unsaved-dependency');
                page.once('dialog', dialog => dialog.dismiss());
                await page.locator('#new-project').evaluate(el => el.click());
                assert.equal(await page.evaluate(() => mapEditor.project === window.publicationProject), true);
                assert.equal(await publication.getByLabel('作者', {exact: true}).inputValue(), 'Old unsaved author');
                const replacement = clone(fixture);
                replacement.world.publication = {author: 'Loaded author', description: 'Loaded description', engineVersion: '2.0'};
                page.once('dialog', dialog => dialog.accept());
                await page.locator('#file').setInputFiles({name: 'replacement.map-project.json', mimeType: 'application/json',
                    buffer: Buffer.from(JSON.stringify(replacement))});
                await page.waitForFunction(() => mapEditor.project !== window.publicationProject);
                assert.equal(await page.evaluate(() => mapEditor.project.id), fixture.id, 'same ID is still a different project');
                assert.equal(await publication.getByLabel('作者', {exact: true}).inputValue(), 'Loaded author');
                assert.equal(await publication.getByLabel('简介', {exact: true}).inputValue(), 'Loaded description');
                assert.equal(await publication.getByLabel('引擎版本（如 2.0）', {exact: true}).inputValue(), '2.0');
                assert.equal(await publication.getByLabel('依赖世界 ID', {exact: true}).count(), 0);
                assert.equal(await publication.locator('[role=status]').textContent(), '');
                assert.equal(await publication.locator('[role=status]').getAttribute('data-error'), 'false');
                await page.evaluate(() => mapEditor.applyProject(project => project.setInfo(project.id, project.title), 'no stale pending'));
                await publication.getByLabel('作者', {exact: true}).fill('Discard on new');
                await publication.getByRole('button', {name: '添加依赖', exact: true}).click();
                page.once('dialog', dialog => dialog.accept());
                await page.locator('#new-project').evaluate(el => el.click());
                for (const label of ['作者', '简介', '引擎版本（如 2.0）'])
                    assert.equal(await publication.getByLabel(label, {exact: true}).inputValue(), '');
                assert.equal(await publication.getByLabel('依赖世界 ID', {exact: true}).count(), 0);
                assert.equal(await publication.getByRole('button', {name: '应用发布信息', exact: true}).isDisabled(), true);
                assert.equal(await publication.locator('[role=status]').textContent(), '');
                await page.evaluate(() => mapEditor.applyProject(project => project.setInfo(project.id, project.title), 'no stale pending'));
                assert.deepEqual(errors, []);
                console.log(`publication author UI ${viewport.width}: metadata, raw saves, dependency closure and project draft lifecycle passed`);
            } finally {await context.close();}
        }
    } finally {await browser?.close(); await new Promise(done => server.close(done));}
});

test('actual settings upload/download and explicit cross-world save recovery on desktop and mobile',
    {skip: !process.env.PUBLICATION_BROWSER_TEST, timeout: 120_000}, async () => {
    const {createServer} = await import('node:http');
    const {readFile} = await import('node:fs/promises');
    const {resolve, extname, sep} = await import('node:path');
    const {fileURLToPath, pathToFileURL} = await import('node:url');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const server = createServer(async (req, res) => {
        try {
            const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
            if (!file.startsWith(resolve(root) + sep)) {res.writeHead(403).end(); return;}
            res.setHeader('Content-Type', ({'.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
                '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml'})[extname(file)] || 'application/octet-stream');
            res.end(await readFile(file));
        } catch {res.writeHead(404).end();}
    });
    let browser;
    try {
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
        browser = await chromium.launch({headless: true, channel: 'chrome'});
        const origin = `http://127.0.0.1:${server.address().port}`;
        const ready = async page => {
            await page.waitForFunction(() => window.game || document.getElementById('world-load-error'));
            assert.equal(await page.locator('#world-load-error').count(), 0);
            await page.waitForSelector('#loading.hide', {state: 'attached'});
        };
        const settings = async page => {
            await page.evaluate(() => game.showLayerButton('P-layer', true));
            await page.locator('button[data-layer="P-layer"]').click();
        };
        const upload = async (page, input) => {
            await page.locator('#pg-mod-file').setInputFiles({name: 'portable.bundle.json', mimeType: 'application/json',
                buffer: Buffer.from(typeof input === 'string' ? input : JSON.stringify(input))});
            await page.waitForFunction(() => document.getElementById('pg-mod-list').getAttribute('aria-busy') === 'false');
        };
        const download = async (page, index) => {
            const event = page.waitForEvent('download');
            await page.locator('[data-world-bundle="export"] button').nth(index).click();
            return readFile(await (await event).path(), 'utf8');
        };
        for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
            const context = await browser.newContext({viewport, locale: 'en-US'}), errors = [];
            context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
            try {
                const page = await context.newPage(); await page.goto(origin + '/index.html'); await ready(page); await settings(page);
                const w = world('portable-browser', {publication: {author: '<img src=x onerror=alert(1)>',
                    description: 'Portable progress', engineVersion: '2.0'}});
                // Legacy single-file upload remains the entry point for existing maps.
                await upload(page, w);
                assert.equal(await page.locator('[data-mod-id="portable-browser"]').count(), 1);
                assert.equal(await page.locator('[data-mod-id="portable-browser"] img').count(), 0);
                const maps = parseWorldBundle(await download(page, 0));
                assert.equal(maps.worlds[0].publication.author, w.publication.author); assert.equal(maps.save, undefined);
                await page.evaluate(() => {game.deductrium = 37; game.saveload.cancelPendingSave();});
                const raw = await download(page, 1), exported = parseWorldBundle(raw);
                assert.equal(JSON.parse(LZString.decompressFromUTF16(exported.save.compressed)).data.D, 37);
                await page.evaluate(() => {game.deductrium = 1; game.saveload.save();});
                await upload(page, raw);
                assert.equal(await page.evaluate(() => game.deductrium), 1, 'uploading never restores automatically');
                assert.equal(await page.locator('[data-world-bundle="restore"]').count(), 1);
                await page.locator('[data-world-bundle="restore"] button').first().click();
                await page.waitForFunction(() => !localStorage.getItem('deductrium2_pending_world_bundle'));
                assert.equal(await page.evaluate(() => game.deductrium), 37);
                assert.equal(await page.locator('[data-world-bundle="restore"]').count(), 0);
                const before = await page.evaluate(() => ({library: localStorage.getItem('deductrium2_mod_library'),
                    raw: localStorage.getItem(game.saveload.saveKey), D: game.deductrium}));
                await upload(page, bundle([w, {...w, id: 'bad-second', spawn: {tileId: 'missing', rotation: 0}}]));
                assert.equal(await page.locator('#pg-mod-status').getAttribute('data-error'), 'true');
                assert.deepEqual(await page.evaluate(() => ({library: localStorage.getItem('deductrium2_mod_library'),
                    raw: localStorage.getItem(game.saveload.saveKey), D: game.deductrium})), before);
                // Destination recovery survives navigation and uses the actual Game validator.
                await page.locator('[data-mod-id="portable-browser"] button').first().click();
                await page.waitForLoadState('load'); await ready(page); await settings(page);
                assert.equal(await page.evaluate(() => game.saveload.saveMode), 'world-portable-browser');
                await page.evaluate(() => {game.deductrium = 88; game.saveload.cancelPendingSave();});
                const isolated = await download(page, 1);
                await page.evaluate(() => {game.deductrium = 5; game.saveload.save();});
                const returnLabel = await page.evaluate(async () => (await import('/js/lang.js')).LangMgr.text.modsReturn);
                await page.getByRole('button', {name: returnLabel, exact: true}).click();
                await page.waitForLoadState('load'); await ready(page); await settings(page);
                await upload(page, isolated);
                assert.equal(await page.evaluate(() => game.deductrium), 37);
                await page.locator('[data-world-bundle="restore"] button').first().click();
                await page.waitForLoadState('load'); await ready(page); await settings(page);
                assert.equal(await page.evaluate(() => game.deductrium), 5);
                assert.equal(await page.locator('[data-world-bundle="restore"]').count(), 1);
                await page.locator('[data-world-bundle="restore"] button').first().click();
                await page.waitForFunction(() => !localStorage.getItem('deductrium2_pending_world_bundle'));
                assert.equal(await page.evaluate(() => game.deductrium), 88);
                assert.deepEqual(errors, []);
                console.log(`publication browser ${viewport.width}: legacy upload, both downloads, atomic rejection, normal/cross-world recovery passed`);
            } finally {await context.close();}
        }
    } finally {
        await browser?.close();
        await new Promise(r => server.close(r));
    }
});
