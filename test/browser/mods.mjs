// Actual settings controls, persistence and normal/standalone world transitions.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(process.argv[2]||fileURLToPath(new URL('../..',import.meta.url)));
const sample=JSON.parse(await readFile(resolve(root,'examples/intuitionistic-propositional.world.json'),'utf8'));
const id=sample.id, entry=sample.entry.mainHash;
const server=createServer(async(req,res)=>{
    try {
        const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const file=resolve(root,'.'+(path==='/'?'/index.html':path));
        if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
        res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
            '.html':'text/html','.css':'text/css'})[extname(file)]||'application/octet-stream');
        res.end(await readFile(file));
    }catch{res.writeHead(404).end();}
});
const ready=async page=>{
    await page.waitForFunction(()=>window.game||document.getElementById('world-load-error'));
    assert.equal(await page.locator('#world-load-error').count(),0);
    await page.waitForSelector('#loading.hide',{state:'attached'});
};
const settings=async page=>{
    await page.evaluate(()=>{game.showLayerButton('P-layer',true);});
    await page.locator('button[data-layer="P-layer"]').click();
    await builtinRows(page);
};
const builtinRows=async page=>{
    const expected=await page.evaluate(async()=>{
        const [{builtinMods},{activeWorld},{LangMgr}]=await Promise.all([
            import('/js/hy/builtin-mods.js'),import('/js/hy/world-runtime.js'),import('/js/lang.js')]);
        return {shown:activeWorld?.mode!=='standalone',mods:builtinMods.map(({id,title,revision})=>({id,title,revision})),
            enabled:LangMgr.text.modsEnabled,revision:LangMgr.text.modsRevision,empty:LangMgr.text.modsEmpty,
            library:JSON.parse(localStorage.getItem('deductrium2_mod_library')||'{"mods":[]}').mods};
    });
    assert.ok(expected.mods.some(mod=>mod.id==='builtin:main'),'main is registered as a builtin');
    for(const mod of expected.mods){
        const row=page.locator(`[data-mod-id="${mod.id}"]`);
        assert.equal(await row.count(),expected.shown?1:0,'only loaded builtins appear');
        if(!expected.shown)continue;
        assert.equal(await row.locator('h3').textContent(),mod.title||mod.id);
        assert.equal(await row.locator('.pg-mod-meta').textContent(),`${mod.id} · ${expected.revision} ${mod.revision}`);
        assert.equal(await row.locator('.pg-mod-state').textContent(),expected.enabled);
        assert.equal(await row.locator('button,input,select,a,[role="button"]').count(),0,'required builtin has no actions');
    }
    assert.equal(await page.locator('#pg-mod-list').getByText(expected.empty,{exact:true}).count(),
        expected.library.length?0:1,'empty uploaded-library message is unchanged');
    assert.equal(expected.library.some(entry=>entry.world.id==='builtin:main'),false,'builtin is not stored as an uploaded file');
};
const upload=async(page,world)=>{
    await page.locator('#pg-mod-file').setInputFiles({name:'browser.world.json',mimeType:'application/json',
        buffer:Buffer.from(JSON.stringify(world))});
    await page.locator(`[data-mod-id="${world.id}"]`).waitFor();
};
const mounted=(page,id)=>page.evaluate(async id=>{
    const {nameMap}=await import('/js/hy/maploader.js');
    return [...nameMap.keys()].some(name=>name.startsWith(`mod:${id}::`));
},id);
const transition=async(page,modId,index)=>{
    await page.locator(`[data-mod-id="${modId}"] button`).nth(index).click();
    await page.waitForLoadState('load');await ready(page);await settings(page);
};
const state=page=>page.evaluate(()=>({D:game.deductrium,rw:[...game.gotRewards].sort(),dg:[...game.destructedGates].sort(),
    hs:game.hsLayer.serialize().r,tt:game.ttLayer.serialize(),ms:game.saveload.serialize().ms}));
