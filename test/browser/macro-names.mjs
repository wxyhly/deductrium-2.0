import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const server = createServer(async (req, res) => {
    try {
        const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = resolve(root, '.' + (name === '/' ? '/index.html' : name));
        if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', ({'.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json'})[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless: true, channel: 'chrome'});
try {
    for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
        const context = await browser.newContext({viewport});
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        const open = async () => {
            await page.goto(`http://127.0.0.1:${server.address().port}/?creative`);
            await page.waitForFunction(() => window.game?.hsLayer?.hilbertSystem);
            await page.locator('button[data-layer="D-layer"]').click();
        };
        await open();
        const input = page.locator('#hs-cmd-input textarea');
        const run = async text => { await input.fill(text); await input.press('Enter'); };
        const idle = () => page.waitForFunction(() => !window.game.hsLayer.cmdEngine.isExecuting());
        const snapshot = () => page.evaluate(() => JSON.stringify(window.game.hsLayer.serialize()));
        await run('.i $p'); await idle();
        const original = await snapshot();
        for (const name of ['mp(mp)', 'z(mp)', 'sGood extra', 'sGood,other']) {
            await run(`m ${name}`);
            await page.waitForFunction(() => document.querySelector('#hs-cmd-input textarea').disabled);
            assert.equal(await snapshot(), original, name + ' must not consume the proof');
            assert.equal(await page.evaluate(() => window.game.hsLayer.hilbertSystem.rules.has('')), false);
            assert.match(await page.locator('#cmd-error').textContent(), /名称|name/i);
            await page.keyboard.press('Escape');
        }
        await run('m sSaved'); await idle();
        assert.equal(await page.evaluate(() => window.game.hsLayer.hilbertSystem.rules.has('sSaved')), true);
        await run('.i $q'); await idle();
        const promptProof = await snapshot();
        await run('m');
        await page.waitForFunction(() => window.game.hsLayer.cmdEngine.getCompletionContext()?.command === 'm');
        await run('mp(mp)');
        await page.waitForFunction(() => document.querySelector('#hs-cmd-input textarea').disabled);
        assert.equal(await snapshot(), promptProof);
        await page.keyboard.press('Escape');
        await run('sPrompt'); await idle();
        assert.equal(await page.evaluate(() => window.game.hsLayer.hilbertSystem.rules.has('sPrompt')), true);
        const beforeRename = await snapshot();
        await run('rename sSaved "z(mp)"');
        await page.waitForFunction(() => document.querySelector('#hs-cmd-input textarea').disabled);
        assert.equal(await snapshot(), beforeRename);
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.game.saveload.save());
        await open();
        assert.equal(await page.evaluate(() => ['sSaved', 'sPrompt'].every(name => window.game.hsLayer.hilbertSystem.rules.get(name)?.step?.length)), true);
        await run('sSaved $r'); await idle();
        assert.equal(await page.evaluate(() => window.game.hsLayer.hilbertSystem.props[0].ast.toString()), '$r→$r');

        // Restore the exact empty-name rule format produced by older recordings.
        await page.evaluate(() => {
            const layer = window.game.hsLayer, data = layer.serialize();
            data.r += '\n(999999):⊢$p→$p;.i $p';
            data.ri = Math.max(data.ri, 1000000);
            layer.deserialize(data);
            window.game.saveload.save();
        });
        await open();
        assert.equal(await page.evaluate(() => !!window.game.hsLayer.hilbertSystem.rules.get('')?.step?.length), true);
        const stepBeforeDelete = await page.evaluate(() => window.game.hsLayer.hilbertSystem.genCmd());
        await page.locator('#ruleListWrapper .item-row[data-uuid="999999"] .dropdown-trigger').click();
        await page.locator('#ruleListWrapper .menu-item[data-uuid="999999"][data-action="delete"]').click();
        await page.waitForFunction(() => window.game.hsLayer.cmdEngine.getCompletionContext()?.command === 'del');
        await run('Y'); await idle();
        assert.equal(await page.evaluate(() => window.game.hsLayer.hilbertSystem.rules.has('')), false);
        assert.deepEqual(await page.evaluate(() => window.game.hsLayer.hilbertSystem.genCmd()), stepBeforeDelete);
        await page.evaluate(() => window.game.saveload.save());
        await open();
        assert.equal(await page.evaluate(() => window.game.hsLayer.hilbertSystem.rules.has('')), false);
        assert.equal(await page.evaluate(() => window.game.hsLayer.hilbertSystem.rules.has('sSaved')), true);

        // A bare del uses the same raw list syntax as an inline del command.
        await page.evaluate(() => {
            const layer = window.game.hsLayer;
            layer.addRules('(999998):⊢$p→$p;.i $p');
            layer.addRules('sOther:⊢$p→$p;.i $p');
        });
        await run('del'); await run('""');
        await page.waitForFunction(() => window.game.hsLayer.cmdEngine.getCompletionContext()?.argumentCount === 1);
        await run('y'); await idle();
        assert.equal(await page.evaluate(() => window.game.hsLayer.hilbertSystem.rules.has('')), false);
        await run('del'); await run('"sOther","sPrompt"');
        await page.waitForFunction(() => window.game.hsLayer.cmdEngine.getCompletionContext()?.argumentCount === 1);
        await run('n'); await idle();
        assert.equal(await page.evaluate(() => ['sOther', 'sPrompt'].every(name => window.game.hsLayer.hilbertSystem.rules.has(name))), true);

        // Old saves may also contain invalid builtin aliases. Loading must
        // preserve those aliases so the user can rename them to a valid name.
        const legacyAliasBase = await page.evaluate(() => window.game.hsLayer.serialize());
        for (const name of ['', 'z space', 'z(mp)']) {
            await page.evaluate(async ({name, base}) => {
                const {initialCreativeRules} = await import('/js/hs/core/initial.js');
                const layer = window.game.hsLayer, data = structuredClone(base);
                data.r = data.r.replace(/^(\(\d+\))\.t:/m, (_, prefix) => prefix + name + ':');
                data.rsr = [['.t', name]];
                data.rbi = data.rbi.map(([original, alias]) => [original, original === '.t' ? name : alias]);
                layer.deserialize(data, initialCreativeRules);
                window.game.saveload.save();
            }, {name, base: legacyAliasBase});
            await open();
            assert.equal(await page.evaluate(() => window.game.hsLayer.hilbertSystem.getSysRuleName('.t')), name);
            await run(`rename ${JSON.stringify(name)} sRecoveredAlias`); await idle();
            assert.equal(await page.evaluate(() => window.game.hsLayer.hilbertSystem.getSysRuleName('.t')), 'sRecoveredAlias');
        }
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({viewport, inlineRejections: 4, promptedRetry: true, renameAtomic: true, saveReload: true, legacyMenuDelete: true, legacyPromptDelete: true, restoredAliases: 3, errors}));
        await context.close();
    }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
