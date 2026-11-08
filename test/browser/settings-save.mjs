// Real settings navigation must retain drafts and export the live game.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]||fileURLToPath(new URL('../..',import.meta.url)));
const sample=JSON.parse(await readFile(resolve(root,'examples/intuitionistic-propositional.world.json'),'utf8'));
const standalone={format:'deductrium-world-v1',id:'settings-drafts',title:'Draft isolation',revision:1,
    mode:'standalone',spawn:{tileId:'home',rotation:0},tiles:[{id:'home',hash:'',type:0,text:'Home'}],banks:{},migrations:[]};
const server=createServer(async(req,res)=>{try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
        '.html':'text/html','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
const ready=async page=>{await page.waitForSelector('#loading.hide',{state:'attached'});
    assert.equal(await page.locator('#world-load-error').count(),0);};
const layer=async(page,id)=>{await page.evaluate(id=>game.showLayerButton(id,true),id);
    await page.locator(`button[data-layer="${id}"]`).click();};
const draft=async(page,text)=>{await layer(page,'D-layer');await page.locator('#hs-cmd-input textarea').fill(text);await layer(page,'P-layer');};
const command=page=>page.locator('#hs-cmd-input textarea').inputValue();
const upload=async(page,world)=>{await page.locator('#pg-mod-file').setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});
    await page.locator(`[data-mod-id="${world.id}"]`).waitFor();};