const trackErrors=context=>{
    const errors=[];
    context.on('page',page=>page.on('pageerror',error=>errors.push({url:page.url(),message:error.message,stack:error.stack})));
    return errors;
};
const seedStorage=(context,origin,key,value)=>context.addInitScript(({origin,key,value})=>{
    // Init scripts also run on the initial about:blank document, which has no storage origin.
    if(location.origin!==origin)return;
    if(localStorage.getItem(key)===null)localStorage.setItem(key,value);
},{origin,key,value:JSON.stringify(value)});
let browser;
try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const {chromium}=await import(process.env.PLAYWRIGHT_MODULE
        ?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href:'playwright');
    browser=await chromium.launch({headless:true,channel:'chrome'});
    const origin=`http://127.0.0.1:${server.address().port}`;
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
        const context=await browser.newContext({viewport}),errors=trackErrors(context);
        try{
            const page=await context.newPage();await page.goto(origin+'/index.html');await ready(page);await settings(page);
            assert.equal(await mounted(page,id),false,'no source-mounted example');
            const baseline=await page.evaluate(async()=> (await import('/js/hy/maploader.js')).blockMap.size);
            assert.equal(baseline,2120);
            await upload(page,sample);
            assert.equal(await mounted(page,id),false,'upload remains inactive');
            assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('deductrium2_mod_library')).mods[0].enabled),false);
            await page.evaluate(()=>{
                game.deductrium=17;game.gotRewards.add('pL');game.destructedGates.add('browser-preserved-gate');
                game.ttLayer.deserialize({table:[{content:'0 : nat'}],active:-1});
                game.saveload.cancelPendingSave();game.saveload.save();
            });
            const old=await state(page);
            await transition(page,id,0);
            assert.equal(await mounted(page,id),true);
            assert.deepEqual(await state(page),old,'enabling preserves main-world progress');
            assert.equal(await page.evaluate(async()=> (await import('/js/hy/maploader.js')).blockMap.size),baseline+sample.tiles.length);
            // Multiple files can be uploaded, but a conflicting enabled set is rejected atomically.
            const collision=structuredClone(sample);collision.id='browser-conflict';collision.title='<img src=x onerror="window.badMod=true">';
            await upload(page,collision);
            assert.equal(await page.locator('[data-mod-id="browser-conflict"] img').count(),0);
            await page.locator('[data-mod-id="browser-conflict"] button').first().click();
            await page.waitForFunction(()=>document.getElementById('pg-mod-status').dataset.error==='true');
            assert.equal(await mounted(page,id),true);assert.equal(await mounted(page,collision.id),false);
            assert.equal(await page.evaluate(()=>window.badMod),undefined,'titles are text');
            assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('deductrium2_mod_library')).mods.find(x=>x.world.id==='browser-conflict').enabled),false);
            await transition(page,collision.id,1);
            // Earn the existing toolkit, then disable while standing inside the extension.
            await page.evaluate(async id=>{
                const {nameMap,blockMap}=await import('/js/hy/maploader.js');
                const name=`mod:${id}::toolkit`,hash=nameMap.get(name),tile=blockMap.get(hash);
                if(!tile)throw Error('toolkit missing');
                game.hyLayer.world.hitTest(hash.split(',').map(Number));game.hyLayer.world.currentTile=hash.split(',').map(Number);
                game.saveload.cancelPendingSave();game.saveload.save();
            },id);
            const earned=await state(page);
            assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('a3i')),true);
            await transition(page,id,0);
            assert.equal(await mounted(page,id),false);
            assert.equal(await page.evaluate(()=>game.hyLayer.world.currentTile.join(',')),entry,'disabled-region spawn returns through main entrance');
            assert.deepEqual(await state(page),earned,'disabling preserves proofs, rewards, gates and script state');
            assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('a3i')),true);
            await transition(page,id,0);assert.equal(await mounted(page,id),true);
            assert.deepEqual(await state(page),earned,'re-enabling does not repeat rewards');
            await transition(page,id,0);await transition(page,id,1);
            assert.equal(await page.locator(`[data-mod-id="${id}"]`).count(),0);
            assert.deepEqual(await state(page),earned,'removing an inactive file retains save progress');
            await upload(page,sample);await transition(page,id,0);
            assert.equal(await mounted(page,id),true);assert.deepEqual(await state(page),earned);
            // Standalone files enter their existing per-world save namespace.
            const standalone={format:'deductrium-world-v1',id:'browser-standalone',title:'Standalone 测试',revision:1,
                mode:'standalone',spawn:{tileId:'home',rotation:0},tiles:[{id:'home',hash:'',type:0,text:'Standalone'}],banks:{},migrations:[]};
            await upload(page,standalone);
            await transition(page,standalone.id,0);
            assert.match(page.url(),/\?mod-world/);assert.equal(await mounted(page,id),false);
            assert.equal(await page.evaluate(()=>game.deductrium),0,'main balance is not loaded into standalone');
            assert.equal(await page.locator(`[data-mod-id="${id}"] button`).first().isDisabled(),true);
            await page.evaluate(()=>{game.deductrium=23;game.saveload.cancelPendingSave();game.saveload.save();});
            await page.locator('#pg-mod-list > button').click();await page.waitForLoadState('load');await ready(page);await settings(page);
            assert.equal(new URL(page.url()).search,'');assert.equal(await mounted(page,id),true);
            assert.deepEqual(await state(page),earned,'returning restores the original save');
            await transition(page,standalone.id,0);
            assert.equal(await page.evaluate(()=>game.deductrium),23,'standalone progress persists independently');
            await page.locator('#pg-mod-list > button').click();await page.waitForLoadState('load');await ready(page);await settings(page);
            // Invalid input cannot replace the library. Long titles fit the mobile settings card.
            const registry=await page.evaluate(()=>localStorage.getItem('deductrium2_mod_library'));
            await page.locator('#pg-mod-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"id":"invalid"}')});
            await page.waitForFunction(()=>document.getElementById('pg-mod-status').dataset.error==='true');
            assert.equal(await page.evaluate(()=>localStorage.getItem('deductrium2_mod_library')),registry);
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
            assert.deepEqual(errors,[]);
            console.log(JSON.stringify({viewport,upload:'PASS',toggle:'PASS',collision:'PASS',preservation:'PASS',standalone:'PASS',errors}));
        }finally{await context.close();}
        // An isolated extension still includes the required main map; its uploaded library is empty.
        const extensionContext=await browser.newContext({viewport}),extensionErrors=trackErrors(extensionContext);
        await seedStorage(extensionContext,origin,'deductrium2_world_manifest',sample);
        try{
            const page=await extensionContext.newPage();
            assert.deepEqual(extensionErrors,[],'fixture initialization on about:blank emits no errors');
            await page.goto(origin+'/index.html?mod-world');
            await ready(page);await settings(page);
            assert.equal(await page.locator('[data-mod-id="builtin:main"]').count(),1);
            assert.equal(await mounted(page,id),true,'isolated extension includes its own world tiles');
            assert.equal(await page.evaluate(()=>game.saveload.saveKey),`deductrium2_world-${id}`);
            assert.equal(await page.locator('#pg-mod-list > button').count(),1,'return button selector stays unique');
            assert.deepEqual(extensionErrors,[]);
            console.log(JSON.stringify({viewport,builtinExtension:'PASS',errors:extensionErrors}));
        }finally{await extensionContext.close();}
        // An installed extension also works before the first normal save exists.
        const currencyWorld=structuredClone(sample),currencyContext=await browser.newContext({viewport});
        const currencyErrors=trackErrors(currencyContext);
        currencyWorld.id='browser-currency';
        const currency=`mod:${currencyWorld.id}`;
        currencyWorld.currency={id:currency,name:'Mod coins'};
        currencyWorld.banks={coins:{rules:[{from:'reasoning',to:currency,rate:1,feeRate:0,feeFixed:0,
            minimum:1,rounding:'none',precision:0}]}};
        const counter=currencyWorld.tiles.at(-1);
        counter.type=3;counter.text='Coin exchange';
        counter.data={exchange:{bank:'coins',from:'reasoning',to:currency,amount:10}};
        await seedStorage(currencyContext,origin,'deductrium2_mod_library',{version:1,mods:[{world:currencyWorld,enabled:true}]});
        try{
            const page=await currencyContext.newPage();
            assert.deepEqual(currencyErrors,[],'fixture initialization on about:blank emits no errors');
            await page.goto(origin+'/index.html');await ready(page);
            assert.equal(await page.evaluate(id=>game.saveload.serialize().balances[id],currency),0,'fresh enabled currency is registered');
            await page.evaluate(hash=>{
                game.deductrium=17;game.hyLayer.world.hitTest(hash.split(',').map(Number));
                game.saveload.cancelPendingSave();game.saveload.save();
            },counter.hash);
            assert.deepEqual(await page.evaluate(()=>game.saveload.serialize().balances),{reasoning:7,type:0,[currency]:10});
            await page.reload();await ready(page);await settings(page);
            assert.equal(await page.evaluate(id=>game.saveload.serialize().balances[id],currency),10);
            await transition(page,currencyWorld.id,0);
            assert.equal(await page.evaluate(id=>game.saveload.serialize().balances[id],currency),10,'disabled currency is retained');
            assert.deepEqual(currencyErrors,[]);
            console.log(JSON.stringify({viewport,currency:'PASS',errors:currencyErrors}));
        }finally{await currencyContext.close();}
        // Uploading an inactive file must not register a balance that survives its removal.
        const unusedContext=await browser.newContext({viewport});
        const unusedErrors=trackErrors(unusedContext);
        await seedStorage(unusedContext,origin,'deductrium2_mod_library',{version:1,mods:[{world:currencyWorld,enabled:false}]});
        try{
            const page=await unusedContext.newPage();
            assert.deepEqual(unusedErrors,[],'fixture initialization on about:blank emits no errors');
            await page.goto(origin+'/index.html');await ready(page);
            await page.evaluate(()=>{game.deductrium=31;game.saveload.cancelPendingSave();game.saveload.save();});
            await page.reload();await ready(page);await settings(page);
            assert.equal(await page.evaluate(id=>game.saveload.serialize().balances[id],currency),undefined,
                'an inactive file never registers a currency');
            await transition(page,currencyWorld.id,1);
            assert.equal(await page.locator(`[data-mod-id="${currencyWorld.id}"]`).count(),0);
            assert.deepEqual(await page.evaluate(()=>game.saveload.serialize().balances),{reasoning:31,type:0},
                'removing a never-enabled file keeps the main save loadable');
            await page.reload();await ready(page);
            assert.equal(await page.evaluate(()=>game.deductrium),31);
            assert.deepEqual(unusedErrors,[]);
            console.log(JSON.stringify({viewport,unusedCurrency:'PASS',errors:unusedErrors}));
        }finally{await unusedContext.close();}
    }
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
