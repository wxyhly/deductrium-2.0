// Run: node test/browser/intuitionistic.mjs [repository root]
// Uses the checked-in example and compiled production js/ without bridges or mocks.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp} from 'node:fs/promises';
import {resolve, extname, sep, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, 'examples/intuitionistic-propositional.world.json'), 'utf8'));
assert.equal(manifest.mode, 'extension');
const tile = id => {
    const found = manifest.tiles.find(tile => tile.id === id);
    assert.ok(found, `example contains ${id}`);
    return found;
};
const qualified = id => `mod:${manifest.id}::${id}`;
const ipcRules = ['a3i','d/\\i','d/\\i1','d/\\i2','d\\/i1','d\\/i2','d\\/i',
    'd~i','d~i1','d<>i','d<>i1','d<>i2'];
// Replay actual commands through the player command bar, including scope closing
// and macro recording. No proof objects or provenance summaries are manufactured.
const solutions = [
    ['identity', ['a1 P P','a1 P (P→P)','a2 P (P→P) P','mp 3 2','mp 4 1']],
    ['and-commutes', ['cond P∧Q','d/\\i1 P Q','mp 2 1','d/\\i2 P Q','mp 4 1',
        'd/\\i Q P','mp 6 5','mp 7 3','pop']],
    ['pair-rule', ['hyp P','hyp Q','d/\\i P Q','mp 3 1','mp 4 2','m qBrowserPair']],
    ['cases-rule', ['hyp P→R','hyp Q→R','hyp P∨Q','d\\/i P R Q','mp 4 1','mp 5 2','mp 6 3','m qBrowserCases']],
    ['double-negation', ['cond P','a1 P ¬P','mp 2 1','.i ¬P','d~i ¬P P','mp 5 3','mp 6 4','pop']],
    ['contraposition-rule', ['hyp P→Q','hyp ¬Q','a3i P Q','mp 3 1','mp 4 2','m qBrowserContra']],
    ['iff-reflexive', ['.i P','d<>i P P','mp 2 1','mp 3 1']],
    ['final-conjunction', ['cond P∧Q','d/\\i1 P Q','mp 2 1','d/\\i2 P Q','mp 4 1',
        'd/\\i Q P','mp 6 5','mp 7 3','d\\/i1 P Q','mp 9 3',
        'd/\\i (Q∧P) (P∨Q)','mp 11 8','mp 12 10','pop']],
];
assert.deepEqual(new Set(solutions.map(([id]) => id)), new Set(manifest.tiles.filter(t => t.data?.pi || t.data?.di).map(t => t.id)),
    'every actual native tutorial gate has a browser solution');

