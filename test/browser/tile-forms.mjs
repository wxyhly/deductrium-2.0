// node test/browser/tile-forms.mjs [repository root]
// Existing js/ is used unchanged. PLAYWRIGHT_MODULE selects installed Playwright;
// PLAYWRIGHT_CHANNEL defaults to real Chrome, CHROME_PATH overrides its executable.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp} from 'node:fs/promises';
import {resolve, extname, sep, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const rule = {from:'reasoning', to:'type', rate:1, feeRate:0, feeFixed:0, minimum:1, rounding:'none', precision:12};
const fixture = {format:'deductrium-world-v2', id:'forms-browser', title:'结构化表单', revision:2,
    mode:'standalone', spawn:{tileId:'start', rotation:0}, region:{hash:'3,3,3,3', edge:1, side:1},
    banks:{central:{rules:[rule]}, annex:{rules:[rule]}},
    migrations:[{from:1, to:2, remap:{old:'gate'}, reset:[]}],
    tiles:[{id:'start',hash:'',type:0,name:'start',text:'入口',data:{}},
        {id:'gate',hash:'2',type:2,name:'gate',text:'P→P',data:{p:true,keep:{nested:7},script:'message "保留"'}}]};
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', ({'.js':'text/javascript', '.mjs':'text/javascript', '.html':'text/html',
            '.css':'text/css', '.json':'application/json'})[extname(file)] || 'text/plain;charset=utf-8');
        res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
});
const section = (page, title) => page.locator('details.author-section').filter({
    has:page.locator(':scope > summary').filter({hasText:title})}).first();
