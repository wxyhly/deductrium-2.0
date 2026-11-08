// Run: node test/browser/proof-provenance.mjs [repository root]
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
        if (!file.startsWith(root + sep)) {res.writeHead(403).end();return;}
        res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch {res.writeHead(404).end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless:true, channel:'chrome'});
const extensionality = String.raw`var x;var y;cond x⊂y;cond y⊂x;aext;<a4 5 x;<a4 6 y;<:l(d\c) 3 z;<:l(d\c) 4 z;var z;<a4 8 z;<a4 9 z;.<> 11 12;cd 4;mp 7 13`;
const nested = String.raw`cond $x⊂$y∧$y⊂$x;./\1 1;./\2 1;saext2;.\acn 4 #x;v.\acn 5 #y;<a4 6 $x;<a4 7 $y;mp 8 2;mp 9 3`;
try {
    for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        const context = await browser.newContext({viewport});
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/?creative`);
        await page.waitForSelector('#loading.hide', {state:'attached'});
        await page.locator('button[data-layer="D-layer"]').click();
        const run = async text => {
            await page.locator('#hs-cmd-input textarea').fill(text);
            await page.locator('#cmd-ok-btn').click();
            await page.waitForFunction(() => !game.hsLayer.cmdEngine.isExecuting());
            assert.equal(await page.locator('#cmd-error').isVisible(), false,
                `${text}: ${await page.locator('#cmd-error').textContent()}`);
        };
        const value = name => page.evaluate(async name => {
            const {ruleProvenance} = await import('/js/hs/provenance.js');
            const hs = game.hsLayer.hilbertSystem;
            return ruleProvenance(hs, hs.rules.get(name));
        }, name);
        const row = name => page.locator('#ruleRows .item-row').filter({
            has:page.locator('.name-text', {hasText:new RegExp('^' + name + '$')}),
        });
        await run(String.raw`hyp $1↔$2;<.<>1 1;m l;` + extensionality + ';m saext2');
        assert.equal((await value('saext2')).valid, true);
        const recorded = [];
        for (let round = 0; round < 3; round++) {
            await run(nested);
            const conclusion = await page.evaluate(async () => {
                const {stepProvenance} = await import('/js/hs/provenance.js');
                const hs = game.hsLayer.hilbertSystem;
                return stepProvenance(hs, hs.getLastChildP(null));
            });
            assert.equal(conclusion.valid, true, conclusion.error);
            await run(`m sNested${round}`);
            const result = await value(`sNested${round}`);
            assert.deepEqual(result, conclusion, 'recording preserves the actual sources immediately');
            assert.deepEqual(result.tags, ['propositional','classical','first-order','zfc']);
            const labels = row(`sNested${round}`).locator('.proof-tags');
            assert.equal(await labels.getAttribute('data-provenance-valid'), 'true');
            assert.equal(await labels.locator('[data-proof-tag="unknown"]').count(), 0);
            for (const badge of await labels.locator('.proof-tag').all()) {
                assert.match(await badge.getAttribute('title'), /aext \[zfc\]/,
                    'each directly hovered badge carries its source explanation');
            }
            recorded.push(result);
        }
        await run('sNested0 $x $y');
        assert.equal(await page.evaluate(() => game.hsLayer.hilbertSystem.props.length), 1,
            'the recorded macro remains usable');
        // A real existential substitution previously referenced a missing helper
        // while its kernel result and named substitution template were valid.
        await run('clear;mcpt z=z→(z∈y↔z∈x∧¬z=z)↔¬z∈y;a7 z;mp 1 2;m s0;asep x y z ¬z=z;<a4 1 x;msbt>(s0) 2 0');
        const substitution = await page.evaluate(async () => {
            const {stepProvenance} = await import('/js/hs/provenance.js');
            const hs = game.hsLayer.hilbertSystem;
            return stepProvenance(hs, hs.getLastChildP(null));
        });
        assert.equal(substitution.valid, true, substitution.error);
        assert.deepEqual(substitution.tags, ['propositional','classical','first-order','zfc']);
        assert.equal(await page.locator('#propRows [data-proof-tag="unknown"]').count(), 0);
        await run('m sExistentialSubstitution');
        assert.deepEqual(await value('sExistentialSubstitution'), substitution);
        const snapshot = await page.evaluate(() => {
            const hs = game.hsLayer.hilbertSystem;
            game.saveload.save();
            return hs.genCmd();
        });
        await page.reload();
        await page.waitForSelector('#loading.hide', {state:'attached'});
        for (let round = 0; round < 3; round++) {
            assert.deepEqual(await value(`sNested${round}`), recorded[round],
                'saved and immediate proof sources agree');
        }
        assert.deepEqual(await value('sExistentialSubstitution'), substitution);
        assert.deepEqual(await page.evaluate(() => game.hsLayer.hilbertSystem.genCmd()), snapshot);
        await page.locator('button[data-layer="D-layer"]').click();
        // A genuinely unverifiable proof keeps a directly accessible reason.
        await page.evaluate(() => game.hsLayer.addRules('(99101)sUnverified:⊢$p→$p;sUnverified $p'));
        const unknown = row('sUnverified').locator('[data-proof-tag="unknown"]');
        await unknown.scrollIntoViewIfNeeded();
        await unknown.hover();
        assert.ok((await unknown.getAttribute('title'))?.length, 'the error belongs to the badge itself');
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({viewport,repeatedRecording:3,reloaded:true,directTooltip:true,pageErrors:errors}));
        await context.close();
    }
} finally {await browser.close();await new Promise(resolve => server.close(resolve));}
