// PLAYWRIGHT_MODULE may point to an installed Playwright entry point.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(/^[A-Za-z]:|^\//.test(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
    catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
        for (const mode of ['survival', 'creative']) {
            const context = await browser.newContext({ viewport });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.goto(`${base}/?${mode}`);
            await page.waitForFunction(() => window.game?.hsLayer?.hilbertSystem);
            const checks = await page.evaluate(async mode => {
                const { HSParser } = await import('/js/hs/core/parser.js');
                const { SyntaxViewer } = await import('/js/astrender.js');
                const { initialCreativeRules } = await import('/js/hs/core/initial.js');
                const { getCommand } = await import('/js/hs/gui/cmdmgr.js');
                const game = window.game, layer = game.hsLayer, hs = layer.hilbertSystem, world = game.hyLayer.world;
                const parser = new HSParser();
                const hit = name => world.hitTest(world.getNamedBlockHash(name).split(',').map(Number));
                const display = document.querySelector('div[data-layer="D-layer"]');
                const notation = document.createElement('span');
                display.appendChild(notation);
                new SyntaxViewer(notation, new HSParser(), '#nf($p,$x)', 'wff');
                const compact = notation.querySelector('.ast-compact');
                const freeNotation = document.createElement('span');
                display.appendChild(freeNotation);
                new SyntaxViewer(freeNotation, new HSParser(), '#nf($p,x)', 'wff');
                const gateRow = document.getElementById('hs-last-gate');
                const folderButton = document.getElementById('ruleAddFolder');
                let count = 0;
                const check = (value, message) => { if (!value) throw Error(message); count++; };
                const fresh = structuredClone(game.saveload.serialize());
                const hidden = el => el.classList.contains('hide');
                if (mode === 'survival') {
                    check(display.classList.contains('hs-plain-items'), 'terms initially plain');
                    check(display.classList.contains('hs-literal-assertions'), 'assertions initially literal');
                    check(hidden(folderButton), 'folder button initially locked');
                    check(getComputedStyle(notation.querySelector('.token-replvar-var')).fontStyle === 'normal', 'locked terms render without italics');
                    if (compact) check(getComputedStyle(compact.querySelector('.ast-compact-syntax')).display !== 'none', 'locked notation shows original source punctuation');
                    check(getComputedStyle(freeNotation.querySelector('.token-atom-free-var')).color === 'rgb(255, 0, 0)', 'locked notation preserves variable token color');
                    layer.rememberGate(parser.parse('$p', 'wff'));
                    check(hidden(gateRow), 'gate recall initially locked');
                    hit('dL');
                } else {
                    check(!display.classList.contains('hs-plain-items'), 'creative italic terms');
                    check(!display.classList.contains('hs-literal-assertions'), 'creative compact notation');
                    check(!hidden(folderButton), 'creative folder button');
                }
                layer.addRules('zBefore:⊢$p→($q→$p);a1 $p $q;');
                const node = layer.ruleList.find(node => node.name === 'zBefore');
                check(!!node && !hs.rules.get('zBefore').error, 'checked rename fixture');
                if (mode === 'survival') {
                    check(!layer.ruleListView.menuItems(node).some(item => item.action === 'rename'), 'rename menu locked');
                    check(layer.ruleListView.onRename(node, 'zDenied') === false, 'rename callback locked');
                    check(hs.rules.has('zBefore') && !hs.rules.has('zDenied'), 'denied rename preserves rule');
                    for (const reward of ['renameD', 'copygateD', 'italic-item', 'omit-fn', 'mkdir']) hit(reward);
                }
                check(layer.ruleListView.menuItems(node).some(item => item.action === 'rename'), 'rename menu unlocked');
                check(layer.ruleListView.onRename(node, 'zAfter') === true, 'rename callback unlocked');
                node.name = 'zAfter';
                check(hs.rules.has('zAfter') && !hs.rules.has('zBefore'), 'rename updates rule');
                check(!display.classList.contains('hs-plain-items') && !display.classList.contains('hs-literal-assertions'), 'notation rewards applied');
                check(getComputedStyle(notation.querySelector('.token-replvar-var')).fontStyle === 'italic', 'unlocked terms render in italics');
                if (compact) check(getComputedStyle(compact.querySelector('.ast-compact-syntax')).display === 'none', 'unlocked notation uses compact renderer');
                check(!hidden(folderButton), 'folder button unlocked');
                layer.cmdInput.setValue('d a1');
                const input = layer.cmdInput.getValue();
                check(world.onPassGate('ui-prop', { type: 2, text: '$p', data: { p: true } }, 'ui-prop') === false, 'unproved gate stays closed');
                check(!hidden(gateRow) && document.getElementById('hs-last-gate-content').textContent === '$p', 'failed gate remembered');
                check(layer.cmdInput.getValue() === input, 'gate recall preserves input');
                world.onPassGate('ui-rule', { type: 2, text: '⊢$p', data: { d: true } }, 'ui-rule');
                check(document.getElementById('hs-last-gate-content').textContent === '⊢$p', 'rule gate remembered');
                world.onPassGate('ui-prop', { type: 2, text: '$p', data: { p: true } }, 'ui-prop');
                if (mode === 'survival') hit('.prop');
                const findRule = (list, name) => {
                    for (const node of list) {
                        if (node.name === name) return node;
                        const found = node.children && findRule(node.children, name);
                        if (found) return found;
                    }
                };
                const identity = findRule(layer.ruleList, '.i');
                check(identity && layer.ruleListView.onRename(identity, 'zIdentity'), 'builtin rule can be renamed after reward');
                identity.name = 'zIdentity';
                if (mode === 'survival') { hit('iff'); hit('neg'); }
                check(!hs.rules.has('.i') && hs.rules.has('zIdentity'), 'later rewards preserve builtin alias');
                check(hs.rules.get('.<>i')?.step?.length && !hs.rules.get('.<>i').error, 'later toolkit dependencies replay with builtin aliases');
                if (mode === 'survival') {
                    const advanced = structuredClone(game.saveload.serialize());
                    const legacyFresh = structuredClone(fresh);
                    delete legacyFresh.hs.rsr;
                    game.saveload.deserialize(legacyFresh);
                    check(hidden(gateRow), 'fresh save clears last gate');
                    check(display.classList.contains('hs-plain-items') && display.classList.contains('hs-literal-assertions'), 'fresh save resets notation');
                    check(hidden(folderButton), 'fresh save resets folder permission');
                    check(hs.renamedSysRule.size === 0, 'legacy fresh save clears builtin aliases');
                    game.saveload.deserialize(advanced);
                    check(!display.classList.contains('hs-plain-items') && !display.classList.contains('hs-literal-assertions'), 'advanced save restores notation');
                    check(!hidden(folderButton) && hidden(gateRow), 'advanced save restores folders without stale gate');
                    check(!hs.rules.has('.i') && hs.rules.has('zIdentity') && hs.renamedSysRule.get('.i') === 'zIdentity', 'save restores builtin alias without old name');
                    world.onPassGate('ui-prop', { type: 2, text: '$p', data: { p: true } }, 'ui-prop');
                }
                if (/apn1:/.test(initialCreativeRules)) {
                    const arithmetic = parser.parse('d .2+3', 'cmd');
                    if (mode === 'survival') {
                        let locked = false;
                        try { await getCommand('d').execute(arithmetic.nodes); }
                        catch (error) { locked = error.type === 'lockedFeature'; }
                        check(locked && !hs.rules.has('.2+3'), 'combined arithmetic initially locked without generation');
                        for (const reward of ['1st', 'a7', 'a8', 'peano', 'add-mul', 'natop']) hit(reward);
                    }
                    await getCommand('d').execute(arithmetic.nodes);
                    check(hs.props.at(-1).ast.toString() === '2+3=5', 'combined reward-selected arithmetic proof');
                    check(world.onPassGate('ui-sum', { type: 2, text: '2+3=5', data: { p: true } }, 'ui-sum'), 'combined arithmetic opens a proposition gate');
                    world.onPassGate('ui-prop', { type: 2, text: '$p', data: { p: true } }, 'ui-prop');
                }
                return count;
            }, mode);
            await page.locator('button[data-layer="D-layer"]').click();
            await page.locator('#cmd-esc-btn').click();
            const input = page.locator('#hs-cmd-input textarea');
            await input.fill('d a1');
            await page.locator('#cmd-ok-btn').click();
            await page.waitForFunction(() => document.getElementById('cmd-prompt').style.display !== 'none');
            await page.locator('#hs-last-gate-content span[data-start]').first().click();
            assert.match(await input.inputValue(), /\$p/, 'last gate click inserts a command parameter');
            assert.deepEqual(errors, []);
            console.log(JSON.stringify({ viewport, mode, checks, gateClick: true }));
            if (mode === 'survival') {
                // Reload through the real compressed SaveLoad path, including Game's constructor.
                await page.evaluate(() => {
                    const game = window.game;
                    game.saveload.cancelPendingSave();
                    const data = { ...game.saveload.serialize(), rw: ['dG', 'mct', 'mdt'],
                        dg: ['ccmp', 'mct2mdt'], D: 24, DC: 27 };
                    delete data.mo; delete data.ob; // The original reported save predates these fields.
                    localStorage.setItem('deductrium2_survival', LZString.compressToUTF16(JSON.stringify({
                        version: 0, mode: 'survival', timestamp: 0, data,
                    })));
                });
                await page.reload();
                await page.waitForFunction(() => window.game?.hyLayer?.world);
                const restored = await page.evaluate(async () => {
                    const { blockMap, nameMap } = await import('/js/hy/maploader.js');
                    const game = window.game;
                    const gates = ['ccmp', 'mct2mdt'].map(name => {
                        const hash = nameMap.get(name), tile = blockMap.get(hash);
                        return { name, type: tile.type, del: tile.data.del,
                            pass: game.hyLayer.world.hitTest(hash.split(',').map(Number)) };
                    });
                    return { gates, reward: game.gotRewards.has('mdt'), D: game.deductrium, DC: game.deductriumConsumed };
                });
                assert.deepEqual(restored, {
                    gates: ['ccmp', 'mct2mdt'].map(name => ({ name, type: 0, del: true, pass: true })),
                    reward: true, D: 24, DC: 27,
                });
                assert.deepEqual(errors, []);
                console.log(JSON.stringify({ viewport, savedGateRestoration: true }));
            }
            await context.close();
        }
    }
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
