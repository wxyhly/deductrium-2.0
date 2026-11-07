import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const server = createServer(async (req, res) => {
    try {
        const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = resolve(root, '.' + (name === '/' ? '/index.html' : name));
        if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless:true, channel:'chrome'});
try {
    for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        const context = await browser.newContext({viewport});
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto(`http://127.0.0.1:${server.address().port}/?creative`);
        await page.waitForSelector('#loading.hide', {state:'attached'});
        await page.locator('button[data-layer="D-layer"]').click();
        const fixture = await page.evaluate(async () => {
            const {HSParser} = await import('/js/hs/core/parser.js');
            const layer = game.hsLayer, hs = layer.hilbertSystem;
            hs.fromCmd([new HSParser().parse('.i Q', 'cmd')]);
            layer.propListView.refresh();
            layer.addRules('{ Recovery\n(99001)sRepair:⊢$p→$p;sRepair $p\n(99002)sDependent:⊢$p→$p;sRepair $p\n}');
            const folder = layer.ruleList.at(-1);
            layer.ruleListView.expandedFolders.add(folder.uuid);
            layer.ruleListView.refresh();
            window.rerecordBefore = {commands:hs.genCmd(), sheets:layer.sheetGui.sheets.length,
                old:hs.rules.get('sRepair'), valid:hs.rules.get('.i')};
            return {sheets:layer.sheetGui.sheets.length};
        });
        const row = page.locator('#ruleList .item-row[data-uuid="99001"]');
        await row.locator('.dropdown-trigger').click();
        await page.locator('.dropdown-menu.open [data-action="rerecord"]').click();
        await page.waitForSelector('#rule-rerecord:not([hidden])');
        assert.equal(await page.evaluate(() => game.hsLayer.sheetGui.sheets.length), fixture.sheets + 1);
        assert.equal(await page.evaluate(() => game.hsLayer.hilbertSystem.props.length), 0);
        // A mismatch leaves the original failed rule and every other sheet intact.
        await page.locator('#hs-cmd-input textarea').fill('a1 $p $p');
        await page.locator('#cmd-ok-btn').click();
        await page.waitForFunction(() => game.hsLayer.hilbertSystem.props.length === 1);
        await page.locator('[data-action="rerecord-finish"]').click();
        await page.waitForFunction(() => document.querySelector('#cmd-error').style.display !== 'none');
        assert.equal(await page.evaluate(() => game.hsLayer.hilbertSystem.rules.get('sRepair') === rerecordBefore.old), true);
        await page.locator('#cmd-esc-btn').click();
        const beforeReload = await page.evaluate(() => {
            const layer = game.hsLayer;
            layer.sheetGui.saveCurrentSheet();
            const value = {draft:layer.hilbertSystem.genCmd(), original:layer.hilbertSystem.genCmd(layer.sheetGui.sheets[0].ctx.props),
                name:layer.sheetGui.sheets[layer.sheetGui.activeIndex].rerecord.name};
            game.saveload.save();
            return value;
        });
        await page.reload();
        await page.waitForSelector('#loading.hide', {state:'attached'});
        await page.locator('button[data-layer="D-layer"]').click();
        await page.waitForSelector('#rule-rerecord:not([hidden])');
        assert.deepEqual(await page.evaluate(() => {
            const layer = game.hsLayer;
            return {draft:layer.hilbertSystem.genCmd(), original:layer.hilbertSystem.genCmd(layer.sheetGui.sheets[0].ctx.props),
                name:layer.sheetGui.sheets[layer.sheetGui.activeIndex].rerecord.name};
        }), beforeReload);
        await page.evaluate(() => {
            const layer = game.hsLayer;
            layer.hilbertSystem.loadContext(layer.hilbertSystem.createEmptyContext());
            layer.propListView.refresh();
            window.validBeforeRepair = layer.hilbertSystem.rules.get('.i');
        });
        await page.locator('#hs-cmd-input textarea').fill('a1 $p $p;a1 $p ($p→$p);a2 $p ($p→$p) $p;mp 3 2;mp 4 1');
        await page.locator('#cmd-ok-btn').click();
        await page.waitForFunction(() => game.hsLayer.hilbertSystem.props.length === 5);
        assert.equal(await page.locator('[data-action="rerecord-finish"]').isEnabled(), true, JSON.stringify(await page.evaluate(async () => {
            const {getCommand} = await import('/js/hs/gui/cmdmgr.js');
            const layer=game.hsLayer, target=layer.sheetGui.sheets[layer.sheetGui.activeIndex].rerecord;
            return {target, current:layer.hilbertSystem.rules.get(target.name)?.toString(), macro:!!getCommand('m')};
        })));
        await page.locator('[data-action="rerecord-finish"]').click();
        await page.waitForFunction(() => !game.hsLayer.hilbertSystem.rules.get('sRepair').error);
        const repaired = await page.evaluate(async () => {
            const {ruleProvenance} = await import('/js/hs/provenance.js');
            const layer = game.hsLayer, hs = layer.hilbertSystem;
            const walk = list => list.flatMap(n => n.children ? walk(n.children) : [n]);
            return {tags:ruleProvenance(hs, hs.rules.get('sRepair')).tags,
                dependent:!hs.rules.get('sDependent').error && ruleProvenance(hs,hs.rules.get('sDependent')).valid,
                validUnchanged:hs.rules.get('.i')===validBeforeRepair, props:hs.props.length,
                node:walk(layer.ruleList).find(n=>n.name==='sRepair').uuid,
                original:hs.genCmd(layer.sheetGui.sheets[0].ctx.props),
                drafting:!!layer.sheetGui.sheets[layer.sheetGui.activeIndex].rerecord};
        });
        assert.deepEqual(repaired, {tags:['propositional'],dependent:true,validUnchanged:true,props:5,node:99001,
            original:beforeReload.original,drafting:false});
        assert.equal(await page.locator('#rule-rerecord').isVisible(), false);
        await page.evaluate(() => game.saveload.save());
        await page.reload();
        await page.waitForSelector('#loading.hide', {state:'attached'});
        assert.equal(await page.evaluate(() => ['sRepair','sDependent'].every(n=>!game.hsLayer.hilbertSystem.rules.get(n).error)), true);
        // Cancellation retains both the old rule and the draft's proof rows.
        await page.locator('button[data-layer="D-layer"]').click();
        await page.evaluate(() => {
            const layer = game.hsLayer;
            layer.addRules('(99003)sCancel:⊢$p→$p;sCancel $p');
            layer.ruleListView.refresh();
        });
        await page.locator('#ruleList .item-row[data-uuid="99003"] .dropdown-trigger').click();
        await page.locator('.dropdown-menu.open [data-action="rerecord"]').click();
        await page.locator('#hs-cmd-input textarea').fill('a1 $p $p');
        await page.locator('#cmd-ok-btn').click();
        await page.waitForFunction(() => game.hsLayer.hilbertSystem.props.length === 1);
        await page.locator('#hs-cmd-input textarea').fill('entr .i');
        await page.locator('#hs-cmd-input textarea').press('Enter');
        await page.waitForFunction(() => game.hsLayer.navigator.active);
        assert.equal(await page.locator('#rule-rerecord').isVisible(), false);
        await page.locator('#cmd-esc-btn').click();
        await page.waitForFunction(() => !game.hsLayer.navigator.active);
        assert.equal(await page.locator('#rule-rerecord').isVisible(), true);
        await page.locator('#hs-cmd-input textarea').fill('rename sCancel sRenamed');
        await page.locator('#cmd-ok-btn').click();
        await page.waitForFunction(() => game.hsLayer.hilbertSystem.rules.has('sRenamed'));
        assert.equal(await page.locator('[data-action="rerecord-finish"]').isEnabled(), false);
        await page.locator('[data-action="rerecord-cancel"]').click();
        assert.equal(await page.evaluate(() => !!game.hsLayer.hilbertSystem.rules.get('sRenamed').error &&
            game.hsLayer.hilbertSystem.props.length===1 && !game.hsLayer.sheetGui.sheets[game.hsLayer.sheetGui.activeIndex].rerecord), true);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({viewport,mismatch:true,draftReload:true,repaired:true,dependent:true,inspection:true,stale:true,cancel:true,pageErrors:errors}));
        await context.close();
    }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