const move=async(page,selector)=>{await Promise.all([page.waitForEvent('load'),page.locator(selector).click()]);await ready(page);await layer(page,'P-layer');};
const step=page=>page.evaluate(()=>game.hsLayer.serialize().s);
let browser;
try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
    const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
    browser=await chromium.launch({headless:true,channel:'chrome'});
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}])for(const mode of ['survival','creative']){
        const context=await browser.newContext({viewport,acceptDownloads:true}),page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.dismiss());
        try{
            await page.goto(origin+(mode==='creative'?'/?creative':'/'));await ready(page);
            if(mode==='survival'){
                assert.equal(await page.locator('button[data-layer="T-layer"]').isVisible(),false);
                await page.evaluate(async()=>{const {nameMap}=await import('/js/hy/maploader.js');
                    game.hyLayer.world.hitTest(nameMap.get('type').split(',').map(Number));});
                assert.equal(await page.locator('button[data-layer="T-layer"]').isVisible(),true,'type reward unlocks its layer');
                await page.evaluate(()=>game.saveload.save());await page.reload();await ready(page);
                assert.equal(await page.locator('button[data-layer="T-layer"]').isVisible(),true,'old claimed type rewards unlock on reload');
                await page.evaluate(()=>{const saved=game.saveload.serialize();saved.rw=saved.rw.filter(id=>id!=='type');game.saveload.deserialize(saved);});
                assert.equal(await page.locator('button[data-layer="T-layer"]').isVisible(),false,'loading a fresh slot must relock the type layer');
                await page.evaluate(async()=>{const {nameMap}=await import('/js/hy/maploader.js');
                    game.hyLayer.world.hitTest(nameMap.get('type').split(',').map(Number));});
            }
            await layer(page,'P-layer');
            await upload(page,sample);
            const raw='  a1 $p $q\n\n a1 $q $p  ',sheets=await step(page);
            await draft(page,raw);
            await move(page,`[data-mod-id="${sample.id}"] button:first-of-type`);
            assert.equal(await command(page),raw,'enabling must retain the raw unexecuted command');
            assert.deepEqual(await step(page),sheets,'restoring text must not execute it');
            await move(page,`[data-mod-id="${sample.id}"] button:first-of-type`);
            assert.equal(await command(page),raw,'disabling must retain the command');
            await move(page,`[data-mod-id="${sample.id}"] button:nth-of-type(2)`);
            assert.equal(await command(page),raw,'removing an inactive file must retain the command');
            await upload(page,sample);
            // An active multi-step command cannot be reconstructed from its last argument.
            await layer(page,'D-layer');await page.locator('#hs-cmd-input textarea').fill('a1');
            await page.locator('#hs-cmd-input textarea').press('Escape');await page.locator('#hs-cmd-input textarea').press('Enter');
            await page.waitForFunction(()=>game.hsLayer.cmdEngine.isExecuting());
            await page.locator('#hs-cmd-input textarea').fill('$unfinished');await layer(page,'P-layer');
            const registry=await page.evaluate(()=>localStorage.getItem('deductrium2_mod_library'));
            let loads=0;const onLoad=()=>loads++;page.on('load',onLoad);
            await page.locator(`[data-mod-id="${sample.id}"] button`).first().click();
            await page.waitForFunction(()=>document.getElementById('pg-mod-status').dataset.error==='true');
            assert.equal(loads,0);assert.equal(await command(page),'$unfinished');
            assert.equal(await page.evaluate(()=>game.hsLayer.cmdEngine.isExecuting()),true);
            assert.equal(await page.evaluate(()=>localStorage.getItem('deductrium2_mod_library')),registry);
            page.off('load',onLoad);await layer(page,'D-layer');
            for(let i=0;i<5&&await page.evaluate(()=>game.hsLayer.cmdEngine.isExecuting());i++)await page.locator('#hs-cmd-input textarea').press('Escape');
            assert.equal(await page.evaluate(()=>game.hsLayer.cmdEngine.isExecuting()),false);
            await draft(page,raw);await upload(page,standalone);
            await move(page,`[data-mod-id="${standalone.id}"] button:first-of-type`);
            assert.equal(await command(page),'','main command must not leak into a separate world');
            const worldDraft='a1 $x $y';await draft(page,worldDraft);
            await move(page,'#pg-mod-list > button');
            assert.equal(new URL(page.url()).search,mode==='creative'?'?creative':'','return to the originating main mode');
            assert.equal(await command(page),raw,'return restores the main-world draft');
            await move(page,`[data-mod-id="${standalone.id}"] button:first-of-type`);
            assert.equal(await command(page),worldDraft,'standalone draft is restored only in its own save namespace');
            await move(page,'#pg-mod-list > button');
            // Export immediately after a reward must include changes before the 2s autosave.
            await page.evaluate(()=>{game.ttLayer.deserialize({table:[{content:'0 : nat'}],active:-1});
                game.deductrium=1;game.saveload.save();game.deductrium=37;game.saveload.notifySave();});
            const received=page.waitForEvent('download');await page.locator('#pg-export').click();const download=await received;
            const rawSave=await readFile(await download.path(),'utf8');
            const exported=await page.evaluate(raw=>JSON.parse(game.saveload.compressor.decompress(raw)),rawSave);
            if(mode==='survival')assert.equal(exported.data.D,37,'export uses current balance');
            assert.equal(exported.data.tt.table[0].content,'0 : nat');
            // A focused TT editor can also be exported without an intervening blur.
            await layer(page,'T-layer');await page.locator('#ttAddItem').click();await page.locator('#ttRows textarea').fill('true : True');
            const typed=page.waitForEvent('download');await page.evaluate(()=>document.getElementById('pg-export').click());
            const typedFile=await typed;const typedRaw=await readFile(await typedFile.path(),'utf8');
            assert.equal(await page.evaluate(raw=>JSON.parse(game.saveload.compressor.decompress(raw)).data.tt.table.at(-1).content,typedRaw),'true : True');
            // A failed save must report failure instead of downloading an older snapshot.
            await layer(page,'P-layer');await page.evaluate(()=>{window.saveForSettings=game.saveload.save;
                game.saveload.save=()=>{throw new Error('settings save rejected');};});
            let downloads=0;const onDownload=()=>downloads++;page.on('download',onDownload);
            const dialog=page.waitForEvent('dialog');await page.locator('#pg-export').click();await dialog;
            assert.equal(downloads,0);await page.evaluate(()=>{game.saveload.save=window.saveForSettings;});page.off('download',onDownload);
            await draft(page,raw);const latest=await page.evaluate(()=>localStorage.getItem('deductrium2_mod_library'));
            await page.evaluate(()=>{window.saveForSettings=game.saveload.save;game.saveload.save=()=>{throw new Error('settings save rejected');};});
            await page.locator(`[data-mod-id="${sample.id}"] button`).first().click();
            await page.waitForFunction(()=>document.getElementById('pg-mod-status').dataset.error==='true');
            assert.equal(await page.evaluate(()=>localStorage.getItem('deductrium2_mod_library')),latest);
            assert.equal(await command(page),raw);await page.evaluate(()=>{game.saveload.save=window.saveForSettings;});
            assert.deepEqual(errors,[]);console.log(JSON.stringify({viewport,mode,drafts:'PASS',activeCommand:'PASS',worldIsolation:'PASS',export:'PASS',failures:'PASS',errors}));
        }finally{await context.close();}
    }
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
