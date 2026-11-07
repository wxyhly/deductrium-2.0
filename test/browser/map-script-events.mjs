// Real Game/HWorld dispatch, proof adapters, event bookkeeping and reloads.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(process.argv[2]||fileURLToPath(new URL('../..',import.meta.url)));
const {SCRIPT_GROUPS}=await import(pathToFileURL(resolve(root,'tools/map-editor/script-help.mjs')).href);
const template=id=>SCRIPT_GROUPS.flatMap(group=>group.entries).find(entry=>entry.id===id).template;
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
const tile=(id,hash,type,script,data={})=>({id,hash,type,text:id,data:{script,...data}});
const manifest={format:'deductrium-world-v1',id:'events',title:'事件测试',revision:1,mode:'standalone',
    spawn:{tileId:'start',rotation:0},banks:{},migrations:[],tiles:[
        tile('start','',0,'on start\nadd count starts 1\nunlock rule .i\nunlock reward macro\nunlock reward copygateD\nend\non touch\nevent repeat\nadd count start-touches 1\nend'),
        tile('proof','1',2,'on touch\nevent repeat\nadd count touches 1\nremember proof "$a→$a"\nend\non pass\nrequire proof "$a→$a"\ntake money 3\nadd count passes 1\nend'),
        tile('rule','2',2,'on pass\nrequire rule "⊢$a→$a"\nset flag rule-passed\nend'),
        tile('blocked','3',2,'on touch\nevent repeat\nadd count attempts 1\nend\non pass\ngive money 100\nset flag leaked\nend',{requiresReward:'missing-reward'}),
        tile('reward','4',3,'on touch\nadd count reward-touches 1\nend\non collect\ngive money 10\nadd count claims 1\nend'),
        tile('touch-only','1,1',2,'on touch\nevent repeat\nadd count touch-only 1\nend'),
        tile('repeat','1,2',3,'on collect\nevent repeat\nreward keep\ngive money 1\nend'),
        tile('confirmation','1,3',2,'on touch\nevent repeat\nadd count confirms 1\nend\non pass\ntake money 2\nset flag confirmed\nconfirm "Proceed?"\nend'),
        tile('wall','1,4',1,'on touch\ngive money 999\nend'),
        tile('legacy','2,1',0,'give money 2'),
        tile('template-proof','2,2',2,template('on-proof-gate')),
        tile('template-rule','2,3',2,template('on-rule-gate')),
        tile('demolition','2,4',3,'on collect\nunlock reward dG\nend'),
        tile('key-open','3,1',3,template('on-collect-open').replaceAll('door','key-door')),
        tile('key-door','3,2',2,''),
        tile('key-demolish','3,3',3,template('on-collect-demolish').replaceAll('door','demolition-door')),
        tile('demolition-door','3,4',2,''),
        tile('map-axiom','4,1',3,'on collect\n'+template('add-axiom')+'\nend'),
        tile('remove-map-axiom','4,2',0,'on touch\n'+template('remove-axiom')+'\nend'),
    ]};
