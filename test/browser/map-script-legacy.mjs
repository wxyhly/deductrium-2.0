import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(process.argv[2]||fileURLToPath(new URL('../..',import.meta.url)));
const server=createServer(async(req,res)=>{
    try {
        const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const file=resolve(root,'.'+(name==='/'?'/index.html':name));
        if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
        res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css'})[extname(file)]||'application/octet-stream');
        res.end(await readFile(file));
    }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const origin=`http://127.0.0.1:${server.address().port}`;
const tile=(id,hash,type,script)=>({id,hash,type,text:id,...(script?{data:{script}}:{})});
const manifest={format:'deductrium-world-v1',id:'legacy-scripts',title:'Script integration',revision:1,mode:'standalone',
    spawn:{tileId:'start',rotation:0},banks:{},migrations:[],tiles:[
        tile('start','',0),
        tile('setup','1',3,'give money 40\nunlock layer D-layer\nunlock layer T-layer\nunlock reward copygateD\nunlock rule .i\nunlock rule a3\nunlock type Bool'),
        tile('repeat','2',3,'event repeat\nreward keep\ngive money 2\nadd count visits 1'),
        tile('blocked','3',2,'remember proof "$z→$z"\ngive money 5\nset flag leak\nblock'),
        tile('proof','4',2,'require proof "$a→$a"\ntake money 3\nadd axiom apn5x "⊢$b"\nset flag proved'),
        tile('exit','1,1',2,'if rule-name "a*x"\nblock\nend\nallow'),
        tile('clear','1,2',3,'remove axiom apn5x\ndisable type Bool\nreset reward repeat'),
        tile('type','1,3',2,'remember type "Bool"\nrequire type "Bool"'),
        tile('ordinal','1,4',3,'unlock reward stepw\nset ordinal base 5\nset ordinal max "[1,2]"\nrecompute ordinal\nset ordinal current "[1]"\ngenerate ordinal "[1,2]"\nrequire metric ordinal-base == 5'),
        tile('confirm','2,1',2,'take money 5\nset flag chosen\nconfirm "Proceed?"'),
        tile('collision','2,2',3,'take money 2\nadd axiom a1 "⊢$b"'),
        tile('language','2,3',3,'set language zh'),
        {...tile('legacy-prize','2,4',3),data:{getD:4}},
        tile('reset-prize','3,1',3,'reset reward legacy-prize'),
        tile('consume-later','3,2',3,'event repeat\nif count claims == 0\nreward keep\nelse\nreward consume\nend\nadd count claims 1\ngive money 1')
    ]};
const hit=(page,hash)=>page.evaluate(hash=>game.hyLayer.world.hitTest(hash?hash.split(',').map(Number):[]),hash);
const state=page=>page.evaluate(()=>({money:game.deductrium,ms:structuredClone(game.mapScript),rw:[...game.gotRewards]}));
try {
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
        const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        let accept=false,confirmations=0;
        page.on('dialog',async d=>{confirmations++;if(accept)await d.accept();else await d.dismiss();});
        await page.addInitScript(world=>localStorage.setItem('deductrium2_world_manifest',JSON.stringify(world)),manifest);
        await page.goto(origin+'/?mod-world');await page.waitForFunction(()=>window.game||document.getElementById('world-load-error'));
        assert.equal(await page.locator('#world-load-error').count(),0);
        assert.equal(await hit(page,'1'),true,await page.locator('#pg-toast-container').innerText());
        assert.equal((await state(page)).money,40);
        assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('a3')),true);
        assert.equal(await page.evaluate(()=>game.ttLayer.getGui().core.sysTypes.has('Bool')),true);
        const beforeBlock=await state(page);
        assert.equal(await hit(page,'3'),false);assert.deepEqual(await state(page),beforeBlock);
        assert.equal(await page.evaluate(()=>game.hsLayer.lastGateAST?.toString()),'$z→$z');
        assert.equal(await hit(page,'4'),false);assert.deepEqual(await state(page),beforeBlock);
        await page.evaluate(async()=>{const {HSParser}=await import('/js/hs/core/parser.js');game.hsLayer.hilbertSystem.fromCmd([new HSParser().parse('.i $a','cmd')]);});
        assert.equal(await hit(page,'4'),true);assert.equal((await state(page)).money,37);
        assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('apn5x')),true);
        assert.equal(await hit(page,'1,1'),false,'erroneous axiom prevents the exit');
        assert.equal(await hit(page,'1,3'),false,'an unlocked type alone is not a proof');
        assert.match(await page.locator('[data-map-script-goal="type"]').innerText(),/Bool/);
        await page.evaluate(()=>game.ttLayer.getGui().deserialize({table:[{content:'0b : Bool'}],active:-1}));
        assert.equal(await hit(page,'1,3'),true,'a closed checked inhabitant passes');
        await page.evaluate(()=>game.ttLayer.getGui().deserialize({table:[{content:'_ : False'}],active:-1}));
        assert.equal(await page.evaluate(async()=>{const {createMapScriptEngine}=await import('/js/hy/script-engine.js');return createMapScriptEngine(game.hsLayer,game.ttLayer).query({kind:'type',text:'False'},game.mapScript);}),false);
        for(let i=0;i<2;i++)assert.equal(await hit(page,'2'),true);
        assert.equal((await state(page)).money,41);assert.equal((await state(page)).ms.counts['mod:legacy-scripts::visits'],2);
        assert.equal(await page.evaluate(()=>game.hyLayer.world.getBlock('2').type),3);
        assert.equal(await hit(page,'1,2'),true);assert.equal(await hit(page,'1,1'),true);
        assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('apn5x')),false);
        assert.equal(await page.evaluate(()=>game.ttLayer.getGui().core.sysTypes.has('Bool')),false);
        assert.equal((await state(page)).rw.includes('mod:legacy-scripts::repeat'),false);
        assert.equal(await hit(page,'2'),true);assert.equal((await state(page)).money,43);
        const beforeConfirm=await state(page);assert.equal(await hit(page,'2,1'),false);assert.deepEqual(await state(page),beforeConfirm);
        accept=true;assert.equal(await hit(page,'2,1'),true);assert.equal((await state(page)).money,38);assert.equal(confirmations,2);
        const beforeCollision=await state(page);assert.equal(await hit(page,'2,2'),false);assert.deepEqual(await state(page),beforeCollision);
        assert.equal(await hit(page,'1,4'),true);
        assert.deepEqual(await page.evaluate(()=>({current:game.hyLayer.world.currentOrd,max:game.maxOrd,base:game.ordBase})),{current:[1],max:[1,2],base:5});
        assert.equal(await hit(page,'2,3'),true);assert.equal(await page.evaluate(()=>localStorage.getItem('lang')),'zh');
        await page.evaluate(()=>{game.saveload.cancelPendingSave();game.saveload.save();});
        const beforeReload=await state(page);await page.reload();await page.waitForFunction(()=>window.game||document.getElementById('world-load-error'));
        assert.equal(await page.locator('#world-load-error').count(),0,await page.locator('body').innerText());assert.deepEqual(await state(page),beforeReload);
        assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('a3')),true);
        assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('apn5x')),false);
        assert.equal(await page.evaluate(()=>game.ttLayer.getGui().core.sysTypes.has('Bool')),false);
        assert.deepEqual(await page.evaluate(()=>({current:game.hyLayer.world.currentOrd,max:game.maxOrd,base:game.ordBase})),{current:[1],max:[1,2],base:5});
        assert.equal(await hit(page,'2'),true);assert.equal((await state(page)).money,40);
        assert.equal(await hit(page,'2,4'),true);assert.equal((await state(page)).money,44);
        assert.equal(await hit(page,'3,1'),true);
        assert.equal(await hit(page,'2,4'),true);assert.equal((await state(page)).money,48);
        assert.equal(await hit(page,'2'),true);assert.equal((await state(page)).money,50);
        for(let i=0;i<3;i++)assert.equal(await hit(page,'3,2'),true);
        assert.equal((await state(page)).money,52);assert.equal((await state(page)).ms.counts['mod:legacy-scripts::claims'],2);
        assert.equal(await page.evaluate(()=>game.hyLayer.world.getBlock('3,2').type),0);
        await page.evaluate(()=>{game.saveload.cancelPendingSave();game.saveload.save();});
        await page.reload();await page.waitForFunction(()=>window.game||document.getElementById('world-load-error'));
        assert.equal(await page.locator('#world-load-error').count(),0);
        assert.equal(await hit(page,'2,4'),true);assert.equal(await hit(page,'3,2'),true);
        assert.equal((await state(page)).money,52);assert.equal((await state(page)).ms.counts['mod:legacy-scripts::claims'],2);
        assert.equal(await page.evaluate(()=>game.hyLayer.world.getBlock('3,2').type),0);
        assert.deepEqual(errors,[]);console.log(JSON.stringify({viewport,engines:'PASS',attemptRollback:'PASS',repeat:'PASS',ordinal:'PASS',save:'PASS',errors}));
        await context.close();
    }
}finally{await browser.close();await new Promise(r=>server.close(r));}