const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) {res.writeHead(403).end();return;}
        res.setHeader('Content-Type', ({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html',
            '.css':'text/css','.json':'application/json'})[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch {res.writeHead(404).end();}
});
const ready = async page => {
    await page.waitForFunction(() => window.game || document.getElementById('world-load-error'));
    assert.equal(await page.locator('#world-load-error').count(), 0, 'actual example loads');
    await page.waitForSelector('#loading.hide', {state:'attached'});
    assert.equal(new URL(page.url()).search, '?mod-world');
};
const state = page => page.evaluate(() => ({
    position:game.hyLayer.world.currentTile.join(','), rules:[...game.hsLayer.hilbertSystem.rules.keys()],
    rewards:[...game.gotRewards], script:structuredClone(game.mapScript), saveKey:game.saveload.saveKey,
}));
// Exercise the native collision -> Game callbacks -> scripts/HS chain. Accepted
// steps also run the normal arrival callback; rejected gates never move the player.
const step = (page, hash, move = true) => page.evaluate(({hash,move}) => {
    const world = game.hyLayer.world, coords = hash ? hash.split(',').map(Number) : [];
    const accepted = world.hitTest(coords);
    if (accepted && move) {world.currentTile = coords;world.onStepToAnotherTile(hash);}
    return accepted;
}, {hash,move});
const hit = (page, id) => step(page, tile(id).hash, false);
const command = async (page, commands) => {
    const source = (Array.isArray(commands) ? commands : [commands]).map(text =>
        /^(?:hyp|cond|pop|m|rename|clear)\b/.test(text) ? text : 'd ' + text).join(';');
    await page.locator('#hs-cmd-input textarea').fill(source);
    await page.locator('#cmd-ok-btn').click();
    await page.waitForFunction(() => !game.hsLayer.cmdEngine.isExecuting() ||
        document.getElementById('cmd-error').style.display !== 'none');
    assert.equal(await page.locator('#cmd-error').isVisible(), false,
        `command ${source}: ${await page.locator('#cmd-error').textContent()}`);
    assert.equal(await page.evaluate(() => game.hsLayer.cmdEngine.isExecuting()), false, `complete command: ${source}`);
};
const newSheet = async page => {
    const before = await page.locator('#propSheetTabs .sheet-tab').count();
    await page.locator('#propSheetTabs .sheet-tab-add').click();
    assert.equal(await page.locator('#propSheetTabs .sheet-tab').count(), before + 1);
    assert.equal(await page.evaluate(() => game.hsLayer.hilbertSystem.props.length), 0);
};
const switchSheet = async (page, index) => {
    await page.locator(`#propSheetTabs .sheet-tab[data-sheet-index="${index}"] .sheet-tab-name`).click();
    assert.equal(await page.evaluate(() => game.hsLayer.getSheetGui().activeIndex), index);
};
const nativeGate = (page, id, restricted = true) => page.evaluate(async ({text,rule,restricted}) => {
    const {HSParser} = await import('/js/hs/core/parser.js');
    const ast = new HSParser().parse(text, rule ? 'rule' : 'wff');
    const layer = game.hsLayer, policy = restricted ? ['propositional','intuitionistic'] : undefined;
    return rule ? layer.checkRuleGate(ast, policy) : layer.checkPropGate(ast, policy);
}, {text:tile(id).text,rule:!!tile(id).data.di,restricted});
const provenance = (page, kind, key) => page.evaluate(async ({kind,key}) => {
    const {stepProvenance,ruleProvenance} = await import('/js/hs/provenance.js');
    const hs = game.hsLayer.hilbertSystem;
    const value = kind === 'rule' ? ruleProvenance(hs, hs.rules.get(key)) : stepProvenance(hs, hs.props[key]);
    return {...value, formula:kind === 'rule' ? hs.rules.get(key).toString() : hs.props[key].ast.toString()};
}, {kind,key});
const badge = async (page, scope, tag) => {
    const found = page.locator(`${scope} [data-proof-tag="${tag}"]`).first();
    await found.scrollIntoViewIfNeeded();
    assert.equal(await found.isVisible(), true, `${scope} displays ${tag}`);
    assert.notEqual((await found.textContent()).trim(), '', 'badge has a localized label');
    assert.equal(await found.locator('..').getAttribute('data-provenance-valid'), 'true');
};
const ruleRow = (page, id) => page.locator('#ruleRows .item-row').filter({
    has:page.locator('.name-text').filter({hasText:new RegExp('^'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')}),
});
const saveReload = async page => {
    // Reload allocates fresh UI identities for map-provided rules. Compare every
    // semantic field, including complete proof commands and renamed sources.
    const semantic = ({ri, ...data}) => ({...data, r:data.r.replace(/^\(\d+\)/gm, '')});
    const before = await page.evaluate(() => {
        game.saveload.cancelPendingSave();game.saveload.save();
        return {hs:game.hsLayer.serialize(),script:structuredClone(game.mapScript),key:game.saveload.saveKey,
            raw:localStorage.getItem(game.saveload.saveKey)};
    });
    assert.ok(before.raw, 'actual game save was written');
    await page.reload();await ready(page);
    assert.deepEqual(semantic(await page.evaluate(() => game.hsLayer.serialize())), semantic(before.hs),
        'proofs, rules, aliases and active sheet reload');
    assert.deepEqual((await state(page)).script, before.script, 'world script progress reloads');
    assert.equal((await state(page)).saveKey, before.key);
    assert.equal(await page.evaluate(() => localStorage.getItem('deductrium2_survival')), 'preserve-official-save');
};
const collectToolkit = async page => {
    const initial = await state(page);
    assert.equal(initial.position, '', 'extension starts at official origin');
    assert.deepEqual(new Set(initial.rules), new Set(['a1','a2','mp']));
    assert.ok(!initial.rewards.includes(qualified('toolkit')));
    assert.ok(!Object.keys(initial.script.eventDone ?? {}).some(id => id.startsWith(`mod:${manifest.id}::`)),
        'official origin does not trigger a mod start/touch/collect event');
    assert.ok(!Object.keys(initial.script.done ?? {}).includes(qualified(manifest.spawn.tileId)));
    assert.equal(await step(page, manifest.entry.mainHash), true);
    assert.equal(await step(page, tile('entry').hash), true);
    assert.equal(await step(page, tile('toolkit').hash), true, 'real hitTest collects the toolkit');
    const after = await state(page);
    for (const id of [...ipcRules,'.i']) assert.ok(after.rules.includes(id), `toolkit grants ${id}`);
    for (const id of ['a3','.a30','d/\\','d\\/']) assert.ok(!after.rules.includes(id), `toolkit does not grant ${id}`);
    for (const id of ['macro','hyp','mct','mdt','copygateD']) assert.ok(after.rewards.includes(id));
    assert.ok(after.script.eventDone[qualified('toolkit')].includes('collect'));
    assert.equal(await page.locator('button[data-layer="D-layer"]').isVisible(), true);
    await page.locator('button[data-layer="D-layer"]').click();
};
const classicRewards = page => page.evaluate(async () => {
    const {nameMap} = await import('/js/hy/maploader.js');
    for (const id of ['neg','.prop','renameD']) {
        const hash = nameMap.get(id);
        if (hash === undefined || !game.hyLayer.world.hitTest(hash.split(',').map(Number)))
            throw Error(`Official reward could not be collected: ${id}`);
        if (!game.gotRewards.has(id)) throw Error(`Official reward not granted: ${id}`);
    }
});

async function tutorial(page, screenshots, width) {
    await collectToolkit(page);
    for (const [index,[id,commands]] of solutions.entries()) {
        if (index) await newSheet(page);
        assert.equal(await hit(page,id), false, `${id} initially blocks without its proof/rule`);
        assert.equal(await nativeGate(page,id), false, `${id} native predicate initially blocks`);
        await command(page,commands);
        assert.equal(await nativeGate(page,id), true, `${id} native #pi/#di accepts the actual derivation`);
        assert.equal(await step(page,tile(id).hash), true, `${id} actual scripted/native collision accepts`);
        assert.equal(await page.evaluate(hash => game.hyLayer.world.getBlock(hash).type, tile(id).hash), 0,
            `${id} pass handler opens the door`);
        assert.equal((await state(page)).script.tileEdits[qualified(id)].type, 0,
            `${id} repeat pass persists its open-gate edit`);
    }
    assert.equal(await step(page,tile('completed').hash), true);
    assert.ok((await state(page)).script.flags.includes(qualified('ipc-complete')));
    await badge(page,'#propRows','intuitionistic');
    await badge(page,'#propRows','propositional');
    await page.screenshot({path:join(screenshots,`ipc-completed-${width}.png`)});
    console.log(JSON.stringify({width,scenario:'tutorial',checkpoint:'all-eight-native-gates-and-completion-pass'}));
    await saveReload(page);
    for (const [id] of solutions) {
        const macro = {'pair-rule':'qBrowserPair','cases-rule':'qBrowserCases','contraposition-rule':'qBrowserContra'}[id];
        const detail = macro ? await provenance(page,'rule',macro) : null;
        assert.equal(await nativeGate(page,id), true, `${id} proof survives game reload: ${JSON.stringify(detail)}`);
        assert.equal(await hit(page,id), true, `${id} remains traversable`);
    }
    return {nativeGates:solutions.length,toolkit:true,completed:true,reloaded:true};
}

async function classicalIsolation(page, screenshots, width) {
    await collectToolkit(page);
    await classicRewards(page);
    // Derive exactly P→P using a3, rather than merely owning the classical axiom.
    await command(page,['.i ¬P','a3 P P','mp 2 1','m qClassicalIdentity','.i ¬P','a3 P P','mp 2 1']);
    assert.ok((await provenance(page,'step',2)).tags.includes('classical'));
    assert.ok((await provenance(page,'rule','qClassicalIdentity')).tags.includes('classical'));
    assert.equal(await nativeGate(page,'identity',false), true, 'same formula is an unrestricted proof');
    assert.equal(await nativeGate(page,'identity'), false, 'a3 dependency fails native #pi');
    assert.equal(await hit(page,'identity'), false, 'a3 dependency fails the actual example gate');
    await badge(page,'#propRows','classical');
    await command(page,'rename qClassicalIdentity qNeutralIdentity');
    assert.ok((await provenance(page,'rule','qNeutralIdentity')).tags.includes('classical'));
    await newSheet(page);
    await command(page,['hyp P→Q','hyp ¬Q','.a30 P Q','mp 3 1','mp 4 2','m qHistoricalContra',
        'hyp P→Q','hyp ¬Q','.a30 P Q','mp 3 1','mp 4 2']);
    const historical = await provenance(page,'step',2);
    assert.ok(historical.tags.includes('classical'), 'old .a30 proof stays classical');
    assert.equal(await nativeGate(page,'contraposition-rule',false), true, 'historical macro matches the rule formula');
    assert.equal(await nativeGate(page,'contraposition-rule'), false, 'historical macro fails native #di');
    assert.equal(await hit(page,'contraposition-rule'), false, 'historical macro fails the actual gate');
    await command(page,['rename .a30 qOldContra','rename qHistoricalContra qNeutralContra']);
    await badge(page,'#propRows','classical');
    for (const id of ['a3','qNeutralIdentity','qOldContra','qNeutralContra']) {
        const result = await provenance(page,'rule',id);
        assert.equal(result.valid,true, `${id} renamed source can be replayed`);
        assert.ok(result.tags.includes('classical'), `${id} rename never launders classical sources`);
    }
    assert.equal(await nativeGate(page,'identity'), false);
    assert.equal(await hit(page,'identity'), false, 'rename does not open #pi');
    assert.equal(await nativeGate(page,'contraposition-rule'), false);
    assert.equal(await hit(page,'contraposition-rule'), false, 'rename does not open #di');
    await badge(page,'#propRows','classical');
    // The independent primitive proves the identical contraposition schema and
    // records the identical rule, with a genuinely different primitive source.
    await newSheet(page);
    await command(page,['hyp P→Q','hyp ¬Q','a3i P Q','mp 3 1','mp 4 2','m qConstructiveContra',
        'hyp P→Q','hyp ¬Q','a3i P Q','mp 3 1','mp 4 2']);
    const independent = await provenance(page,'step',2);
    assert.equal(independent.formula,historical.formula, 'a3i and old .a30 instantiate the same formula');
    assert.deepEqual(independent.tags,['intuitionistic']);
    assert.equal((await provenance(page,'rule','qConstructiveContra')).tags.includes('classical'), false);
    assert.equal(await nativeGate(page,'contraposition-rule'), true);
    assert.equal(await hit(page,'contraposition-rule'), true, 'actual #di accepts the independent a3i proof');
    await badge(page,'#propRows','intuitionistic');
    // A different sheet supplies an allowed proof while the active sheet still
    // contains only its original classical identity. Gate checks must restore it.
    await newSheet(page);await command(page,'.i P');
    await badge(page,'#propRows','propositional');
    await switchSheet(page,0);
    const before = await page.evaluate(() => game.hsLayer.hilbertSystem.genCmd().join(';'));
    assert.ok((await provenance(page,'step',2)).tags.includes('classical'));
    assert.equal(await nativeGate(page,'identity'), true, 'another sheet supplies the IPC-compatible identity');
    assert.equal(await hit(page,'identity'), true, 'actual #pi searches the other proof sheet');
    assert.equal(await page.evaluate(() => game.hsLayer.getSheetGui().activeIndex), 0);
    assert.equal(await page.evaluate(() => game.hsLayer.hilbertSystem.genCmd().join(';')),before,
        'gate checks restore the active classical proof context');
    await badge(page,'#propRows','classical');
    await badge(page,'#ruleRows','classical');
    assert.equal(await ruleRow(page,'qNeutralContra').locator('[data-proof-tag="classical"]').count(), 1, 'recorded renamed rule displays its classical badge');
    await page.screenshot({path:join(screenshots,`ipc-classical-sources-${width}.png`)});
    console.log(JSON.stringify({width,scenario:'classical',checkpoint:'classic-legacy-reject-rename-a3i-other-sheet-badges-pass'}));
    await saveReload(page);
    for (const id of ['a3','qNeutralIdentity','qOldContra','qNeutralContra']) {
        const result = await provenance(page,'rule',id);
        assert.equal(result.valid,true, `${id} source can be replayed after reload: ${JSON.stringify(result)}`);
        assert.ok(result.tags.includes('classical'), `${id} rename/save never launders classical sources`);
    }
    assert.ok((await provenance(page,'step',2)).tags.includes('classical'));
    assert.equal(await nativeGate(page,'identity'), true, 'alternate proof sheet survives reload');
    assert.equal(await nativeGate(page,'contraposition-rule'), true);
    await badge(page,'#propRows','classical');
    await switchSheet(page,2);await badge(page,'#propRows','intuitionistic');
    assert.equal((await provenance(page,'rule','qConstructiveContra')).tags.includes('classical'), false);
    return {classicRejected:true,legacyRejected:true,sameFormulaA3i:true,otherSheet:true,renameReload:true,badges:true};
}

await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const module = process.env.PLAYWRIGHT_MODULE;
const {chromium} = await import(module ? pathToFileURL(module).href : 'playwright');
const browser = await chromium.launch({headless:true,channel:'chrome'});
const origin = `http://127.0.0.1:${server.address().port}`;
const screenshots = await mkdtemp(join(tmpdir(),'deductrium-intuitionistic-'));
const failures = [];
try {
    for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        for (const [name,run] of [['tutorial',tutorial],['classical',classicalIsolation]]) {
            const context = await browser.newContext({viewport});
            const page = await context.newPage(), errors = [];
            page.on('pageerror',error => errors.push(String(error)));
            page.on('dialog',dialog => dialog.dismiss());
            await page.addInitScript(world => {
                // Set only the public launcher input. Game save data is created
                // and reloaded exclusively by the real production SaveLoad.
                localStorage.setItem('deductrium2_world_manifest',JSON.stringify(world));
                if (localStorage.getItem('deductrium2_survival') === null)
                    localStorage.setItem('deductrium2_survival','preserve-official-save');
            },manifest);
            try {
                await page.goto(origin+'/?mod-world');await ready(page);
                const result = await run(page,screenshots,viewport.width);
                assert.deepEqual(errors,[], 'no browser runtime errors');
                assert.equal(await page.evaluate(() => Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)>innerWidth),false,
                    'no page horizontal overflow');
                console.log(JSON.stringify({viewport,scenario:name,...result,pageErrors:errors}));
            } catch (error) {
                await page.screenshot({path:join(screenshots,`failure-${name}-${viewport.width}.png`)}).catch(() => {});
                console.error(JSON.stringify({viewport,scenario:name,pageErrors:errors,screenshots}));
                failures.push(error);
                console.error(error);
            } finally {await context.close();}
        }
    }
    console.log('Screenshots: '+screenshots);
    if (failures.length) throw new AggregateError(failures, 'Intuitionistic browser regressions failed');
} finally {await browser.close();await new Promise(resolve => server.close(resolve));}
