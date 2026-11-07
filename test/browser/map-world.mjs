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
        res.setHeader('Content-Type', ({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[extname(file)] || 'application/octet-stream');
        res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const module = process.env.PLAYWRIGHT_MODULE;
const {chromium} = await import(module ? pathToFileURL(module).href : 'playwright');
const browser = await chromium.launch({headless:true, channel:'chrome'});

const origin = `http://127.0.0.1:${server.address().port}`;
const screenshots = await mkdtemp(join(tmpdir(), 'deductrium-map-world-'));
const manifest = {
    format:'deductrium-world-v1', id:'workshop',title:'工坊世界',revision:1,mode:'standalone',spawn:{tileId:'start',rotation:0},
    currency:{id:'mod:workshop',name:'工坊币',symbol:'W'},
    banks:{central:{rules:[{from:'reasoning',to:'mod:workshop',rate:2,feeRate:.1,feeFixed:1,minimum:1,rounding:'floor',precision:0},
        {from:'mod:workshop',to:'type',rate:.5,feeRate:0,feeFixed:0,minimum:2,rounding:'floor',precision:0}]}},migrations:[],
    tiles:[{id:'start',hash:'',type:0,text:'入口'},
        {id:'prize',hash:'1',type:3,text:'领取启动资金',data:{script:'give money 100\ngive currency type 5\ngive currency mod:workshop 30\nunlock reward macro\nunlock layer D-layer'}},
        {id:'bank',hash:'2',type:0,text:'工坊银行',data:{bank:'central'}},
        {id:'gate',hash:'3',type:2,text:'交 8 工坊币',data:{script:'require currency mod:workshop >= 8\ntake currency mod:workshop 8'}}]
};
const balances = page => page.evaluate(() => game.saveload.serialize().balances);
const ready = async page => {await page.waitForFunction(() => window.game || document.getElementById('world-load-error'));};
try {
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        const context=await browser.newContext({viewport,acceptDownloads:true}), editor=await context.newPage(),errors=[];
        context.on('page', p => p.on('pageerror',e=>errors.push(e.message)));
        editor.on('pageerror',e=>errors.push(e.message));editor.on('dialog',d=>d.accept());
        await editor.goto(origin+'/tools/map-editor/index.html');await editor.waitForFunction(()=>window.mapEditor);
        await editor.locator('#file').setInputFiles({name:'workshop.world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(manifest))});
        await editor.waitForFunction(()=>mapEditor.project.id==='workshop').catch(async error=>{throw Error(`${error.message}; status=${await editor.locator('#status').textContent()}; errors=${errors}`);});
        await editor.locator('#open-project').click();
        await editor.locator('#publish-settings').evaluate(e=>e.open=true);
        assert.equal(await editor.locator('#world-currency-name').inputValue(),'工坊币');
        await editor.locator('#world-currency-name').fill('工坊金币');
        await editor.locator('#export-project').click();
        assert.match(await editor.locator('#status').textContent(),/世界设置/);
        await editor.locator('#world-apply').click();
        assert.equal(await editor.evaluate(()=>mapEditor.project.world.currency.name),'工坊金币');
        const download=editor.waitForEvent('download');await editor.locator('#export-world').click();
        const published=JSON.parse(await readFile(await (await download).path(),'utf8'));
        assert.equal(published.currency.name,'工坊金币');assert.equal(published.tiles[1].id,'prize');
        await editor.evaluate(()=>localStorage.setItem('deductrium2_survival','untouched-main-save'));
        const popup=context.waitForEvent('page');await editor.locator('#play-world').click();const gamePage=await popup;await ready(gamePage);
        assert.equal(new URL(gamePage.url()).search,'?mod-world');
        assert.deepEqual(await balances(gamePage),{reasoning:0,type:0,'mod:workshop':0});
        await gamePage.evaluate(()=>{if(!game.hyLayer.world.hitTest([1]))throw Error('prize rejected');});
        assert.deepEqual(await balances(gamePage),{reasoning:100,type:5,'mod:workshop':30});
        await gamePage.evaluate(()=>{if(!game.hyLayer.world.hitTest([2]))throw Error('bank road rejected');game.hyLayer.world.currentTile=[2];game.hyLayer.world.onStepToAnotherTile('2');});
        await gamePage.locator('#map-bank-dialog').waitFor({state:'visible'});
        assert.deepEqual(await balances(gamePage),{reasoning:100,type:5,'mod:workshop':30});
        await gamePage.locator('#bank-amount').fill('10');
        assert.match(await gamePage.locator('#bank-quote').textContent(),/12.*20/);
        const bankBox=await gamePage.locator('#map-bank-dialog').boundingBox();
        assert.ok(bankBox.x>=0 && bankBox.x+bankBox.width<=viewport.width);
        await gamePage.screenshot({path:join(screenshots,`bank-${viewport.width}.png`)});
        await gamePage.locator('#bank-confirm').click();
        assert.deepEqual(await balances(gamePage),{reasoning:88,type:5,'mod:workshop':50});
        await gamePage.locator('#bank-amount').fill('1000');assert.equal(await gamePage.locator('#bank-confirm').isDisabled(),true);
        await gamePage.locator('#bank-direction').selectOption('1');await gamePage.locator('#bank-amount').fill('10');await gamePage.locator('#bank-confirm').click();
        assert.deepEqual(await balances(gamePage),{reasoning:88,type:10,'mod:workshop':40});
        await gamePage.locator('#map-bank-dialog button[type=button]').click();
        await gamePage.evaluate(()=>{if(!game.hyLayer.world.hitTest([3]))throw Error('script gate rejected');game.hyLayer.world.currentTile=[3];game.saveload.cancelPendingSave();game.saveload.save();});
        assert.deepEqual(await balances(gamePage),{reasoning:88,type:10,'mod:workshop':32});
        const original=await gamePage.evaluate(()=>localStorage.getItem(game.saveload.saveKey));
        await gamePage.reload();await ready(gamePage);assert.deepEqual(await balances(gamePage),{reasoning:88,type:10,'mod:workshop':32});
        assert.equal(await gamePage.evaluate(()=>localStorage.getItem('deductrium2_survival')),'untouched-main-save');
        await gamePage.evaluate(()=>{if(!game.hyLayer.world.hitTest([1]))throw Error('revisit rejected');});
        assert.deepEqual(await balances(gamePage),{reasoning:88,type:10,'mod:workshop':32});
        const upgraded=structuredClone(published);upgraded.revision=2;upgraded.tiles[1].hash='4';upgraded.tiles[3].data.script='require currency mod:workshop >= 15\ntake currency mod:workshop 15';
        await gamePage.evaluate(world=>localStorage.setItem('deductrium2_world_manifest',JSON.stringify(world)),upgraded);
        await gamePage.reload();await gamePage.locator('#world-load-error').waitFor();
        assert.equal(await gamePage.evaluate(()=>localStorage.getItem('deductrium2_world-workshop')),original);
        const recovery=gamePage.waitForEvent('download');await gamePage.locator('#world-load-error button').click();assert.equal(await readFile(await(await recovery).path(),'utf8'),original);
        upgraded.migrations=[{from:1,to:2,remap:{},reset:['gate']}];
        await gamePage.evaluate(world=>localStorage.setItem('deductrium2_world_manifest',JSON.stringify(world)),upgraded);
        await gamePage.reload();await ready(gamePage);assert.equal(await gamePage.locator('#world-load-error').count(),0);
        assert.deepEqual(await balances(gamePage),{reasoning:88,type:10,'mod:workshop':32});
        assert.deepEqual(await gamePage.evaluate(()=>game.hyLayer.world.currentTile),[],'reset gate position returns to spawn');
        await gamePage.evaluate(()=>{if(!game.hyLayer.world.hitTest([4]))throw Error('moved prize rejected');});
        assert.deepEqual(await balances(gamePage),{reasoning:88,type:10,'mod:workshop':32});
        await gamePage.evaluate(()=>{game.saveload.cancelPendingSave();game.saveload.save();});
        assert.equal(await gamePage.evaluate(()=>game.saveload.serialize().world.revision),2);
        // A different mod receives its own currency and save; switching back recovers the first ledger.
        const other=structuredClone(published);other.id='other';other.title='其他世界';other.currency={id:'mod:other',name:'其他币'};
        other.banks={};other.tiles=other.tiles.slice(0,1);other.tiles[0].hash='4,4';other.spawn.rotation=3;
        await gamePage.evaluate(world=>localStorage.setItem('deductrium2_world_manifest',JSON.stringify(world)),other);
        await gamePage.reload();await ready(gamePage);assert.deepEqual(await balances(gamePage),{reasoning:0,type:0,'mod:other':0});
        assert.deepEqual(await gamePage.evaluate(()=>game.hyLayer.world.currentTile),[4,4]);
        const centered=()=>{const w=game.hyLayer.world,r=w.atlasTile.rotors.get(w.currentTile.join(','));return !!r&&Math.abs(r.r-1)<1e-12&&Math.abs(r.x)+Math.abs(r.y)+Math.abs(r.z)<1e-12;};
        assert.equal(await gamePage.evaluate(centered),true,'non-origin spawn centers the actual geometry');
        await gamePage.evaluate(world=>localStorage.setItem('deductrium2_world_manifest',JSON.stringify(world)),upgraded);await gamePage.reload();await ready(gamePage);
        assert.deepEqual(await balances(gamePage),{reasoning:88,type:10,'mod:workshop':32});
        const movedWorld=structuredClone(upgraded);movedWorld.revision=3;movedWorld.tiles[0].hash='5,5';
        movedWorld.migrations.push({from:2,to:3,remap:{},reset:[]});
        await gamePage.evaluate(world=>localStorage.setItem('deductrium2_world_manifest',JSON.stringify(world)),movedWorld);await gamePage.reload();await ready(gamePage);
        assert.deepEqual(await gamePage.evaluate(()=>game.hyLayer.world.currentTile),[0,1]);
        assert.equal(await gamePage.evaluate(centered),true,'moved saved tiles recenter the actual geometry');
        // Advanced settings retain independent unapplied groups and use the exact region model.
        await editor.locator('#file').setInputFiles({name:'other.world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(other))});
        await editor.waitForFunction(()=>mapEditor.project.id==='other');
        await editor.locator('#publish-settings').evaluate(e=>e.open=true);
        await editor.locator('#region-settings').evaluate(e=>e.open=true);
        await editor.locator('#world-currency-name').fill('待应用的币名');
        await editor.locator('#region-apply').click();
        assert.equal(await editor.locator('#world-currency-name').inputValue(),'待应用的币名');
        assert.equal(await editor.evaluate(()=>mapEditor.project.region.side),1);
        await editor.locator('#export-project').click();
        assert.match(await editor.locator('#status').textContent(),/世界设置/);
        await editor.locator('#world-apply').click();
        assert.equal(await editor.evaluate(()=>mapEditor.project.world.currency.name),'待应用的币名');
        const beforeRegion=await editor.evaluate(()=>mapEditor.project.toJSON());
        await editor.locator('#region-side').selectOption('-1');await editor.locator('#region-apply').click();
        assert.deepEqual(await editor.evaluate(()=>mapEditor.project.toJSON()),beforeRegion);
        assert.equal(await editor.locator('#world-settings-status').getAttribute('data-error'),'true');
        assert.equal(await gamePage.evaluate(()=>Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)>innerWidth),false);
        await gamePage.screenshot({path:join(screenshots,`world-${viewport.width}.png`)});
        assert.deepEqual(errors,[]);console.log(JSON.stringify({viewport,world:'PASS',bank:'PASS',publish:'PASS',migration:'PASS',isolation:'PASS',errors}));
        await context.close();
    }
    console.log('Screenshots: '+screenshots);
} finally {await browser.close();await new Promise(r=>server.close(r));}
