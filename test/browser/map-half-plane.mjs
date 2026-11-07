// Run: node test/browser/map-half-plane.mjs [repository root]
// Requires installed Chrome and playwright (or PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs).
// Uses the existing generated js/ tree; never builds or changes application files.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const region = {hash:'1', edge:4, side:-1};
const entry = {mainHash:'1', edge:4, tileId:'entry'};
const fixture = {
    format:'deductrium-world-v2', id:'half-plane-browser', title:'Half-plane browser test',
    revision:1, mode:'extension', region, entry, spawn:{tileId:'entry', rotation:3},
    banks:{}, migrations:[], tiles:[{id:'entry', hash:'1,4', type:0, text:'Mod entrance',
        data:{script:'on start\nadd count starts 1\nend\non touch\nadd count touches 1\nend'}}],
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
let browser;
const ready = async page => {
    await page.waitForFunction(() => window.game || document.getElementById('world-load-error'));
    assert.equal(await page.locator('#world-load-error').count(), 0, await page.locator('body').innerText());
};
const readMap = page => page.evaluate(async () => {
    const {blockMap} = await import('/js/hy/maploader.js');
    // Game initializes absent data to {}; compare the same serialized tile content across editor/game.
    return JSON.parse(JSON.stringify([...blockMap].map(([hash,tile])=>[hash,{...tile,data:tile.data??{}}])
        .sort(([a],[b]) => a.localeCompare(b))));
});
const upload = (page, world) => page.locator('#file').setInputFiles({name:'half-plane.world.json',
    mimeType:'application/json', buffer:Buffer.from(JSON.stringify(world))});
const progress = page => page.evaluate(() => {
    const s = game.saveload.serialize();
    return {rw:s.rw, dg:s.dg, ac:s.ac, in:s.in, ms:structuredClone(s.ms),
        worldPosition:s.worldPosition, current:game.hyLayer.world.currentTile.slice()};
});
// Calls the real moveCam/hitTest/callback chain. Only the initial test starting point is seeded.
const cross = (page, target) => page.evaluate(async target => {
    const {Hvec} = await import('/js/hy/algebra.js');
    const w = game.hyLayer.world, before = w.currentTile.join(',');
    const edge = Array.from({length:6}, (_,i) => i).find(i =>
        w.atlasTile.getNeighborAndDir(w.currentTile, i, true)[0].join(',') === target);
    if (edge === undefined) throw Error(`Not adjacent: ${before} -> ${target}`);
    const trace=[];
    for (let steps = 1; steps <= 160; steps++) {
        const rotor = w.atlasTile.rotors.get(target);
        if (!rotor) throw Error(`Missing real neighbor rotor: ${target}`);
        const center = w.localCamMat.apply(rotor.apply(new Hvec()));
        const length = Math.hypot(center.x, center.y);
        if (!(length > 1e-9)) throw Error('Movement target has no direction');
        w.moveCam(center.x / length * .025, -center.y / length * .025);
        if (steps<4 || steps===160) trace.push({steps,center,pos:w.localCamMat.conj().apply(new Hvec()),domain:w.atlasTile.isInDomain(w.localCamMat.conj().apply(new Hvec()))});
        const at = w.currentTile.join(',');
        if (at === target) return {before, target, edge, steps};
        if (at !== before) throw Error(`Crossed unexpected tile ${at}, expected ${target}`);
    }
    throw Error(`moveCam did not cross ${before} -> ${target}: ${JSON.stringify(trace)}`);
}, target);

try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const {chromium} = await import(process.env.PLAYWRIGHT_MODULE
        ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
    browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH
        ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'})});
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const viewport of [{width:1440, height:1000}, {width:390, height:844}]) {
        const context = await browser.newContext({viewport, acceptDownloads:true});
        const errors = [];
        context.on('page', page => {
            page.on('pageerror', e => errors.push(e.message));
            page.on('dialog', d => d.accept());
        });
        try {
            const official = await context.newPage();
            await official.goto(origin + '/?survival'); await ready(official);
            const base = await readMap(official);
            assert.equal(base.length, 2120, 'fixture must be tested against the full official map');
            assert.equal(base.find(([h]) => h === '1')?.[1].type, 0);
            assert(!base.some(([h]) => h === '1,4'), 'entry must be outside the official map');
            await official.evaluate(() => {game.saveload.cancelPendingSave(); game.saveload.save();});
            const officialSave = await official.evaluate(() => localStorage.getItem('deductrium2_survival'));
            assert(officialSave); await official.close();

            const editor = await context.newPage();
            await editor.goto(origin + '/tools/map-editor/index.html');
            await editor.waitForFunction(() => window.mapEditor);
            await upload(editor, fixture);
            await editor.waitForFunction(() => mapEditor.project.id === 'half-plane-browser');
            const coords = await editor.evaluate(async () => {
                const {blockMap} = await import('/js/hy/maploader.js');
                const p = mapEditor.project, polygon = p.polygon;
                const queue = [[]], seen = new Set(['']); let outside, inside;
                for (let index=0; index<queue.length && index<20000; index++) {
                    const at=queue[index], hash=at.join(',');
                    if (!blockMap.has(hash)) {
                        if (p.canEdit(hash)) inside ??= hash; else outside ??= hash;
                        if (outside !== undefined && inside !== undefined) break;
                    }
                    for (let edge=0; edge<6; edge++) {
                        const next=polygon.getNeighborAndDir(at, edge, true)[0], key=next.join(',');
                        if (!seen.has(key)) {seen.add(key); queue.push(next);}
                    }
                }
                return {outside, inside, baseReadonly:[...blockMap.keys()].filter(h=>h!=='1,4').every(h=>!p.canEdit(h))};
            });
            assert.equal(typeof coords.outside, 'string'); assert.equal(typeof coords.inside, 'string');
            assert.equal(coords.baseReadonly, true);
            if (await editor.locator('#toggle-inspector').isVisible()
                && await editor.locator('#toggle-inspector').getAttribute('aria-expanded') === 'false')
                await editor.locator('#toggle-inspector').click();
            for (const [hash, label] of [['1', /官方地图.*只读/], [coords.outside, /半平面外.*只读/]]) {
                await editor.evaluate(h => mapEditor.selectHash(h, {jump:true}), hash);
                assert.match(await editor.locator('#tile-meta').textContent(), label);
                assert.equal(await editor.locator('#tile-fields').evaluate(e=>e.disabled), true);
                assert.equal(await editor.locator('#apply-tile').isDisabled(), true);
                assert.equal(await editor.locator('#remove-tile').isDisabled(), true);
            }
            await editor.evaluate(() => mapEditor.selectHash('1,4', {jump:true}));
            assert.equal(await editor.locator('#tile-fields').evaluate(e=>e.disabled), false);
            await editor.locator('#text-plain').fill('Edited legal mod entrance');
            await editor.locator('#apply-tile').click();
            assert.equal(await editor.evaluate(() => mapEditor.project.tiles.get('1,4').text), 'Edited legal mod entrance');
            const atomic = await editor.evaluate(async ({outside,inside}) => {
                const {EditorProject} = await import('/tools/map-editor/model.mjs');
                const {relativePath} = await import('/tools/map-editor/geometry.mjs');
                const {blockMap} = await import('/js/hy/maploader.js');
                const plain = {type:0,text:'probe',data:{}}, checked=[];
                const snap=p=>JSON.stringify({json:p.toJSON(),undo:p._undo,redo:p._redo,next:p._nextId});
                function reject(p,label,run) {
                    const before=snap(p); let failure;
                    try {run();} catch (error) {failure=String(error.message);}
                    if (!failure) throw Error(`${label}: illegal operation succeeded`);
                    if (!/只读官方|半平面/.test(failure)) throw Error(`${label}: unrelated rejection: ${failure}`);
                    if (snap(p)!==before) throw Error(`${label}: failed operation mutated model/history/IDs`);
                    checked.push({label,error:failure});
                }
                const live=mapEditor.project;
                for (const hash of ['1',outside]) {
                    reject(live,`put ${hash}`,()=>live.put(hash,plain));
                    reject(live,`remove ${hash}`,()=>live.remove(hash));
                }
                // Module transaction probes use the same real project and full readonly base in an isolated model.
                const p=EditorProject.fromJSON(live.toJSON(),live.polygon);
                p.setReadonlyBase([...blockMap.keys()].filter(h=>!live.tiles.has(h)));
                const room={format:'deductrium-map-module-v1',id:'probe',revision:1,
                    tiling:{p:6,q:4},tiles:[{id:'a',at:[],...plain}],ports:{}};
                p.registerModule(room);
                for (const hash of ['1',outside]) {
                    const placement={id:'bad',at:hash.split(',').map(Number),rotation:0};
                    const before=snap(p), preview=p.previewMount('probe',placement);
                    if (!preview.errors.length || snap(p)!==before) throw Error('Illegal preview was accepted or mutated state');
                    checked.push({label:`preview ${hash}`,error:preview.errors.join('; ')});
                    reject(p,`mount ${hash}`,()=>p.mount('probe',placement));
                }
                p.mount('probe',{id:'one',at:inside.split(',').map(Number),rotation:0});
                for (const hash of ['1',outside]) {
                    reject(p,`move ${hash}`,()=>p.moveInstance('one',{at:hash.split(',').map(Number),rotation:0}));
                    reject(p,`update ${hash}`,()=>p.updateModule({...room,revision:2,
                        tiles:[{id:'a',at:relativePath(hash,inside,p.polygon),...plain}]},{deletedTileIds:[]}));
                }
                return checked;
            }, coords);
            assert.equal(atomic.length, 12);
            const editorBase = (await readMap(editor)).filter(([h]) => h !== '1,4');
            assert.deepEqual(editorBase, base, 'editor edits must preserve every official tile body');

            await editor.locator('#open-project').click();
            await editor.locator('#publish-settings').evaluate(e => e.open=true);
            const download = editor.waitForEvent('download');
            await editor.locator('#export-world').click();
            const published = JSON.parse(await readFile(await (await download).path(), 'utf8'));
            assert.equal(published.format, 'deductrium-world-v2');
            assert.deepEqual(published.region, region); assert.deepEqual(published.entry, entry);
            assert.equal(published.tiles.length, 1); assert.equal(published.tiles[0].id, 'entry');
            assert.equal(published.tiles[0].text, 'Edited legal mod entrance');
            const previousProject=await editor.evaluateHandle(()=>mapEditor.project);
            await upload(editor, published);
            await editor.waitForFunction(previous=>mapEditor.project!==previous,previousProject);
            await previousProject.dispose();
            assert.deepEqual(await editor.evaluate(async () => {
                const {buildWorld}=await import('/tools/map-editor/publish.mjs');
                return buildWorld(mapEditor.project);
            }), published, 'actual publication round-trips through the import UI');
            const popup=context.waitForEvent('page'); await editor.locator('#play-world').click();
            const gamePage=await popup; await ready(gamePage);
            assert.equal(new URL(gamePage.url()).search, '?mod-world');
            assert.deepEqual((await readMap(gamePage)).filter(([h])=>h!=='1,4'),base,
                'runtime extension preserves the entire official base');
            const initial = await progress(gamePage);
            assert.deepEqual(initial.current,[], 'fresh extensions start at the official spawn');
            assert.equal(initial.worldPosition.hash,'');
            assert.equal(initial.worldPosition.tileId,undefined);
            assert.equal(initial.ms.counts['mod:half-plane-browser::starts'], undefined,
                'a remote mod spawn must not run its start handler');
            assert.equal(await gamePage.evaluate(()=>{
                const r=game.hyLayer.world.localCamMat;
                return r.r===1 && r.x===0 && r.y===0 && r.z===0;
            }),true,'mod spawn rotation must not rotate the official spawn');
            assert.equal(initial.ms.counts['mod:half-plane-browser::touches'], undefined,
                'spawn does not synthesize touch/pass events');
            await gamePage.evaluate(async () => {
                const {Rotor}=await import('/js/hy/algebra.js');
                const w=game.hyLayer.world;
                w.currentTile=[1]; w.localCamMat=new Rotor(); w.atlasTile.generateRotors([1]);
            });
            const outward=await cross(gamePage,'1,4');
            assert.equal(outward.edge,4); assert(outward.steps>0);
            const touched=await progress(gamePage), sid='mod:half-plane-browser::entry';
            assert.equal(touched.ms.counts['mod:half-plane-browser::touches'],1);
            assert.deepEqual(touched.ms.eventDone[sid],['touch']);
            const homeward=await cross(gamePage,'1'); assert(homeward.steps>0);
            assert.deepEqual((await readMap(gamePage)).filter(([h])=>h!=='1,4'),base,
                'actual bidirectional movement leaves all official bodies unchanged');
            // Earn genuine official progress through the existing callback, not through fabricated save fields.
            const earned=await gamePage.evaluate(async () => {
                const {nameMap}=await import('/js/hy/maploader.js');
                const hash=nameMap.get('highlightd');
                if (!hash || !game.hyLayer.world.hitTest(hash.split(',').map(Number)))
                    throw Error('Official highlightd reward callback rejected');
                return hash;
            });
            const afterReward=await readMap(gamePage);
            assert.deepEqual(afterReward.filter(([h])=>h!=='1,4'&&h!==earned),base.filter(([h])=>h!==earned));
            assert.equal(afterReward.find(([h])=>h===earned)[1].type,0);
            await cross(gamePage,'1,4');
            const beforeReload=await progress(gamePage);
            assert(beforeReload.rw.includes('highlightd')); assert.deepEqual(beforeReload.current,[1,4]);
            assert.deepEqual(beforeReload.ms,touched.ms,'once handlers do not rerun on return');
            await gamePage.evaluate(() => {game.saveload.cancelPendingSave();game.saveload.save();});
            await gamePage.reload(); await ready(gamePage);
            assert.deepEqual(await progress(gamePage),beforeReload,
                'reload preserves eventDone, counters, custom position and official progress');
            assert.deepEqual(await readMap(gamePage),afterReward);
            await cross(gamePage,'1');
            await gamePage.evaluate(() => {game.saveload.cancelPendingSave();game.saveload.save();});
            const officialPosition=await progress(gamePage);
            await gamePage.reload(); await ready(gamePage);
            assert.deepEqual(await progress(gamePage),officialPosition,'official-side position also survives reload');
            await cross(gamePage,'1,4');
            assert.deepEqual((await progress(gamePage)).ms,touched.ms,'persisted once guards prevent repeat effects');
            assert.equal(await gamePage.evaluate(()=>localStorage.getItem('deductrium2_survival')),officialSave);

            await gamePage.evaluate(()=>{game.saveload.cancelPendingSave();game.saveload.save();});
            const beforeMigration=await progress(gamePage), migrated=structuredClone(published);
            migrated.revision=2; migrated.tiles[0].id='entry-v2';
            migrated.entry.tileId='entry-v2'; migrated.spawn.tileId='entry-v2';
            migrated.migrations=[{from:1,to:2,remap:{entry:'entry-v2'},reset:[]}];
            await gamePage.evaluate(world=>localStorage.setItem('deductrium2_world_manifest',JSON.stringify(world)),migrated);
            await gamePage.reload(); await ready(gamePage);
            const expected=structuredClone(beforeMigration), newSid='mod:half-plane-browser::entry-v2';
            expected.worldPosition.tileId='entry-v2';
            expected.ms.eventDone[newSid]=expected.ms.eventDone[sid]; delete expected.ms.eventDone[sid];
            assert.deepEqual(await progress(gamePage),expected,
                'revision migration remaps eventDone and saved position while preserving official progress');
            assert.equal(await gamePage.evaluate(()=>game.saveload.serialize().world.revision),2);
            const migratedMap=structuredClone(afterReward);
            migratedMap.find(([h])=>h==='1,4')[1].name=newSid;
            assert.deepEqual(await readMap(gamePage),migratedMap);
            await cross(gamePage,'1'); await cross(gamePage,'1,4');
            assert.deepEqual((await progress(gamePage)).ms,expected.ms,'remapped once guards prevent repeat effects');

            const standalone=structuredClone(published);
            standalone.id='half-plane-standalone'; standalone.mode='standalone'; delete standalone.entry;
            await gamePage.evaluate(world=>localStorage.setItem('deductrium2_world_manifest',JSON.stringify(world)),standalone);
            await gamePage.reload(); await ready(gamePage);
            const only=await readMap(gamePage);
            assert.deepEqual(only.map(([h])=>h),['1,4'],'standalone loads only mod tiles');
            assert.equal(await gamePage.evaluate(()=>game.hyLayer.world.hitTest([1])),false);
            assert.deepEqual((await progress(gamePage)).current,[1,4]);
            assert.equal((await progress(gamePage)).ms.counts['mod:half-plane-standalone::starts'],1,
                'standalone worlds still execute their configured spawn start handler');
            assert.equal(await gamePage.evaluate(()=>{
                const r=game.hyLayer.world.localCamMat;
                return Math.abs(r.r)<1e-12 && Math.abs(Math.abs(r.z)-1)<1e-12;
            }),true,'standalone worlds keep their configured spawn rotation');
            assert.equal(await gamePage.evaluate(()=>localStorage.getItem('deductrium2_survival')),officialSave);
            assert.deepEqual(errors,[]);
            console.log(JSON.stringify({viewport,officialTiles:base.length,editor:'PASS',atomicRejections:atomic.length,
                publicationV2:'PASS',moveCam:{outward,homeward},reload:'PASS',migration:'PASS',officialProgress:'PASS',standalone:'PASS',errors}));
        } finally {await context.close();}
    }
} finally {
    await browser?.close();
    if (server.listening) await new Promise(r=>server.close(r));
}
