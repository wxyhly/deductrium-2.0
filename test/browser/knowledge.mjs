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
        for (const lang of ['zh', 'en']) {
            const context = await browser.newContext({ viewport });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(lang => localStorage.setItem('lang', lang), lang);
            await page.goto(base);
            await page.waitForFunction(() => window.game?.hyLayer?.world);
            const discovered = await page.evaluate(async () => {
                const { blockMap, nameMap } = await import('/js/hy/maploader.js');
                const game = window.game, world = game.hyLayer.world;
                const check = (value, message) => { if (!value) throw Error(message); };
                const hit = name => world.hitTest((nameMap.get(name) ?? name).split(',').map(Number));
                window.freshKnowledgeSave = structuredClone(game.saveload.serialize());
                check(!game.isInfoUnlocked('m'), 'fresh macro note locked');
                hit('dL'); hit('pL');
                check(document.querySelector('#pg-symbols [data-sym="→"]'), 'symbol immediately rendered');
                hit('macro');
                check(game.isInfoUnlocked('m'), 'recording note granted by macro reward');
                check(!game.isInfoUnlocked('mcpt'), 'unearned skill note stays locked');
                const locked = { type: 2, text: 'ℚ=ℚ', data: { p: true } };
                check(!world.onPassGate('kb-test', locked, '99'), 'unproved gate remains blocked');
                check(!game.isInfoUnlocked('ℚ'), 'blocked gate cannot reveal knowledge');
                await game.hsLayer.cmdEngine.run('a1 $p $q');
                check(world.onPassGate('kb-proved', { type: 2, text: '$p→($q→$p)', data: { p: true } }, '99'), 'actual proof passes gate');
                check(game.isInfoUnlocked('#p'), 'passed gate unlocks note');
                blockMap.set('99', { type: 0, text: { zh: 'λ', en: 'λ' }, data: { info: ['#sb', 'mec:unknown'] } });
                world.onStepToAnotherTile('99');
                check(game.isInfoUnlocked('λ') && game.isInfoUnlocked('#sb'), 'road metadata and glyph unlock');
                check(!game.unlockedInfos.has('mec:unknown'), 'invalid identifier ignored');
                return [...game.unlockedInfos].sort();
            });
            await page.locator('button[data-layer="P-layer"]').click();
            assert(await page.locator('#pg-knowledge .pg-kb-note').count() >= 5);
            await page.locator('#pg-symbols [data-sym="→"]').click();
            assert(await page.locator('#pg-sym-bubble').isVisible());
            await page.waitForFunction(() => {
                const raw = localStorage.getItem('deductrium2_survival');
                return raw && JSON.parse(LZString.decompressFromUTF16(raw)).data.in.includes('sym:λ');
            });
            await page.reload();
            await page.waitForFunction(() => window.game?.saveload);
            assert.deepEqual(await page.evaluate(() => [...game.unlockedInfos].sort()), discovered);
            // A legacy save has no knowledge field. Only its recorded progress is migrated.
            await page.evaluate(() => {
                const game = window.game, data = game.saveload.serialize();
                delete data.in;
                data.rw = ['dL', 'pL', 'macro', '1st', 'peano']; data.dg = ['aa']; data.D = 24;
                game.saveload.cancelPendingSave();
                localStorage.setItem('deductrium2_survival', LZString.compressToUTF16(JSON.stringify({ version: 0, mode: 'survival', timestamp: 0, data })));
            });
            await page.reload();
            await page.waitForFunction(() => window.game?.saveload);
            assert.deepEqual(await page.evaluate(() => ({
                known: ['→', 'm', 'var', '∀', 'ℕ', '#p'].every(id => game.isInfoUnlocked(id)),
                money: game.deductrium, stillLocked: !game.isInfoUnlocked('mcpt'),
            })), { known: true, money: 24, stillLocked: true });
            await page.evaluate(() => {
                const data = game.saveload.serialize();
                data.rw = []; data.dg = []; data.in = [];
                game.saveload.deserialize(data);
            });
            assert.equal(await page.evaluate(() => game.isInfoUnlocked('m') || game.isInfoUnlocked('ℕ')), false);
            assert.deepEqual(errors, []);
            console.log(JSON.stringify({ viewport, lang, knowledge: 'PASS', discoveries: discovered.length }));
            await context.close();
        }
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        await page.goto(base + '/?creative');
        await page.waitForFunction(() => window.game?.progressLayer);
        const totals = await page.evaluate(async () => {
            const { knowledgeBase } = await import('/js/pg/kb.js');
            return {
                symbols: document.querySelectorAll('#pg-symbols .pg-sym-btn').length,
                notes: document.querySelectorAll('#pg-knowledge .pg-kb-note').length,
                expectedSymbols: Object.keys(knowledgeBase.syms).length,
                expectedNotes: Object.keys(knowledgeBase.mecanism).length,
            };
        });
        assert.equal(totals.symbols, totals.expectedSymbols);
        assert.equal(totals.notes, totals.expectedNotes);
        await context.close();
    }
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
