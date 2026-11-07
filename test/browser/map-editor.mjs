import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp} from 'node:fs/promises';
import {resolve, extname, sep, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', ({'.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json'})[extname(file)] || 'text/plain;charset=utf-8');
        res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
const screenshots = await mkdtemp(join(tmpdir(), 'deductrium-full-map-editor-'));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = origin + '/tools/map-editor/index.html';
const snapshot = page => page.evaluate(() => JSON.stringify(mapEditor.project.toJSON()));
const waitReady = async page => {
    await page.waitForFunction(() => window.mapEditor || !document.getElementById('fatal').hidden);
    assert.equal(await page.locator('#fatal').isVisible(), false, await page.locator('#fatal').textContent());
};
const disclose = async (page, id) => {
    if (!await page.locator(id).evaluate(element => element.open)) await page.locator(id + ' > summary').click();
};
const openPanel = async (page, name) => {
    if (!await page.locator('#' + name + '-panel').isVisible()) await page.locator('#open-' + name).click();
};
const closePanel = async page => {
    if (await page.locator('#task-panel').isVisible()) await page.locator('#close-panel').click();
};
const openInspector = async page => {
    await closePanel(page);
    if (await page.locator('#toggle-inspector').isVisible() && await page.locator('#toggle-inspector').getAttribute('aria-expanded') !== 'true') await page.locator('#toggle-inspector').click();
};
const canvasReady = async page => {
    await closePanel(page);
    if (await page.locator('#toggle-inspector').isVisible() && await page.locator('#toggle-inspector').getAttribute('aria-expanded') === 'true') await page.locator('#toggle-inspector').click();
};
const fileAction = async (page, id) => {
    await disclose(page, '#file-menu'); await page.locator(id).click();
};
const save = async (page, id) => {
    if (['#export-source', '#recover-draft'].includes(id)) await disclose(page, '#file-menu');
    const event = page.waitForEvent('download'); await page.locator(id).click();
    return readFile(await (await event).path(), 'utf8');
};
const upload = (page, name, text) => page.locator('#file').setInputFiles({name, mimeType: name.endsWith('.json') ? 'application/json' : 'text/plain', buffer: Buffer.from(text)});
const applyTile = async (page, {type, name, text, script = '', data = '{}'}) => {
    await openInspector(page);
    await page.locator('#tile-type').selectOption(String(type));
    await page.locator('#tile-name').fill(name);
    await page.locator('#text-mode').selectOption('languages');
    await page.locator('#text-zh').fill(text);
    await page.locator('#text-en').fill('English ' + name);
    await disclose(page, '#script-section');
    await disclose(page, '#data-section');
    await page.locator('#tile-script').fill(script);
    await page.locator('#tile-data').fill(data);
    await page.locator('#apply-tile').click();
    await page.waitForFunction(expected => mapEditor.selected?.name === expected && document.getElementById('pending').hidden, name);
};

try {
    browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
    for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
        const context = await browser.newContext({viewport, acceptDownloads: true, colorScheme: 'light'});
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let acceptDialogs = true;
        page.on('dialog', dialog => acceptDialogs ? dialog.accept() : dialog.dismiss());
        await page.goto(url); await waitReady(page);
        assert.ok(await page.evaluate(() => mapEditor.project.tiles.size) > 100, 'official map loaded');
        assert.ok(await page.locator('.tile-row').count() > 0);
        assert.equal(await page.locator('#task-panel').isVisible(), false, 'task panels start collapsed');
        for (const id of ['#map-language', '#project-id', '#module-library', '#tile-script', '#tile-data', '#export-world', '#play-world']) {
            assert.equal(await page.locator(id).isVisible(), false, `${id} progressively disclosed`);
        }
        assert.equal(await page.locator('#world-settings').count(), 1, 'world settings integration container');
        const initialCanvas = await page.locator('#map').boundingBox();
        assert.ok(initialCanvas.height > viewport.height * .5, 'canvas owns the initial screen');
        if (viewport.width < 700) assert.ok(initialCanvas.y < (await page.locator('#inspector').boundingBox()).y, 'mobile canvas precedes property drawer');
        assert.equal(await page.evaluate(async () => {
            const {LocalDraw} = await import('/js/hy/localdraw.js');
            const {tileTextColor, tileDisplayText} = await import('/js/hy/appearance.js');
            const w = mapEditor.world;
            return w.localDraw.drawPlayer === LocalDraw.prototype.drawPlayer && w.localDraw.textTo === LocalDraw.prototype.textTo &&
                w.localDraw.drawPolygon === LocalDraw.prototype.drawPolygon && w.onTextColor === tileTextColor && w.onTileText === tileDisplayText;
        }), true, 'native player, fonts, polygons and shared appearance callbacks');
        await page.locator('#map').scrollIntoViewIfNeeded();
        await page.screenshot({path: join(screenshots, `official-${viewport.width}.png`)});

        await openPanel(page, 'tiles');
        await openPanel(page, 'modules');
        assert.equal(await page.locator('#tiles-panel').isVisible(), false, 'task panels are exclusive');
        assert.equal(await page.locator('#module-library').isVisible(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#task-panel').isVisible(), false);
        await page.locator('#dismiss-note').click();

        await fileAction(page, '#new-project');
        assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 0);
        const emptyState = await snapshot(page);
        await openInspector(page);
        await page.locator('#tile-name').fill('not-applied');
        assert.equal(await snapshot(page), emptyState, 'typing is not Apply');
        await openPanel(page, 'project'); await closePanel(page);
        assert.equal(await page.locator('#tile-name').inputValue(), 'not-applied', 'panel disclosure retains pending fields');
        if (viewport.width < 700) {
            await page.locator('#toggle-inspector').click();
            assert.equal(await page.locator('#pending').isVisible(), true, 'collapsed drawer retains pending marker');
            await openInspector(page);
        }
        acceptDialogs = false;
        await page.locator('#neighbors button[data-edge="0"]').click();
        assert.equal(await page.evaluate(() => mapEditor.selectedHash), '', 'cancelled navigation protects pending form');
        assert.equal(await page.locator('#tile-name').inputValue(), 'not-applied');
        acceptDialogs = true;
        const blockedSave = await snapshot(page);
        await page.locator('#export-project').click();
        assert.equal(await snapshot(page), blockedSave, 'save does not silently apply fields');
        assert.match(await page.locator('#status').textContent(), /先 Apply/);
        await page.locator('#reset-form').click();

        // External settings share navigation/save protection, with an explicit Apply escape hatch.
        await page.evaluate(() => {
            window.testPending = true;
            window.unregisterTestPending = mapEditor.registerPendingGuard(() => window.testPending);
        });
        await page.locator('#export-project').click();
        assert.match(await page.locator('#status').textContent(), /请先应用世界设置/);
        assert.equal(await page.locator('#project-panel').isVisible(), true);
        acceptDialogs = false;
        await Promise.all([page.waitForEvent('dialog'), fileAction(page, '#official-map')]);
        assert.equal(await snapshot(page), emptyState, 'external pending cancellation keeps project');
        acceptDialogs = true;
        const externalApply = await page.evaluate(() => {
            let blocked = false;
            try { mapEditor.applyProject(() => {}); } catch { blocked = true; }
            let applied = false;
            mapEditor.applyProject(() => { applied = true; }, 'external Apply', {allowExternalPending: true});
            window.testPending = false; window.unregisterTestPending();
            return {blocked, applied};
        });
        assert.deepEqual(externalApply, {blocked: true, applied: true});
        await openInspector(page);
        await page.locator('#tile-name').fill('pending-fields');
        assert.equal(await page.evaluate(() => {
            try { mapEditor.applyProject(() => {}, 'external Apply', {allowExternalPending: true}); return false; }
            catch { return true; }
        }), true, 'external Apply never bypasses tile pending guard');
        await page.locator('#reset-form').click();

        // Property tools operate on the draft and preserve the project's save state.
        await save(page, '#export-project');
        const propertiesState = await snapshot(page);
        const storedProperties = await page.evaluate(() => localStorage.getItem(mapEditor.storageKey));
        await disclose(page, '#script-section');
        await page.locator('#script-check').click();
        assert.equal(await page.evaluate(() => mapEditor.dirty), false, 'checking a clean script stays clean');
        assert.equal(await snapshot(page), propertiesState);
        assert.equal(await page.locator('#script-help').isVisible(), false);
        await page.locator('#script-help-toggle').click();
        assert.equal(await page.locator('#script-help-toggle').getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('#pending').isVisible(), false, 'help disclosure does not edit the form');
        const catalogue = await page.evaluate(async () => {
            const {SCRIPT_GROUPS, supportedScriptGroups} = await import('/tools/map-editor/script-help.mjs');
            const {parseMapScript} = await import('/js/hy/script.js');
            const all = SCRIPT_GROUPS.flatMap(group => group.entries);
            const advertised = supportedScriptGroups(parseMapScript).flatMap(group => group.entries);
            const ids = [...document.querySelectorAll('#script-insert option[value]')].map(option => option.value).filter(Boolean);
            const only = all.find(item => item.id === 'require-rule-name');
            const filtered = supportedScriptGroups(source => {
                if (source !== only.template) throw new Error('Unsupported syntax');
            });
            return {
                allIds: all.map(item => item.id), ids,
                advertisedIds: advertised.map(item => item.id),
                advertisedTemplates: advertised.map(item => { parseMapScript(item.template); return item.template; }),
                helpTemplates: [...document.querySelectorAll('#script-help dt code')].map(code => code.textContent),
                placeholdersValid: all.every(item => !item.select || item.template.includes(item.select)),
                filteredIds: filtered.flatMap(group => group.entries).map(item => item.id),
                filteredGroups: filtered.length,
                rejectedGroups: supportedScriptGroups(() => { throw new Error('Unsupported syntax'); }).length
            };
        });
        assert.deepEqual(catalogue.ids, catalogue.advertisedIds, 'insertion menu exposes exactly the templates accepted by the running parser');
        assert.deepEqual(catalogue.helpTemplates, catalogue.advertisedTemplates, 'reference and insertion menu share the same validated templates');
        assert.equal(new Set(catalogue.allIds).size, catalogue.allIds.length, 'catalogue IDs are unique');
        assert.equal(catalogue.placeholdersValid, true, 'every insertion placeholder exists in its template');
        assert.deepEqual(catalogue.filteredIds, ['require-rule-name'], 'unsupported templates are filtered independently');
        assert.equal(catalogue.filteredGroups, 1, 'empty command groups are hidden');
        assert.equal(catalogue.rejectedGroups, 0, 'a parser rejecting all templates exposes no groups');
        for (const id of [
            'require-proof', 'require-rule', 'require-type', 'require-rule-name', 'require-rule-present', 'require-type-present',
            'unlock-achievement', 'unlock-info', 'unlock-rule', 'unlock-type', 'add-axiom', 'remove-axiom', 'disable-type', 'enable-type',
            'require-metric-steps', 'require-metric-demolished', 'require-metric-spent', 'require-metric-ordinal-base',
            'number-require-money', 'number-require-currency', 'number-require-count', 'number-require-metric',
            'number-give-money', 'number-give-currency', 'number-take-currency', 'number-set-count', 'number-add-count', 'number-min', 'number-max', 'number-exchange',
            'require-ordinal-current', 'require-ordinal-max', 'require-ordinal-next', 'set-ordinal-current', 'set-ordinal-max',
            'set-ordinal-base', 'raise-ordinal', 'generate-ordinal', 'recompute-ordinal',
            'event-once', 'event-repeat', 'reward-consume', 'reward-keep', 'allow', 'block', 'confirm', 'remember-proof', 'remember-rule', 'remember-type',
            'clear-reward', 'reset-reward', 'demolish-gate', 'set-language-zh', 'set-language-en', 'if-engine', 'if-number-ordinal', 'example-repeat-reward', 'example-min-max', 'example-attempt'
        ]) assert.ok(catalogue.allIds.includes(id), `catalogue covers ${id}`);
        assert.equal(await snapshot(page), propertiesState, 'catalogue validation and help leave the project untouched');
        assert.equal(await page.evaluate(() => mapEditor.dirty), false, 'catalogue browsing keeps clean save state');
        await page.locator('#script-help-toggle').click();
        await page.locator('#tile-script').fill('message "before"\nmessage "after"');
        await page.locator('#tile-script').evaluate(field => {
            const offset = field.value.indexOf('\n') + 1; field.focus(); field.setSelectionRange(offset, offset);
        });
        await page.locator('#script-insert').selectOption('give-key');
        assert.equal(await page.locator('#tile-script').inputValue(), 'message "before"\ngive key red\nmessage "after"', 'insertion respects caret and line boundaries');
        assert.equal(await page.locator('#tile-script').evaluate(field => field.value.slice(field.selectionStart, field.selectionEnd)), 'red', 'placeholder selected');
        assert.equal(await page.locator('#script-insert').inputValue(), '');
        assert.equal(await page.locator('#pending').isVisible(), true);
        assert.equal(await page.locator('#script-section').getAttribute('data-dirty'), 'true');
        assert.equal(await page.locator('#data-section').getAttribute('data-dirty'), null, 'only edited section marked');
        await page.locator('#script-check').click();
        assert.equal(await page.locator('#pending').isVisible(), true, 'checking never clears draft dirty');
        assert.equal(await snapshot(page), propertiesState, 'checking never mutates project');
        assert.equal(await page.evaluate(() => localStorage.getItem(mapEditor.storageKey)), storedProperties, 'checking does not persist draft fields');
        assert.match(await page.locator('#script-summary').textContent(), /3 条命令.*✓/);
        assert.equal(await page.locator('#script-gutter span').count(), 3);
        await page.locator('#tile-script').focus();
        await page.keyboard.press('Control+z');
        assert.equal(await page.locator('#tile-script').inputValue(), 'message "before"\nmessage "after"', 'native undo reverses template insertion');
        await page.locator('#reset-form').click();
        assert.equal(await page.locator('#script-section').getAttribute('data-dirty'), null);

        await page.locator('#tile-script').fill(Array.from({length: 24}, (_, i) => `message "line ${i + 1}"`).join('\n'));
        await page.locator('#tile-script').evaluate(field => { field.scrollTop = field.scrollHeight; field.dispatchEvent(new Event('scroll')); });
        assert.equal(await page.locator('#script-gutter span').count(), 24);
        assert.equal(await page.evaluate(() => document.getElementById('script-gutter').scrollTop === document.getElementById('tile-script').scrollTop), true, 'gutter follows scrolling');
        await page.locator('#reset-form').click();
        const propertiesLayout = await page.evaluate(() => {
            const inspector = document.getElementById('inspector-content'), bounds = inspector.getBoundingClientRect();
            return {fits: inspector.scrollWidth <= inspector.clientWidth,
                neighbors: [...document.querySelectorAll('#neighbors button[data-edge]')].every(button => {
                    const box = button.getBoundingClientRect();
                    return box.left >= bounds.left && box.right <= bounds.right && button.hasAttribute('aria-label') && button.dataset.kind === 'empty';
                })};
        });
        assert.deepEqual(propertiesLayout, {fits: true, neighbors: true}, 'compact identity and all six neighbors fit inspector');
        await page.screenshot({path: join(screenshots, `properties-${viewport.width}.png`)});

        // Applying another property must preserve sparse locales, fallback order,
        // nested source text and existing actions the property UI does not know.
        const nestedScript = '// preserve source\nif (key red or flag ready) and not reward prize\n  if currency type >= 2\n    message "中文; // literal"\n  else\n    set flag waiting\n  end\nelif not axiom a3\n  unlock info hint\nelse\n  message "fallback"\nend\n';
        for (const {text, script} of [
            {text: {ja: '日本語のみ'}, script: nestedScript},
            {text: {en: 'English fallback', ja: '日本語'}, script: nestedScript},
            {text: {zh: '', ja: '日本語'}, script: nestedScript},
            {text: {fr: 'Français', zh: '中文\r\n第二行', en: 'English\r\nsecond line'}, script: nestedScript.replaceAll('\n', '\r\n')},
            {text: '通用文字\r\n第二行', script: ''},
            {text: {ja: '日本語のみ'}, script: ' \r\n\t'}
        ]) {
            const data = {script, scriptRepeat: true,
                info: {zh: '说明', en: 'Info', ja: '情報'}, actions: [{kind: 'unknown-existing-action', args: [1, {keep: [true, null]}]}],
                unknown: {nested: {preserve: 'value'}}};
            await page.evaluate(({text, data}) => mapEditor.applyProject(project => project.put('', {type: 3, name: 'roundtrip', text, data}), 'roundtrip fixture'), {text, data});
            const before = await snapshot(page);
            await page.locator('#script-check').click();
            assert.equal(await snapshot(page), before, 'nested Check does not apply anything');
            assert.equal(await page.locator('#pending').isVisible(), false);
            await page.locator('#apply-tile').click();
            assert.deepEqual(await page.evaluate(() => mapEditor.selected.text), text, 'unchanged Apply preserves sparse locales and text');
            assert.deepEqual(await page.evaluate(() => Object.keys(mapEditor.selected.text)), Object.keys(text), 'unchanged Apply preserves locale fallback order');
            assert.deepEqual(await page.evaluate(() => mapEditor.selected.data), data, 'unchanged Apply preserves nested script and unknown actions');
        }
        await page.locator('#text-zh').fill('新增中文');
        await page.locator('#apply-tile').click();
        assert.deepEqual(await page.evaluate(() => mapEditor.selected.text), {ja: '日本語のみ', zh: '新增中文'}, 'editing an absent locale adds that locale only');
        await page.locator('#text-zh').fill('');
        await page.locator('#apply-tile').click();
        assert.deepEqual(await page.evaluate(() => mapEditor.selected.text), {ja: '日本語のみ', zh: ''}, 'clearing an existing locale preserves its explicit empty value');
        const nestedState = await snapshot(page);
        await page.locator('#script-check').click();
        await page.locator('#tile-name').fill('unapplied-nested-edit');
        await page.locator('#tile-script').fill(nestedScript.trimEnd().replace(/\nend$/, ''));
        await page.locator('#apply-tile').click({delay: 400});
        assert.equal(await snapshot(page), nestedState, 'unclosed nested branch never partially applies other fields');
        assert.equal(await page.locator('#pending').isVisible(), true);
        assert.equal(await page.locator('#tile-name').inputValue(), 'unapplied-nested-edit');
        assert.equal(await page.locator('#status').getAttribute('data-error'), 'true', 'invalid nested Apply announces an error on the first click');
        await page.locator('#reset-form').click();

        await applyTile(page, {type: 3, name: 'reward', text: '奖励提示\n第二行', script: 'disable axiom a3\ngive key red', data: '{"getD":3,"scriptRepeat":true,"custom":{"keep":true}}'});
        const rewardState = await snapshot(page);
        assert.equal(await page.evaluate(() => mapEditor.selected.data.script), 'disable axiom a3\ngive key red');
        assert.equal(await page.evaluate(() => mapEditor.selected.data.scriptRepeat), true);
        await page.locator('#tile-data').fill('{\n  "broken": }');
        await page.locator('#apply-tile').click();
        assert.equal(await snapshot(page), rewardState, 'invalid JSON has no partial commit');
        assert.equal(await page.locator('#tile-data').getAttribute('aria-invalid'), 'true');
        assert.match(await page.locator('#data-error').textContent(), /第 2 行，第 \d+ 列/);
        assert.equal(await page.locator('#tile-data').evaluate(field => field === document.activeElement), true, 'invalid JSON focuses its field');
        assert.equal(await page.locator('#data-section').getAttribute('data-dirty'), 'true');
        await page.locator('#reset-form').click();
        assert.equal(await page.locator('#data-error').isVisible(), false);
        assert.equal(await page.locator('#tile-data').getAttribute('aria-invalid'), null);
        await page.locator('#tile-script').fill('give key red\ninvalid <img src=x onerror=alert(1)>\nmessage "after"');
        await page.locator('#script-section > summary').click();
        await page.locator('#apply-tile').click();
        assert.equal(await snapshot(page), rewardState, 'invalid DSL has no partial commit');
        assert.equal(await page.locator('#status').getAttribute('data-error'), 'true');
        assert.equal(await page.locator('#script-section').evaluate(element => element.open), true, 'invalid Apply opens script');
        assert.equal(await page.locator('#tile-script').getAttribute('aria-invalid'), 'true');
        assert.match(await page.locator('#script-error').textContent(), /第 2 行：invalid <img/);
        assert.equal(await page.locator('#script-error img').count(), 0, 'untrusted error source is text');
        assert.equal(await page.locator('#script-gutter .err').textContent(), '2');
        const errorSelection = () => page.locator('#tile-script').evaluate(field => ({focused: field === document.activeElement, selected: field.value.slice(field.selectionStart, field.selectionEnd)}));
        assert.deepEqual(await errorSelection(), {focused: true, selected: 'invalid <img src=x onerror=alert(1)>'});
        await page.locator('#script-goto').click();
        assert.deepEqual(await errorSelection(), {focused: true, selected: 'invalid <img src=x onerror=alert(1)>'});
        assert.match(await page.locator('#apply-state').textContent(), /脚本第 2 行有错误/);
        assert.equal(await page.locator('#pending').isVisible(), true, 'invalid Apply retains dirty');
        await page.screenshot({path: join(screenshots, `properties-error-${viewport.width}.png`)});
        await page.locator('#tile-script').fill('give key red');
        await page.waitForFunction(() => !document.getElementById('tile-script').hasAttribute('aria-invalid'));
        assert.equal(await page.locator('#pending').isVisible(), true, 'live validation retains dirty');
        await page.locator('#reset-form').click();
        assert.equal(await page.locator('#script-error').isVisible(), false);

        await page.locator('#neighbors button[data-edge="0"]').click();
        assert.equal(await page.evaluate(() => mapEditor.selectedHash), '0');
        await applyTile(page, {type: 2, name: 'gate', text: '拿到钥匙后通过', script: 'require key red\nenable axiom a3', data: '{"p":true,"requiresReward":"reward"}'});
        assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 2);
        await page.locator('#undo').click(); assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 1);
        await page.locator('#redo').click(); assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 2);
        await openPanel(page, 'project');
        await page.locator('#project-id').fill('browser-map'); await page.locator('#project-title').fill('浏览器地图');
        await page.locator('#apply-project').click(); assert.equal(await page.evaluate(() => mapEditor.project.title), '浏览器地图');
        await page.locator('#undo').click(); assert.notEqual(await page.evaluate(() => mapEditor.project.title), '浏览器地图');
        await page.locator('#redo').click(); assert.equal(await page.evaluate(() => mapEditor.project.title), '浏览器地图');

        await canvasReady(page);
        await disclose(page, '#view-menu');
        await page.locator('#map-language').selectOption('en');
        assert.equal(await page.evaluate(() => mapEditor.world.onTileText(mapEditor.selected).includes('English gate')), true);
        await page.locator('#map-language').selectOption('zh');
        await page.locator('#theme-select').selectOption('dark');
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        await page.locator('#theme-select').selectOption('light');
        await page.locator('#view-menu > summary').click();

        // Actual canvas hit testing selects an empty native hyperbolic domain.
        await page.locator('#map').scrollIntoViewIfNeeded();
        const target = await page.evaluate(async () => {
            const {Hvec} = await import('/js/hy/algebra.js');
            const w = mapEditor.world, rect = document.getElementById('map').getBoundingClientRect();
            for (const [hash, rotor] of w.atlasTile.rotors) {
                if (mapEditor.project.tiles.has(hash)) continue;
                const p = w.localCamMat.mul(rotor).apply(new Hvec());
                if (p.z > 5) continue;
                const scale = w.localDraw.scale / (p.z + 1) * Math.min(rect.width, rect.height) / 2;
                return {hash, x: rect.x + rect.width / 2 + p.x * scale, y: rect.y + rect.height / 2 + p.y * scale};
            }
        });
        assert.ok(target); await page.mouse.click(target.x, target.y);
        assert.equal(await page.evaluate(() => mapEditor.selectedHash), target.hash, 'click selects empty tile');
        assert.equal(await page.evaluate(() => mapEditor.selected), undefined);
        const beforeDrag = await page.evaluate(() => JSON.stringify(mapEditor.world.localCamMat));
        const box = await page.locator('#map').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, {steps: 6}); await page.mouse.up();
        assert.notEqual(await page.evaluate(() => JSON.stringify(mapEditor.world.localCamMat)), beforeDrag, 'real moveCam drag');

        // Paint and erase by clicking a real domain, with history.
        await page.locator('#locate').click(); await page.locator('#mode').selectOption('1');
        await page.locator('#map').scrollIntoViewIfNeeded();
        const paintBox = await page.locator('#map').boundingBox();
        await page.mouse.click(paintBox.x + paintBox.width / 2, paintBox.y + paintBox.height / 2);
        assert.equal(await page.evaluate(() => mapEditor.selected.type), 1);
        await page.locator('#mode').selectOption('erase');
        await page.locator('#map').scrollIntoViewIfNeeded();
        const eraseBox = await page.locator('#map').boundingBox();
        await page.mouse.click(eraseBox.x + eraseBox.width / 2, eraseBox.y + eraseBox.height / 2);
        assert.equal(await page.evaluate(() => mapEditor.selected), undefined);
        await page.locator('#undo').click(); assert.equal(await page.evaluate(() => mapEditor.selected.type), 1);
        await page.locator('#redo').click(); assert.equal(await page.evaluate(() => mapEditor.selected), undefined);
        await page.locator('#mode').selectOption('select');

        // Export a real selected module and register it through the file input.
        await page.locator('#home').click();
        await page.locator('#mode').selectOption('1'); await page.locator('#multi-select').check();
        const beforeMulti = await snapshot(page);
        const multiBox = await page.locator('#map').boundingBox();
        await page.mouse.click(multiBox.x + multiBox.width / 2, multiBox.y + multiBox.height / 2);
        assert.deepEqual(await page.evaluate(() => mapEditor.selection), [''], 'checkbox selects without Shift');
        assert.equal(await snapshot(page), beforeMulti, 'multi-select overrides paint without modifying tiles');
        await page.mouse.click(multiBox.x + multiBox.width / 2, multiBox.y + multiBox.height / 2);
        assert.deepEqual(await page.evaluate(() => mapEditor.selection), [], 'checkbox toggles selection off');
        await page.locator('#multi-select').uncheck(); await page.locator('#mode').selectOption('select');
        await openPanel(page, 'tiles'); await page.locator('#select-filtered').click(); await closePanel(page);
        assert.equal(await page.evaluate(() => mapEditor.selection.length), 2);
        await page.locator('#open-module-export').click();
        await page.locator('#module-export-id').fill('room');
        const moduleText = await save(page, '#export-module'), module = JSON.parse(moduleText);
        assert.equal(module.format, 'deductrium-map-module-v1'); assert.equal(module.tiles.length, 2);
        await upload(page, 'room.json', moduleText);
        await page.waitForFunction(() => mapEditor.project.modules.has('room'));
        await page.locator('#mount-at').fill('[]'); await page.locator('#preview-mount').click();
        assert.equal(await page.locator('#confirm-mount').isDisabled(), true);
        assert.equal(await page.locator('#mount-preview').getAttribute('data-error'), 'true', 'readable collision preview');
        await page.locator('#mount-at').fill('[3,2,2]'); await page.locator('#mount-rotation').selectOption('2');
        await page.locator('#preview-mount').click();
        assert.equal(await page.locator('#confirm-mount').isDisabled(), false, await page.locator('#mount-preview').textContent());
        const beforePreview = await snapshot(page); await page.locator('#preview-mount').click();
        assert.equal(await snapshot(page), beforePreview, 'preview is read-only');
        await page.locator('#confirm-mount').click();
        assert.equal(await page.evaluate(() => mapEditor.project.instances.length), 1);
        assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 4);
        const instance = page.locator('.instance[data-instance="instance-1"]');
        await instance.getByRole('button', {name: '定位', exact: true}).click();
        assert.equal(await page.locator('#tile-name').isDisabled(), true, 'mounted tile cannot be edited');
        await instance.getByRole('button', {name: '旋转 +1', exact: true}).click();
        assert.equal(await page.evaluate(() => mapEditor.project.instances[0].rotation), 3);
        await instance.getByRole('button', {name: '填入放置表单', exact: true}).click();
        await page.locator('#mount-at').fill('[4,2,2]');
        await instance.getByRole('button', {name: '预览移动', exact: true}).click();
        assert.equal(await page.locator('#mount-preview').getAttribute('data-error'), 'false');
        await instance.getByRole('button', {name: '移动到表单位置', exact: true}).click();
        assert.deepEqual(await page.evaluate(() => mapEditor.project.instances[0].at), [4, 2, 2]);
        await instance.getByRole('button', {name: '分离', exact: true}).click();
        assert.equal(await page.evaluate(() => mapEditor.project.instances.length), 0);
        await page.locator('#undo').click(); assert.equal(await page.evaluate(() => mapEditor.project.instances.length), 1);
        await instance.getByRole('button', {name: '删除实例', exact: true}).click();
        assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 2);
        await page.locator('#undo').click(); assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 4);

        await closePanel(page);
        const source = await save(page, '#export-source'); assert.match(source, /export const mapData/);
        const projectText = await save(page, '#export-project');
        assert.equal(JSON.parse(projectText).title, '浏览器地图');
        assert.equal(await page.evaluate(() => mapEditor.dirty), false);
        const protectedState = await snapshot(page);
        await upload(page, 'bad.json', '{"format":"bad"}');
        await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('导入失败'));
        assert.equal(await snapshot(page), protectedState, 'project import failure keeps old project');
        await upload(page, 'bad-module.json', '{"format":"deductrium-map-module-v1","id":"bad"}');
        await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('导入失败'));
        assert.equal(await snapshot(page), protectedState, 'module import failure keeps old project');
        await upload(page, 'map.ts', source);
        await page.waitForFunction(() => mapEditor.project.instances.length === 0 && mapEditor.project.modules.size === 0);
        assert.equal(await page.evaluate(() => mapEditor.project.tiles.size), 4);
        await upload(page, 'project.json', projectText);
        await page.waitForFunction(() => mapEditor.project.instances.length === 1);
        assert.equal(await snapshot(page), protectedState, 'project file round trip');
        await page.reload(); await waitReady(page);
        assert.equal(await snapshot(page), protectedState, 'draft restoration');
        assert.equal(await page.locator('#map-note').isVisible(), false, 'dismissed hint persists separately from project');

        const popupEvent = context.waitForEvent('page'); await page.locator('#play-map').click();
        const popup = await popupEvent; await popup.waitForURL(/map-editor-preview/);
        const payload = await page.evaluate(() => JSON.parse(localStorage.getItem('deductrium2_map_preview')));
        assert.equal(payload.tiles.length, 4); assert.equal(Object.hasOwn(payload, 'source'), false);
        assert.deepEqual(Object.keys(payload.tiles[0][1]).sort(), ['data', 'name', 'text', 'type'].sort());
        await popup.close();

        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'responsive layout has no horizontal overflow');
        await page.locator('#map').scrollIntoViewIfNeeded(); await page.screenshot({path: join(screenshots, `editor-${viewport.width}.png`)});
        assert.deepEqual(errors, [], 'no uncaught browser errors');
        console.log(JSON.stringify({viewport, checks: 'progressive disclosure, exclusive panels, mobile drawer/pending fields, confirm cancellation, save protection, checkbox multi-selection, native rendering, Apply, shared script catalogue, caret insertion/native undo, pure checks/dirty retention, gutter scroll, JSON row/column, script error focus/goto/live validation, history, metadata, language/theme, empty hit, drag, brush/erase, selection/module, collision/mount/move/rotate/detach/remove, import/export, restoration, preview payload, layout'}));
        await context.close();
    }

    // Storage failures retain manual export; malformed drafts are never overwritten.
    const blocked = await browser.newContext({acceptDownloads: true});
    await blocked.addInitScript(() => { Storage.prototype.setItem = function() { throw Error('blocked storage'); }; });
    const blockedPage = await blocked.newPage(); blockedPage.on('dialog', dialog => dialog.accept());
    await blockedPage.goto(url); await waitReady(blockedPage);
    await fileAction(blockedPage, '#new-project');
    await applyTile(blockedPage, {type: 0, name: 'storage', text: '仍然可导出'});
    assert.match(await blockedPage.locator('#draft-status').textContent(), /不可用/);
    assert.equal(JSON.parse(await save(blockedPage, '#export-project')).tiles.length, 1);
    await blockedPage.locator('#play-map').click();
    assert.match(await blockedPage.locator('#status').textContent(), /blocked storage/);
    await blocked.close();

    const recovery = await browser.newContext({acceptDownloads: true});
    await recovery.addInitScript(() => {
        if (!sessionStorage.getItem('bad-draft-seeded')) {
            localStorage.setItem('deductrium-map-editor-project-v1', '{bad draft'); sessionStorage.setItem('bad-draft-seeded', 'true');
        }
    });
    const recoveryPage = await recovery.newPage(); recoveryPage.on('dialog', dialog => dialog.accept());
    await recoveryPage.goto(url); await waitReady(recoveryPage);
    assert.match(await recoveryPage.locator('#status').textContent(), /旧草稿未能恢复/);
    assert.equal(await save(recoveryPage, '#recover-draft'), '{bad draft');
    await fileAction(recoveryPage, '#new-project');
    await applyTile(recoveryPage, {type: 0, name: 'retained', text: '新工作'});
    assert.equal(await recoveryPage.evaluate(() => localStorage.getItem(mapEditor.storageKey)), '{bad draft');
    assert.equal(JSON.parse(await save(recoveryPage, '#export-project')).tiles.length, 1);
    await recovery.close();
    console.log('PASS storage failure and malformed-draft retention; screenshots: ' + screenshots);
} finally {
    await browser?.close(); await new Promise(done => server.close(done));
}