const hit=(page,hash)=>page.evaluate(hash=>game.hyLayer.world.hitTest(hash?hash.split(',').map(Number):[]),hash);
const state=page=>page.evaluate(()=>({money:game.deductrium,ms:structuredClone(game.mapScript)}));
const id=name=>'mod:events::'+name;
try {
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        let accept=false;page.on('dialog',async d=>accept?d.accept():d.dismiss());
        await page.addInitScript(world=>localStorage.setItem('deductrium2_world_manifest',JSON.stringify(world)),manifest);
        await page.goto(origin+'/?mod-world');await page.waitForFunction(()=>window.game||document.getElementById('world-load-error'));
        assert.equal(await page.locator('#world-load-error').count(),0,await page.locator('body').innerText());
        assert.equal((await state(page)).ms.counts[id('starts')],1);
        assert.equal((await state(page)).ms.counts[id('start-touches')],undefined,'startup does not synthesize a touch');
        assert.equal(await hit(page,'1'),false,'a script-only proof gate rejects before a proof exists');
        assert.equal((await state(page)).ms.counts[id('touches')],1,'touch commits independently of failed pass');
        assert.equal(await page.evaluate(()=>game.hsLayer.lastGateAST?.toString()),'$a→$a');
        assert.equal(await hit(page,'3'),false);
        assert.equal((await state(page)).ms.counts[id('attempts')],1);
        assert.equal((await state(page)).money,0);assert(!(await state(page)).ms.flags.includes(id('leaked')));
        assert.equal(await hit(page,'1,1'),false,'touch handler alone never opens a gate');
        assert.equal((await state(page)).ms.counts[id('touch-only')],1);
        assert.equal(await hit(page,'4'),true);assert.equal((await state(page)).money,10);
        assert.equal((await state(page)).ms.counts[id('claims')],1);
        assert.equal((await state(page)).ms.counts[id('reward-touches')],1);
        assert.deepEqual((await state(page)).ms.eventDone[id('reward')].slice().sort(),['collect','touch']);
        assert.equal(await hit(page,'4'),true,'consumed reward road remains traversable');
        assert.equal((await state(page)).money,10,'collect never reruns when reward becomes a road');
        await page.evaluate(async()=>{const {HSParser}=await import('/js/hs/core/parser.js');game.hsLayer.hilbertSystem.fromCmd([new HSParser().parse('.i $a','cmd')]);});
        assert.equal(await hit(page,'1'),true);assert.equal((await state(page)).money,7);
        assert.equal((await state(page)).ms.counts[id('passes')],1);
        assert.equal(await hit(page,'1'),true);assert.equal((await state(page)).money,7,'once pass effects stay once');
        assert.equal((await state(page)).ms.counts[id('touches')],3);
        assert.equal(await hit(page,'2'),false,'a proposition alone is not a registered rule');
        await page.evaluate(async()=>{const {HSParser}=await import('/js/hs/core/parser.js');game.hsLayer.hilbertSystem.fromCmd([new HSParser().parse('m zEventRule','cmd')]);});
        assert.equal(await hit(page,'2'),true,'script-only rule gate accepts a recorded matching rule');
        for(let n=0;n<2;n++)assert.equal(await hit(page,'1,2'),true);
        assert.equal((await state(page)).money,9);assert.equal(await page.evaluate(()=>game.hyLayer.world.getBlock('1,2').type),3);
        assert.equal(await hit(page,'1,3'),false);assert.equal((await state(page)).money,9);
        assert.equal((await state(page)).ms.counts[id('confirms')],1);
        assert(!(await state(page)).ms.flags.includes(id('confirmed')),'cancelled pass effects roll back');
        accept=true;assert.equal(await hit(page,'1,3'),true);assert.equal((await state(page)).money,7);
        const beforeWall=await state(page);assert.equal(await hit(page,'1,4'),false);assert.deepEqual(await state(page),beforeWall);
        assert.equal(await hit(page,'2,1'),true);assert.equal((await state(page)).money,9);
        assert.equal(await hit(page,'2,1'),true);assert.equal((await state(page)).money,9,'flat legacy script remains once');
        assert.equal(await hit(page,'2,2'),false,'catalogue proof template checks a proof before passage');
        assert.equal(await hit(page,'2,3'),false,'catalogue rule template checks the full rule');
        await page.evaluate(async()=>{const {HSParser}=await import('/js/hs/core/parser.js');const p=new HSParser();game.hsLayer.hilbertSystem.fromCmd(['hyp $p','hyp $p→$q','mp 2 1','m zTemplateRule','.i $p'].map(c=>p.parse(c,'cmd')));});
        assert.equal(await hit(page,'2,2'),true);
        assert.equal(await hit(page,'2,3'),true);
        for(const hash of ['2,2','2,3'])assert.equal(await page.evaluate(h=>game.hyLayer.world.getBlock(h).type,hash),2,'without dG the templates retain their doors');
        assert.equal(await hit(page,'3,2'),false);
        assert.equal(await hit(page,'3,1'),true,'collect template opens its named door');
        assert.equal(await hit(page,'3,2'),true);
        assert.equal(await page.evaluate(()=>game.hyLayer.world.getBlock('3,2').data?.del),undefined,'opening alone does not mark a door demolished');
        assert.equal(await hit(page,'2,4'),true,'collect the existing demolition ability');
        for(const hash of ['2,2','2,3']) {
            assert.equal(await hit(page,hash),true,'repeat pass can demolish after obtaining dG later');
            assert.equal(await page.evaluate(h=>game.hyLayer.world.getBlock(h).type,hash),0);
            assert.equal(await page.evaluate(h=>game.hyLayer.world.getBlock(h).data?.del,hash),true);
        }
        assert.equal(await hit(page,'3,3'),true);
        assert.equal(await page.evaluate(()=>game.hyLayer.world.getBlock('3,4').data?.del),true);
        const removedText=await page.evaluate(async()=>{const {tileDisplayText}=await import('/js/hy/appearance.js');const {LangMgr}=await import('/js/lang.js');return {actual:tileDisplayText(game.hyLayer.world.getBlock('2,2')),existing:LangMgr.text.delGate};});
        assert.equal(removedText.actual,'template-proof\n'+removedText.existing,'demolition preserves the original text and appends the existing localized gate text');
        assert.equal(await hit(page,'4,1'),true,'the catalogue uses an actual atomic rule name for map axioms');
        assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('zMapAxiom')),true);
        await page.evaluate(()=>{game.saveload.cancelPendingSave();game.saveload.save();});
        const beforeReload=await state(page);await page.reload();await page.waitForFunction(()=>window.game);
        assert.deepEqual(await state(page),beforeReload,'save replay dispatches no events');
        assert.equal((await state(page)).ms.counts[id('starts')],1);
        assert.equal(await hit(page,'4'),true);assert.equal((await state(page)).money,9);
        for(const hash of ['2,2','2,3','3,4'])assert.equal(await page.evaluate(h=>game.hyLayer.world.getBlock(h).data?.del,hash),true,'template demolition survives reload');
        assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('zMapAxiom')),true,'map axiom survives reload');
        assert.equal(await hit(page,'4,2'),true);
        assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('zMapAxiom')),false);
        assert.deepEqual(errors,[]);console.log(JSON.stringify({viewport,events:'PASS',proofGates:'PASS',templates:'PASS',reload:'PASS',errors}));
        await context.close();
    }
} finally {await browser.close();await new Promise(r=>server.close(r));}
