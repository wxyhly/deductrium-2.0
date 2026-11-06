import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp} from 'node:fs/promises';
import {resolve, extname, sep, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
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
const module = process.env.PLAYWRIGHT_MODULE;
const {chromium} = await import(module ? pathToFileURL(module).href : 'playwright');
const browser = await chromium.launch({headless:true, channel:'chrome'});
const screenshots = await mkdtemp(join(tmpdir(), 'deductrium-theme-'));
const origin = `http://127.0.0.1:${server.address().port}`;
const state = page => page.evaluate(() => {
    const g = window.game;
    return JSON.stringify({hs:g.hsLayer.serialize(),hy:g.hyLayer.serialize(),rw:[...g.gotRewards],dg:[...g.destructedGates],D:g.deductrium});
});
const theme = async (page, value) => {
    await page.locator('#theme-select').selectOption(value);
    await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, value === 'auto' ? 'dark' : value);
};
try {
    for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        const context = await browser.newContext({viewport,hasTouch:viewport.width===390,colorScheme:'dark',locale:'en-US'});
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        let checks = 0;
        const check = (value, message) => { assert.ok(value, message); checks++; };
        await page.goto(origin);
        await page.waitForFunction(() => window.game?.hyLayer && document.querySelector('#loading').classList.contains('hide'));
        check(await page.locator('html').getAttribute('data-theme') === 'dark', 'default follows dark system');
        check(await page.locator('#theme-select').inputValue() === 'auto', 'automatic option initially selected');
        const before = await state(page);
        const darkMap = await page.evaluate(async () => {
            const {getMapPalette} = await import('/js/hy/palette.js');
            const w = window.game.hyLayer.world, p = getMapPalette(), ctxt = w.localDraw.ctxt;
            const fills = [], strokes = [], texts = [];
            const fill = ctxt.fill, stroke = ctxt.stroke, text = ctxt.fillText;
            ctxt.fill = function(...args) { fills.push(this.fillStyle); return fill.apply(this,args); };
            ctxt.stroke = function(...args) { strokes.push(this.strokeStyle); return stroke.apply(this,args); };
            ctxt.fillText = function(...args) { texts.push(this.fillStyle); return text.apply(this,args); };
            try { w.onLoop(); } finally { ctxt.fill=fill;ctxt.stroke=stroke;ctxt.fillText=text; }
            const earned=window.game.gotRewards.has('highlightd');
            window.game.gotRewards.add('highlightd');
            const highlight=w.onTileColor({type:0,data:{getD:true}},true);
            if(!earned)window.game.gotRewards.delete('highlightd');
            return {p,fills,strokes,texts,tiles:p.tiles.map((_,type)=>w.onTileColor({type},false)),text:p.text.map((_,type)=>w.onTextColor({type})),highlight};
        });
        check(darkMap.tiles.every((color,index)=>color===darkMap.p.tiles[index]), 'all five map types use dark palette');
        check(darkMap.text.every((color,index)=>color===darkMap.p.text[index]), 'all map text types use dark palette');
        check(darkMap.highlight===darkMap.p.highlight, 'reward highlighting remains distinct');
        check(darkMap.fills.includes(darkMap.p.tiles[0]) && darkMap.strokes.some(color=>darkMap.p.edges.includes(color)), 'real canvas paints dark tiles and player edges');
        check(darkMap.texts.length>0, 'real canvas renders map text');
        await page.screenshot({path:join(screenshots,`map-dark-${viewport.width}.png`)});
        await page.locator('#theme-select').focus();
        await page.keyboard.down('ArrowDown');
        check(await page.evaluate(()=>!window.game.hyLayer.keyDowns.has('ArrowDown')), 'theme keyboard navigation does not steer the player');
        await page.keyboard.up('ArrowDown');
        check(await page.evaluate(()=>{
            const layer=window.game.hyLayer;
            document.querySelector('#theme-select').blur();
            layer.keyDowns.add('KeyW');
            document.querySelector('#theme-select').focus();
            return layer.keyDowns.size===0;
        }), 'focusing theme control releases held movement keys');
        await theme(page,'light');
        const lightMap = await page.evaluate(async () => {
            const {getMapPalette}=await import('/js/hy/palette.js');
            const w=window.game.hyLayer.world;
            w.onLoop();
            return {p:getMapPalette(),road:w.onTileColor({type:0},false)};
        });
        check(lightMap.road==='rgb(255,255,255)', 'light map retains original road color');
        check(lightMap.p.edges[1]==='rgba(0,0,255,1)', 'light player retains original color');
        check(await state(page)===before, 'theme switching preserves progress and proof state');
        // selectOption does not focus the native select: use the actual chooser.
        await page.locator('#theme-select').click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        check(await page.locator('#theme-select').inputValue()==='dark', 'native theme chooser changes the theme');
        await page.keyboard.down('w');
        check(await page.evaluate(()=>window.game.hyLayer.keyDowns.size===0), 'WASD stays blocked while editing the theme selector');
        await page.keyboard.up('w');
        await page.locator('#hyper').click({position:{x:100,y:100}});
        for (const [key,code] of [['w','KeyW'],['a','KeyA'],['s','KeyS'],['d','KeyD']]) {
            const position=await page.evaluate(()=>window.game.hyLayer.serialize());
            await page.keyboard.down(key);
            try {
                check(await page.evaluate(code=>window.game.hyLayer.keyDowns.has(code),code), `${code} resumes after returning to the map from the theme chooser`);
                await page.waitForFunction(before=>window.game.hyLayer.serialize()!==before,position,{timeout:2000});
            } finally { await page.keyboard.up(key); }
            check(await page.evaluate(()=>window.game.hyLayer.keyDowns.size===0), `${code} releases after moving the actual world`);
        }
        await page.keyboard.down('w');
        await page.locator('#theme-select').focus();
        check(await page.evaluate(()=>window.game.hyLayer.keyDowns.size===0), 'focusing the selector clears an actual held movement key');
        await page.keyboard.up('w');
        if (viewport.width===390) {
            const box=await page.locator('#hyper').boundingBox();
            await page.touchscreen.tap(box.x+100,box.y+100);
            const position=await page.evaluate(()=>window.game.hyLayer.serialize());
            await page.keyboard.down('w');
            try {
                check(await page.evaluate(()=>window.game.hyLayer.keyDowns.has('KeyW')), 'touching the map releases selector focus and restores movement');
                await page.waitForFunction(before=>window.game.hyLayer.serialize()!==before,position,{timeout:2000});
            } finally { await page.keyboard.up('w'); }
        }
        await theme(page,'light');
        await page.emulateMedia({colorScheme:'light'});
        check(await page.locator('html').getAttribute('data-theme')==='light', 'explicit light ignores system changes');
        await theme(page,'dark');
        await page.emulateMedia({colorScheme:'dark'});
        await page.emulateMedia({colorScheme:'light'});
        check(await page.locator('html').getAttribute('data-theme')==='dark', 'explicit dark ignores system changes');
        await page.reload();
        await page.waitForFunction(()=>window.game);
        check(await page.locator('#theme-select').inputValue()==='dark', 'choice survives reload');
        await page.goto(origin+'/?creative');
        await page.waitForFunction(()=>window.game);
        check(await page.locator('html').getAttribute('data-theme')==='dark', 'theme shared across game modes');
        await page.locator('button[data-layer="D-layer"]').click();
        const input=page.locator('#hs-cmd-input textarea');
        await input.fill('d a1');
        for (const key of ['w','ArrowLeft']) {
            await page.keyboard.down(key);
            try { check(await page.evaluate(()=>window.game.hyLayer.keyDowns.size===0), `${key} edits the command input without steering the map`); }
            finally { await page.keyboard.up(key); }
        }
        await input.fill('d a1');
        const proof=await state(page);
        await theme(page,'light');
        check(await input.inputValue()==='d a1' && await state(page)===proof, 'switching preserves an unfinished command');
        await theme(page,'dark');
        const styles=await page.evaluate(()=>{
            const css=selector=>{const s=getComputedStyle(document.querySelector(selector));return {bg:s.backgroundColor,color:s.color,caret:s.caretColor};};
            return {body:css('body'),card:css('.manager-card'),editor:css('.editor-pre'),input:css('.editor-textarea'),header:css('.card-header h2'),overflow:document.documentElement.scrollWidth>innerWidth};
        });
        check(styles.body.bg!=='rgb(255, 255, 255)' && styles.card.bg!=='rgb(255, 255, 255)', 'body and cards have dark backgrounds');
        check(styles.input.color==='rgba(0, 0, 0, 0)' && styles.input.caret!=='rgb(0, 0, 0)', 'editor overlay remains transparent with a visible caret');
        check(!styles.overflow, 'theme control fits viewport');
        await page.screenshot({path:join(screenshots,`proof-dark-${viewport.width}.png`)});
        await page.locator('button[data-layer="T-layer"]').click();
        await page.screenshot({path:join(screenshots,`type-dark-${viewport.width}.png`)});
        await page.locator('button[data-layer="R-layer"]').click();
        const drawing=await page.evaluate(()=>{
            const app=window.app,engine=app.engine;
            const a=engine.addFreePoint({x:-1,y:0,z:0}),b=engine.addFreePoint({x:1,y:1,z:0});
            engine.addLine(a,b);app.updateAll();
            const ctx=document.querySelector('#rlCanvas').getContext('2d'),stroke=ctx.stroke,text=ctx.fillText;
            const strokes=[],labels=[];
            ctx.stroke=function(...args){strokes.push(this.strokeStyle);return stroke.apply(this,args);};
            ctx.fillText=function(...args){labels.push(this.fillStyle);return text.apply(this,args);};
            try {app.renderer.render();} finally {ctx.stroke=stroke;ctx.fillText=text;}
            return {strokes,labels,steps:JSON.stringify(engine.stepHistory)};
        });
        check(drawing.strokes.includes('#28384c')&&drawing.labels.includes('#d4dfef'), 'construction canvas draws dark grid and readable point labels');
        await page.screenshot({path:join(screenshots,`construction-dark-${viewport.width}.png`)});
        const drawn=await page.evaluate(()=>{
            window.themeDrawingCalls=0;
            const app=window.app,render=app.renderer.render.bind(app.renderer);
            app.renderer.render=function(){window.themeDrawingCalls++;return render();};
            return JSON.stringify(app.engine.stepHistory);
        });
        await theme(page,'light');await theme(page,'dark');
        check(await page.evaluate(()=>window.themeDrawingCalls>=2), 'construction canvas repaints on theme changes');
        check(await page.evaluate(()=>JSON.stringify(window.app.engine.stepHistory))===drawn, 'construction state survives theme changes');
        await page.locator('button[data-layer="P-layer"]').click();
        await page.screenshot({path:join(screenshots,`progress-dark-${viewport.width}.png`)});
        const other=await context.newPage();
        await other.goto(origin+'/?creative');
        await other.waitForFunction(()=>window.game);
        await theme(other,'light');
        await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
        check(await page.locator('#theme-select').inputValue()==='light', 'theme synchronizes across open tabs');
        await other.locator('#theme-select').selectOption('auto');
        await page.waitForFunction(()=>document.querySelector('#theme-select').value==='auto');
        await page.emulateMedia({colorScheme:'dark'});
        await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
        await page.emulateMedia({colorScheme:'light'});
        await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
        check(true, 'automatic mode follows live system changes');
        await other.evaluate(()=>localStorage.removeItem('deductrium2_theme'));
        await page.waitForFunction(()=>document.querySelector('#theme-select').value==='auto');
        await page.evaluate(()=>{localStorage.setItem('deductrium2_theme','invalid');localStorage.setItem('lang','zh');});
        await page.reload();await page.waitForFunction(()=>window.game);
        check(await page.locator('#theme-select').inputValue()==='auto', 'invalid stored preference falls back to system');
        check((await page.locator('.theme-control').textContent()).includes('黑夜'), 'theme control has Chinese labels');
        check(errors.length===0, errors.join('\n'));
        console.log(JSON.stringify({viewport,checks,errors}));
        await context.close();
    }
    const blocked=await browser.newContext({colorScheme:'dark'});
    await blocked.addInitScript(()=>{
        const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
        Storage.prototype.getItem=function(key){if(key==='deductrium2_theme')throw new DOMException('blocked','SecurityError');return get.call(this,key);};
        Storage.prototype.setItem=function(key,value){if(key==='deductrium2_theme')throw new DOMException('blocked','SecurityError');return set.call(this,key,value);};
    });
    const page=await blocked.newPage();
    await page.goto(origin+'/?creative');await page.waitForFunction(()=>window.game);
    await theme(page,'light');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light','theme still works when preference storage is blocked');
    await blocked.close();
    console.log(JSON.stringify({screenshots,storageBlocked:'pass'}));
} finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
}
