// Run after the normal build. PLAYWRIGHT_MODULE accepts a bundled Playwright entry point.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(/^[A-Za-z]:|^\//.test(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream'); res.end(await readFile(path)); }
    catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport, locale: 'zh-CN' });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(() => localStorage.setItem('lang', 'zh'));
        await page.goto(`http://127.0.0.1:${server.address().port}/?survival`);
        await page.waitForFunction(() => window.game?.hyLayer?.world);
        const beforeReload = await page.evaluate(async () => {
            const { blockMap, nameMap, TileBlockType } = await import('/js/hy/maploader.js');
            const { Rotor } = await import('/js/hy/algebra.js');
            const game = window.game, world = game.hyLayer.world;
            const fresh = structuredClone(game.saveload.serialize());
            const [hash, tile] = [...blockMap].find(([, tile]) => !tile.name && tile.type === TileBlockType.Reward && tile.data?.getD === 100);
            const hit = key => world.hitTest((nameMap.get(key) ?? key).split(',').map(Number));
            window.cashSnapshot = hash => {
                const tile = blockMap.get(hash), draw = world.localDraw;
                // Center the actual map tile and render through the real Canvas pipeline.
                world.currentTile = hash.split(',').map(Number);
                world.localCamMat = new Rotor();
                world.atlasTile.generateRotors(world.currentTile);
                const textTo = draw.textTo, renderedTexts = [];
                draw.textTo = function (point, text) { renderedTexts.push(text); return textTo.call(this, point, text); };
                try { world.onLoop(); } finally { draw.textTo = textTo; }
                const { width, height } = draw.canvas, offset = Math.min(width, height) * 0.12;
                const pixel = [...draw.ctxt.getImageData(Math.round(width / 2 + offset), Math.round(height / 2 + offset), 1, 1).data];
                const text = world.onTileText(tile);
                if (!renderedTexts.includes(text)) throw Error('cash text did not reach the Canvas renderer');
                return { hash, type: tile.type, got: !!tile.data.got, recorded: game.gotRewards.has(hash),
                    highLight: world.highLightGetD, color: world.onTileColor(tile, world.highLightGetD), text, pixel, D: game.deductrium };
            };
            const locked = window.cashSnapshot(hash);
            hit('highlightd');
            const unclaimed = window.cashSnapshot(hash);
            hit(hash);
            const claimed = window.cashSnapshot(hash);
            hit(hash);
            if (game.deductrium !== 100) throw Error('cash paid more than once');
            const earned = structuredClone(game.saveload.serialize());
            game.saveload.deserialize(fresh);
            const reset = window.cashSnapshot(hash);
            game.saveload.deserialize({ ...earned, rw: earned.rw.filter(key => key !== 'highlightd') });
            const claimedLocked = window.cashSnapshot(hash);
            hit('highlightd');
            const claimedUnlocked = window.cashSnapshot(hash);
            const [otherHash] = [...blockMap].find(([other, tile]) => other !== hash && tile.type === TileBlockType.Reward && tile.data?.getD === 100);
            const other = window.cashSnapshot(otherHash);
            window.cashSnapshot(hash);
            game.saveload.save();
            return { locked, unclaimed, claimed, reset, claimedLocked, claimedUnlocked, other };
        });
        console.log(JSON.stringify({ viewport, ...beforeReload }));
        assert.equal(beforeReload.locked.color, 'rgb(200,255,20)');
        assert.deepEqual(beforeReload.locked.pixel, [200, 255, 20, 255]);
        assert.equal(beforeReload.unclaimed.color, 'rgb(255,255,0)');
        assert.deepEqual(beforeReload.unclaimed.pixel, [255, 255, 0, 255]);
        for (const state of [beforeReload.claimed, beforeReload.claimedLocked, beforeReload.claimedUnlocked]) {
            assert.equal(state.type, 0);
            assert.equal(state.got, true);
            assert.equal(state.recorded, true);
            assert.equal(state.text, '已获取100µg推理素');
            assert.equal(state.D, 100);
            assert.equal(state.color, 'rgb(255,255,255)');
            assert.deepEqual(state.pixel, [255, 255, 255, 255]);
        }
        assert.equal(beforeReload.reset.got, false);
        assert.equal(beforeReload.reset.color, 'rgb(200,255,20)');
        assert.equal(beforeReload.reset.text, '获取100µg推理素');
        assert.equal(beforeReload.other.color, 'rgb(255,255,0)');
        assert.equal(beforeReload.other.got, false);
        assert.equal(beforeReload.other.text, '获取100µg推理素');
        await page.reload();
        await page.waitForFunction(() => window.game?.hyLayer?.world);
        const restored = await page.evaluate(async hash => {
            const { blockMap } = await import('/js/hy/maploader.js');
            const game = window.game, world = game.hyLayer.world, tile = blockMap.get(hash);
            const draw = world.localDraw, textTo = draw.textTo, renderedTexts = [];
            draw.textTo = function (point, text) { renderedTexts.push(text); return textTo.call(this, point, text); };
            try { world.onLoop(); } finally { draw.textTo = textTo; }
            const offset = Math.min(draw.canvas.width, draw.canvas.height) * 0.12;
            return { color: world.onTileColor(tile, world.highLightGetD), got: tile.data.got, type: tile.type,
                text: world.onTileText(tile), rendered: renderedTexts.includes('已获取100µg推理素'),
                pixel: [...draw.ctxt.getImageData(Math.round(draw.canvas.width / 2 + offset), Math.round(draw.canvas.height / 2 + offset), 1, 1).data],
                recorded: game.gotRewards.has(hash), highLight: world.highLightGetD, D: game.deductrium };
        }, beforeReload.claimed.hash);
        assert.deepEqual(restored, { color: 'rgb(255,255,255)', got: true, type: 0, text: '已获取100µg推理素',
            rendered: true, pixel: [255, 255, 255, 255], recorded: true, highLight: true, D: 100 });
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ viewport, reload: restored, result: 'PASS' }));
        await context.close();
    }
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