const open = async locator => {
    if (!await locator.evaluate(element => element.open)) await locator.locator(':scope > summary').click();
};
const click = (locator, name) => locator.getByRole('button', {name, exact:true}).click();
// Keyboard events, native editing and blur: no DOM value assignments or synthetic input.
const type = async (locator, value) => {
    await locator.click(); await locator.press('Control+A'); await locator.press('Backspace');
    if (String(value)) await locator.pressSequentially(String(value));
};
const json = page => page.evaluate(() => mapEditor.project.toJSON());
const refresh = page => page.evaluate(() => window.dispatchEvent(new Event('map-editor-project-change')));
const closePanel = async page => { if (await page.locator('#task-panel').isVisible()) await page.locator('#close-panel').click(); };
const inspector = async page => {
    await closePanel(page);
    if (page.viewportSize().width <= 700 && await page.locator('#toggle-inspector').getAttribute('aria-expanded') !== 'true')
        await page.locator('#toggle-inspector').click();
};
const projectPanel = async page => {
    if (!await page.locator('#project-panel').isVisible()) await page.locator('#open-project').click();
    await open(page.locator('#publish-settings'));
    const advanced = page.locator('#world-settings details').filter({has:page.locator(':scope > summary').filter({hasText:'银行和版本迁移（高级）'})}).first();
    await open(advanced);
};
const collapse = async page => {
    if (page.viewportSize().width <= 700 && await page.locator('#toggle-inspector').getAttribute('aria-expanded') === 'true')
        await page.locator('#toggle-inspector').click();
};
const locate = async (page, name) => {
    await collapse(page); await type(page.locator('#location'), name);
    await page.locator('#location').press('Enter'); await inspector(page);
};
const home = async page => { await collapse(page); await page.locator('#home').click(); await inspector(page); };
const bankEdit = (box, id) => box.locator('.author-item').filter({has:box.page().getByText(id, {exact:true})}).getByRole('button', {name:'编辑', exact:true});
const importWorld = async (page, data) => {
    const previous = await page.evaluateHandle(() => mapEditor.project);
    await page.locator('#file').setInputFiles({name:'forms.world.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(data))});
    await page.waitForFunction(previous => mapEditor.project !== previous, previous); await previous.dispose();
};
const clean = async page => {
    const download = page.waitForEvent('download'); await page.locator('#export-project').click(); await download;
    assert.equal(await page.evaluate(() => mapEditor.dirty), false);
};

async function testTile(page) {
    await inspector(page); await locate(page, 'gate');
    const box = page.locator('#author-tile-form'); await open(box);
    const before = await json(page);
    await box.getByLabel('门条件', {exact:true}).selectOption('payD');
    await type(box.getByLabel('支付数量', {exact:true}), '7');
    await type(box.getByLabel('成就 ac', {exact:true}), 'draft-ac');
    assert.equal(await page.evaluate(() => mapEditor.dirty), true, 'typed structured fields register pending');
    await refresh(page);
    assert.equal(await box.getByLabel('成就 ac', {exact:true}).inputValue(), 'draft-ac');
    await home(page);
    assert.equal(await page.evaluate(() => mapEditor.selectedHash), '2', 'different tile selection rejected');
    assert.match(await box.locator('.author-status').textContent(), /尚未写入/);
    await locate(page, 'gate');
    assert.equal(await box.getByLabel('成就 ac', {exact:true}).inputValue(), 'draft-ac', 'same tile reselect is guarded');
    assert.deepEqual(await json(page), before);
    await page.locator('#apply-tile').click();
    assert.deepEqual(await json(page), before, 'Apply cannot silently omit an unwritten draft');
    await click(box, '写入表单');
    assert.equal(JSON.parse(await page.locator('#tile-data').inputValue()).payD, 7);
    assert.deepEqual(await json(page), before, 'write stages only the existing textarea');
    await page.locator('#apply-tile').click();
    const applied = await page.evaluate(() => mapEditor.selected.data);
    assert.equal(applied.payD, 7); assert.equal(applied.ac, 'draft-ac');
    assert.deepEqual(applied.keep, {nested:7}); assert.equal(applied.script, 'message "保留"');
    await clean(page);
    await type(box.getByLabel('成就 ac', {exact:true}), 'discard-ac');
    await click(box, '还原这些字段');
    assert.equal(await box.getByLabel('成就 ac', {exact:true}).inputValue(), 'draft-ac');
    assert.equal(await page.evaluate(() => mapEditor.dirty), false, 'revert clears pending without dirtying raw form');
    await type(box.getByLabel('支付数量', {exact:true}), '-1');
    await click(box, '写入表单'); await home(page);
    assert.equal(await page.evaluate(() => mapEditor.selectedHash), '2', 'failed write retains guard');
    await click(box, '清除这些字段');
    assert.equal(JSON.parse(await page.locator('#tile-data').inputValue()).payD, undefined);
    await page.locator('#apply-tile').click();
    await home(page);
    assert.equal(await page.evaluate(() => mapEditor.selectedHash), '', 'successful clear releases selection guard');
    await clean(page);
}

async function testBanks(page) {
    await projectPanel(page);
    const box = section(page, '结构化银行'); await open(box);
    await bankEdit(box, 'central').click();
    await type(box.getByLabel('银行 ID', {exact:true}), 'central-new');
    await type(box.getByLabel('汇率 rate', {exact:true}), '3.5');
    await refresh(page);
    assert.equal(await box.getByLabel('银行 ID', {exact:true}).inputValue(), 'central-new');
    assert.equal(await box.getByLabel('汇率 rate', {exact:true}).inputValue(), '3.5');
    await bankEdit(box, 'annex').click();
    assert.equal(await box.getByLabel('银行 ID', {exact:true}).inputValue(), 'central-new', 'bank entity change rejected');
    assert.match(await box.locator('.author-status').textContent(), /先写入银行表或还原银行表/);
    const before = await json(page);
    await page.locator('#world-apply').click(); assert.deepEqual(await json(page), before);
    await click(box, '写入此银行');
    const written = JSON.parse(await page.locator('#world-banks').inputValue());
    assert.equal(written['central-new'].rules[0].rate, 3.5); assert.equal(written.central, undefined);
    await page.locator('#world-apply').click();
    assert.equal((await json(page)).world.banks['central-new'].rules[0].rate, 3.5);
    await clean(page);
    await bankEdit(box, 'annex').click(); await click(box, '添加方向');
    assert.equal(await page.evaluate(() => mapEditor.dirty), true);
    await refresh(page); assert.equal(await box.getByLabel('汇率 rate', {exact:true}).count(), 2);
    await click(box, '还原银行表'); assert.equal(await page.evaluate(() => mapEditor.dirty), false);
    await bankEdit(box, 'annex').click(); await click(box, '删除方向');
    await click(box, '写入此银行'); assert.match(await box.locator('.author-status').textContent(), /至少需要/);
    assert.equal(await page.evaluate(() => mapEditor.dirty), true);
    await click(box, '还原银行表');
    await click(box, '添加银行');
    await type(box.getByLabel('银行 ID', {exact:true}), 'new-bank');
    await click(box, '添加方向');
    await refresh(page); assert.equal(await box.getByLabel('银行 ID', {exact:true}).inputValue(), 'new-bank');
    await click(box, '写入银行表'); await page.locator('#world-apply').click();
    assert.equal((await json(page)).world.banks['new-bank'].rules.length, 1);
    await clean(page);
    await bankEdit(box, 'new-bank').click(); await click(box, '删除此银行');
    assert.equal(JSON.parse(await page.locator('#world-banks').inputValue())['new-bank'].rules.length, 1, 'delete remains unwritten');
    await refresh(page); assert.equal(await bankEdit(box, 'new-bank').count(), 0);
    await click(box, '还原银行表'); assert.equal(await bankEdit(box, 'new-bank').count(), 1);
    assert.equal(await page.evaluate(() => mapEditor.dirty), false);
    await bankEdit(box, 'new-bank').click(); await click(box, '删除此银行');
    await click(box, '写入银行表'); await page.locator('#world-apply').click();
    assert.equal((await json(page)).world.banks['new-bank'], undefined);
    await clean(page);
}

async function testMigrations(page) {
    const box = section(page, '结构化迁移'); await open(box);
    await type(box.getByLabel('旧砖块 ID', {exact:true}), 'older');
    await type(box.getByLabel('新砖块 ID', {exact:true}), 'start');
    await type(box.getByLabel('reset（逗号分隔的砖块 ID）', {exact:true}), 'gate');
    await refresh(page);
    assert.equal(await box.getByLabel('旧砖块 ID', {exact:true}).inputValue(), 'older');
    const before = await json(page);
    await page.locator('#world-apply').click(); assert.deepEqual(await json(page), before);
    await click(box, '添加迁移');
    assert.equal(await box.getByLabel('旧砖块 ID', {exact:true}).inputValue(), 'older', 'adding row preserves typed mapping');
    assert.equal(await box.getByLabel('reset（逗号分隔的砖块 ID）', {exact:true}).first().inputValue(), 'gate');
    await box.getByRole('button', {name:'删除此条', exact:true}).last().click();
    await click(box, '添加 remap');
    await type(box.getByLabel('旧砖块 ID', {exact:true}).last(), 'another');
    await type(box.getByLabel('新砖块 ID', {exact:true}).last(), 'gate');
    await box.getByRole('button', {name:'移除', exact:true}).last().click();
    await click(box, '写入此条');
    assert.deepEqual(JSON.parse(await page.locator('#world-migrations').inputValue()), [{from:1,to:2,remap:{older:'start'},reset:['gate']}]);
    await page.locator('#world-apply').click();
    assert.deepEqual((await json(page)).world.migrations, [{from:1,to:2,remap:{older:'start'},reset:['gate']}]);
    await clean(page);
    await type(box.getByLabel('from', {exact:true}), '2');
    await click(box, '写入迁移表'); assert.match(await box.locator('.author-status').textContent(), /from < to/);
    assert.equal(await page.evaluate(() => mapEditor.dirty), true);
    await click(box, '还原迁移表'); assert.equal(await box.getByLabel('from', {exact:true}).inputValue(), '1');
    await click(box, '删除此条'); await refresh(page);
    assert.equal(await box.locator('.author-form').count(), 0);
    assert.equal(JSON.parse(await page.locator('#world-migrations').inputValue()).length, 1);
    await click(box, '还原迁移表'); assert.equal(await box.locator('.author-form').count(), 1);
    assert.equal(await page.evaluate(() => mapEditor.dirty), false);
    await click(box, '删除此条'); await click(box, '写入迁移表'); await page.locator('#world-apply').click();
    assert.deepEqual((await json(page)).world.migrations, []);
    await clean(page);
    await click(box, '添加迁移'); assert.equal(await page.evaluate(() => mapEditor.dirty), true);
    await click(box, '还原迁移表'); assert.equal(await page.evaluate(() => mapEditor.dirty), false);
}

async function testProjectReplacement(page, dialogs) {
    await inspector(page); const tile = page.locator('#author-tile-form'); await open(tile);
    await type(tile.getByLabel('成就 ac', {exact:true}), 'old-project-ac');
    await projectPanel(page);
    const banks = section(page, '结构化银行'), migrations = section(page, '结构化迁移');
    await open(banks); await bankEdit(banks, 'annex').click();
    await type(banks.getByLabel('银行 ID', {exact:true}), 'discarded-bank');
    await open(migrations); await click(migrations, '添加迁移');
    await type(migrations.getByLabel('reset（逗号分隔的砖块 ID）', {exact:true}), 'old-project-reset');
    const next = structuredClone(fixture);
    // Same ID, different object: reset must follow project identity, never name/focus.
    next.banks = {fresh:{rules:[{...rule,rate:9}]}}; next.migrations = [];
    next.tiles[0].data = {ac:'fresh-ac'};
    const count = dialogs.length;
    await importWorld(page, next);
    assert.equal(await page.evaluate(() => mapEditor.dirty), false, 'project replacement clears pending');
    assert.ok(dialogs.length > count && /切换项目/.test(dialogs.at(-1)), 'pending drafts participate in discardAll');
    assert.equal(await banks.getByLabel('银行 ID', {exact:true}).count(), 0, 'focused old editor removed on replacement');
    assert.equal(await bankEdit(banks, 'fresh').count(), 1);
    assert.equal(await migrations.locator('.author-form').count(), 0);
    await bankEdit(banks, 'fresh').click(); assert.equal(await banks.getByLabel('汇率 rate', {exact:true}).inputValue(), '9');
    assert.equal(await page.evaluate(() => mapEditor.dirty), false, 'opening a bank is read only');
    await inspector(page);
    assert.equal(await tile.getByLabel('成就 ac', {exact:true}).inputValue(), 'fresh-ac');
    await home(page); assert.equal(await page.evaluate(() => mapEditor.selectedHash), '');
    assert.equal(await page.evaluate(() => mapEditor.dirty), false);
}

let browser;
const screenshots = await mkdtemp(join(tmpdir(), 'deductrium-tile-forms-'));
try {
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const {chromium} = await import(process.env.PLAYWRIGHT_MODULE
        ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
    browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH
        ? {executablePath:process.env.CHROME_PATH} : {channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'})});
    for (const viewport of [{width:1440,height:1000}, {width:390,height:844}]) {
        const context = await browser.newContext({viewport,acceptDownloads:true});
        const page = await context.newPage(), errors = [], dialogs = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
        page.setDefaultTimeout(12000);
        try {
            await page.goto(`http://127.0.0.1:${server.address().port}/tools/map-editor/index.html`);
            await page.waitForSelector('#author-tile-form', {state:'attached'});
            await importWorld(page, fixture); await closePanel(page); await clean(page);
            await testTile(page); await testBanks(page); await testMigrations(page);
            await testProjectReplacement(page, dialogs);
            assert.deepEqual(errors, []);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({path:join(screenshots, `tile-forms-${viewport.width}.png`)});
            console.log(JSON.stringify({viewport, browser:await browser.version(),
                checks:'keyboard typing / refresh / same+different tile rejection / bank switch rejection / pending guards / validation / write+clear+revert / add+delete / Apply / same-ID project replacement', screenshots}));
        } catch (error) {
            await page.screenshot({path:join(screenshots, `failure-${viewport.width}.png`)}).catch(() => {});
            console.error(JSON.stringify({viewport, errors, screenshots, status:await page.locator('#status').textContent().catch(() => ''),
                banks:await section(page, '结构化银行').innerHTML().catch(() => ''),
                statuses:await page.locator('.author-status, #world-settings-status, #apply-state').allTextContents()}));
            throw error;
        } finally { await context.close(); }
    }
} finally {
    await browser?.close();
    if (server.listening) await new Promise(done => server.close(done));
}
