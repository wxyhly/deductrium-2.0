// Real Game, HS, progress UI and save/reload for a portable world-owned content library.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) {res.writeHead(403).end(); return;}
        res.setHeader('Content-Type', ({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css'})[extname(file)] || 'text/plain');
        res.end(await readFile(file));
    } catch {res.writeHead(404).end();}
});
const world = {format:'deductrium-world-v1', id:'content-browser', title:'Content browser', revision:1, mode:'standalone',
    spawn:{tileId:'start',rotation:0}, banks:{}, migrations:[], content:{
        rules:[{id:'qIdentity',statement:'⊢$1→$1',proof:'d .i $1'}, {id:'qClassical',statement:'⊢¬¬$1→$1',proof:'d .ne $1'}],
        definitions:[{id:'qConst',kind:'constant',symbol:'freshc',parameters:[],body:'0'}],
        knowledge:[{id:'guide',title:{zh:'作者笔记',en:'Author note'},body:{zh:'<b>纯文字</b>',en:'<b>Plain text</b>'}}],
        achievements:[{id:'badge',title:{zh:'作者勋章',en:'Author badge'},description:{zh:'完成自定义目标',en:'Finish a custom goal'}}]
    }, tiles:[
        {id:'start',hash:'',type:0,text:'Start',data:{script:'on start\nunlock rule qIdentity\nunlock rule qConst\nend'}},
        {id:'prize',hash:'1',type:3,text:'Prize',data:{info:['guide','mec:macro'],script:'unlock info guide\nunlock achievement badge'}},
        {id:'gate',hash:'2',type:2,text:'P→P',data:{p:true}},
        {id:'locked',hash:'3',type:3,text:'Needs a3',data:{script:'unlock rule qClassical'}}
    ]};
let browser;
try {
    await new Promise(done => server.listen(0,'127.0.0.1',done));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'});
    for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        const context = await browser.newContext({viewport}), page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(world => {
            localStorage.setItem('deductrium2_world_manifest',JSON.stringify(world));
            localStorage.setItem('lang','zh');
        },world);
        await page.goto(origin+'/?mod-world');
        await page.waitForFunction(() => window.game || document.getElementById('world-load-error'));
        assert.equal(await page.locator('#world-load-error').count(),0,await page.locator('body').innerText());
        const inspect = () => page.evaluate(() => {
            const system=game.hsLayer.getMapScriptSystem();
            return {rules:[...system.rules.keys()],proof:system.rules.get('qIdentity')?.step?.length,
                constant:system.rules.get('qConst')?.toString(),save:structuredClone(game.saveload.serialize())};
        });
        const initial=await inspect();
        assert.ok(initial.proof>0); assert.equal(initial.constant,'⊢freshc()=0');
        assert.equal(initial.rules.includes('qClassical'),false); assert.equal(initial.rules.includes('a3'),false);
        await page.evaluate(async () => {
            game.hyLayer.world.hitTest([3]);
            await game.hsLayer.cmdEngine.run('d qIdentity P');
        });
        assert.equal((await inspect()).rules.includes('qClassical'),false,'a declared theorem cannot grant its unearned a3');
        assert.equal(await page.evaluate(() => game.hyLayer.world.hitTest([2])),true,'earned checked theorem passes the actual gate');
        await page.evaluate(() => game.hyLayer.world.hitTest([1]));
        assert.equal(await page.evaluate(() => game.isInfoUnlocked('mec:mod:content-browser::guide')),true);
        assert.equal(await page.evaluate(() => game.isAchievementGot('mod:content-browser::badge')),true);
        assert.match(await page.locator('#pg-knowledge').textContent(),/作者笔记/);
        assert.match(await page.locator('#pg-knowledge').textContent(),/<b>纯文字<\/b>/);
        assert.equal(await page.locator('#pg-knowledge b').count(),0,'custom prose is plain text');
        assert.match(await page.locator('#pg-achievements').textContent(),/作者勋章/);
        await page.evaluate(() => game.saveload.save());
        const saved=(await inspect()).save;
        await page.reload(); await page.waitForFunction(() => window.game);
        const reloaded=await inspect(); assert.deepEqual(reloaded.save,saved); assert.ok(reloaded.proof>0);
        assert.equal(reloaded.constant,'⊢freshc()=0');assert.equal(reloaded.rules.includes('a3'),false);
        assert.equal(await page.evaluate(() => game.isInfoUnlocked('mec:mod:content-browser::guide')),true);
        assert.deepEqual(errors,[]);
        console.log(JSON.stringify({viewport,checks:'earned checked macro/nullary constant/locked primitive/gate/custom note+achievement/plain text/real save reload',errors}));
        await context.close();
    }
} finally {await browser?.close();await new Promise(done=>server.close(done));}
