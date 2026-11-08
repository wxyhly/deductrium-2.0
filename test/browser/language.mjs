// Actual entry tile, settings selector, full UI reload and unsaved progress.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]||fileURLToPath(new URL('../..',import.meta.url)));
const server=createServer(async(req,res)=>{
    try{
        const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const file=resolve(root,'.'+(path==='/'?'/index.html':path));
        if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
        res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
            '.html':'text/html','.css':'text/css'})[extname(file)]||'application/octet-stream');
        res.end(await readFile(file));
    }catch{res.writeHead(404).end();}
});
const ready=async page=>{
    await page.waitForFunction(()=>window.game?.hyLayer?.world||document.getElementById('world-load-error'));
    assert.equal(await page.locator('#world-load-error').count(),0);
    await page.waitForSelector('#loading.hide',{state:'attached'});
};
const progress=page=>page.evaluate(()=>{
    const data=game.saveload.serialize();
    return {hs:data.hs,tt:data.tt,D:data.D,rw:data.rw,dg:data.dg,ms:data.ms};
});
const check=async(page,lang)=>{
    const actual=await page.evaluate(async()=>{
        const {LangMgr}=await import('/js/lang.js');
        const {blockMap,nameMap}=await import('/js/hy/maploader.js');
        const tile=blockMap.get(nameMap.get('zh-en'));
        return {lang:LangMgr.lang,stored:localStorage.getItem('lang'),type:tile.type,
            toggle:game.hyLayer.world.onTileText(tile),welcome:game.hyLayer.world.onTileText(blockMap.get('')),
            select:document.querySelector('#pg-lang').value,
            label:document.querySelector('[data-i18n="language"]').textContent};
    });
    assert.equal(actual.lang,lang);assert.equal(actual.stored,lang);
    assert.equal(actual.select,lang);assert.equal(actual.type,3,'entry switch stays usable after old or new saves');
    assert.equal(actual.toggle,lang==='en'?'切换游戏语言：\n中文':'Toggle Language:\nEnglish');
    assert.ok(actual.welcome.startsWith(lang==='en'?'Welcome to the game':'欢迎来到游戏'));
    assert.equal(actual.label,lang==='en'?'Language':'语言');
};
const touch=async page=>{
    await Promise.all([page.waitForEvent('load'),page.evaluate(async()=>{
        const {nameMap}=await import('/js/hy/maploader.js');
        const path=nameMap.get('zh-en').split(',').map(Number);
        // A held movement key can retry collision before the scheduled reload.
        for(let i=0;i<3;i++)game.hyLayer.world.hitTest(path);
    })]);await ready(page);
};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const failures=[];
const scenario=async(name,run)=>{
    try{await run();console.log(`${name}: PASS`);}
    catch(error){failures.push(new Error(name,{cause:error}));console.error(`${name}: FAIL\n${error.stack}`);}
};
const isolated=async(browser,origin,viewport,mode,run)=>{
    const context=await browser.newContext({viewport,locale:'zh-CN'}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.dismiss());
    try{
        await page.goto(origin+(mode==='creative'?'/?creative':'/'));await ready(page);
        await run(page,errors);
        assert.deepEqual(errors,[],'language failures are handled without uncaught page errors');
    }finally{await context.close();}
};
const immediateReward=async page=>{
    const loaded=page.waitForEvent('load');
    const claimed=await page.evaluate(async()=>{
        const {nameMap}=await import('/js/hy/maploader.js');
        if(game.gotRewards.has('pL'))throw new Error('pL fixture was already claimed');
        game.hyLayer.world.hitTest(nameMap.get('zh-en').split(',').map(Number));
        const accepted=game.hyLayer.world.hitTest(nameMap.get('pL').split(',').map(Number));
        return {accepted,reward:game.gotRewards.has('pL'),achievement:game.gotAchievements.has('progL')};
    });
    await loaded;await ready(page);await check(page,'en');
    assert.deepEqual(claimed,{accepted:true,reward:true,achievement:true},'real pL arrival succeeds during the refresh window');
    assert.deepEqual(await page.evaluate(()=>({reward:game.gotRewards.has('pL'),achievement:game.gotAchievements.has('progL')})),
        {reward:true,achievement:true},'refresh must keep rewards claimed after the language-switch save');
};
const saveFailure=async(page,kind,phase='initial')=>{
    await page.evaluate(()=>game.showLayerButton('P-layer',true));
    await page.locator('button[data-layer="P-layer"]').click();
    await page.evaluate(({kind,phase})=>{
        game.ttLayer.deserialize({table:[{content:'0 : nat'}],active:-1});
        game.saveload.cancelPendingSave();game.saveload.save();
        window.languageSaveBefore=localStorage.getItem(game.saveload.saveKey);
        game.ttLayer.deserialize({table:[{content:'true : True'}],active:-1});
        game.saveload.notifySave();
        window.languageFailure=true;
        window.languageSaveAttempts=0;
        const reject=()=>{
            window.languageSaveAttempts++;
            return window.languageFailure&&(phase==='initial'||window.languageSaveAttempts>=2);
        };
        if(kind==='quota'){
            const original=Storage.prototype.setItem;
            Storage.prototype.setItem=function(key,value){
                if(key===game.saveload.saveKey&&reject())throw new DOMException('Language test quota exceeded','QuotaExceededError');
                return original.call(this,key,value);
            };
            window.restoreLanguageSave=()=>{Storage.prototype.setItem=original;};
        }else{
            const original=game.saveload.save;
            game.saveload.save=function(...args){
                if(reject())throw new Error('Language test save failed');
                return original.apply(this,args);
            };
            window.restoreLanguageSave=()=>{game.saveload.save=original;};
        }
    },{kind,phase});
    let loads=0;const onLoad=()=>loads++;page.on('load',onLoad);
    await page.locator('#pg-lang').selectOption('en');
    await pause(350);
    const failed=await page.evaluate(async()=>({
        marker:window.languageFailure,stored:localStorage.getItem('lang'),
        lang:(await import('/js/lang.js')).LangMgr.lang,select:document.querySelector('#pg-lang').value,
        unchanged:localStorage.getItem(game.saveload.saveKey)===window.languageSaveBefore,
    }));
    await page.evaluate(()=>{
        window.languageSaveFailed=localStorage.getItem(game.saveload.saveKey);
        window.languageFailure=false;window.restoreLanguageSave();
    });
    // No new input/notifySave here: the pre-existing pending save must still retry.
    let retried=true;
    try{await page.waitForFunction(()=>localStorage.getItem(game.saveload.saveKey)!==window.languageSaveFailed,null,{timeout:3500});}
    catch{retried=false;}
    page.off('load',onLoad);
    assert.deepEqual({loads,...failed,retried},{loads:0,marker:true,stored:null,lang:'zh',select:'auto',unchanged:phase==='initial',retried:true},
        'failed language saves restore the previous selector, do not reload, and retain automatic-save retry');
    // Check persisted data, rather than accepting an unrelated timestamp-only write.
    await page.reload();await ready(page);
    assert.equal(await page.evaluate(()=>game.saveload.serialize().tt.table[0].content),'true : True');
    await Promise.all([page.waitForEvent('load'),page.locator('#pg-lang').selectOption('en')]);
    await ready(page);await check(page,'en');
};
const commandDraft=async page=>{
    await page.evaluate(()=>game.showLayerButton('D-layer',true));
    await page.locator('button[data-layer="D-layer"]').click();
    const command='  a1 $p $q\n\n a1 $q $p  ';
    const sheets=await page.evaluate(()=>game.hsLayer.serialize().s);
    await page.locator('#hs-cmd-input textarea').fill(command);
    assert.equal(await page.locator('#hs-cmd-input textarea').evaluate(el=>document.activeElement===el),true);
    await touch(page);await check(page,'en');
    assert.equal(await page.locator('#hs-cmd-input textarea').inputValue(),command,'unexecuted command text survives entry switching');
    assert.deepEqual(await page.evaluate(()=>game.hsLayer.serialize().s),sheets,'restoring a command draft must not execute it');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem(`${game.saveload.saveKey}:language-draft`)),null,'temporary command draft was consumed');
    await page.reload();await ready(page);
    assert.equal(await page.locator('#hs-cmd-input textarea').inputValue(),'','one-time command recovery does not change ordinary reload semantics');
    assert.deepEqual(await page.evaluate(()=>game.hsLayer.serialize().s),sheets);
};
const typeDraft=async page=>{
    await page.evaluate(()=>{game.showLayerButton('T-layer',true);game.ttLayer.deserialize({table:[{content:'0 : nat'}],active:-1});});
    await page.locator('button[data-layer="T-layer"]').click();
    await page.locator('#ttAddItem').click();
    const input=page.locator('#ttRows textarea');
    await input.fill('true : True');
    assert.equal(await input.evaluate(el=>document.activeElement===el),true,'TT text is still focused, without Enter or blur');
    assert.equal(await page.evaluate(()=>game.saveload.serialize().tt.table.at(-1).content),'','fixture has not committed the edited text');
    await touch(page);await check(page,'en');
    const restored=await page.evaluate(()=>document.querySelector('#ttRows textarea')?.value??game.saveload.serialize().tt.table.at(-1)?.content);
    assert.equal(restored,'true : True','language switching must retain the in-progress TT edit');
    await page.reload();await ready(page);
    assert.equal(await page.evaluate(()=>document.querySelector('#ttRows textarea')?.value??game.saveload.serialize().tt.table.at(-1)?.content),'true : True');
};
const activeCommand=async page=>{
    await page.evaluate(()=>game.showLayerButton('D-layer',true));
    await page.locator('button[data-layer="D-layer"]').click();
    await page.locator('#hs-cmd-input textarea').fill('a1');
    await page.locator('#hs-cmd-input textarea').press('Escape');
    assert.equal(await page.locator('#hs-cmd-input textarea').inputValue(),'a1');
    await page.locator('#cmd-ok-btn').click();
    await page.waitForFunction(()=>game.hsLayer.cmdEngine.isExecuting());
    await page.locator('#hs-cmd-input textarea').fill('$unfinished');
    const sheets=await page.evaluate(()=>game.hsLayer.serialize().s);
    let loads=0;const onLoad=()=>loads++;page.on('load',onLoad);
    await page.evaluate(async()=>{
        const {nameMap}=await import('/js/hy/maploader.js');
        game.hyLayer.world.hitTest(nameMap.get('zh-en').split(',').map(Number));
    });
    await pause(350);page.off('load',onLoad);
    assert.equal(loads,0,'an active parameter command refuses language reload');
    assert.equal(await page.locator('#hs-cmd-input textarea').inputValue(),'$unfinished','in-progress argument text remains in the current page');
    assert.equal(await page.evaluate(()=>game.hsLayer.cmdEngine.isExecuting()),true);
    assert.deepEqual(await page.evaluate(()=>game.hsLayer.serialize().s),sheets);
    assert.equal(await page.evaluate(()=>localStorage.getItem('lang')),null);
};
let browser;
try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const {chromium}=await import(process.env.PLAYWRIGHT_MODULE
        ?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href:'playwright');
    browser=await chromium.launch({headless:true,channel:'chrome'});
    const origin=`http://127.0.0.1:${server.address().port}`;
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
        for(const mode of ['survival','creative']){
            await scenario(`${viewport.width}/${mode}/existing`,async()=>{
            const context=await browser.newContext({viewport,locale:'zh-CN'}),page=await context.newPage(),errors=[];
            page.on('pageerror',error=>errors.push(error.message));
            try{
                await page.goto(origin+(mode==='creative'?'/?creative':'/'));await ready(page);
                await page.evaluate(async mode=>{
                    const {HSParser}=await import('/js/hs/core/parser.js');
                    game.hsLayer.hilbertSystem.fromCmd([new HSParser().parse('a1 $p $q','cmd')]);
                    game.ttLayer.deserialize({table:[{content:'0 : nat'}],active:-1});
                    if(mode==='survival'){
                        game.deductrium=17;game.gotRewards.add('pL');game.destructedGates.add('language-test-gate');
                    }
                    game.saveload.cancelPendingSave();
                },mode);
                const before=await progress(page);
                const loaded=page.waitForEvent('load',{timeout:2000});
                await page.evaluate(async()=>{
                    const {nameMap}=await import('/js/hy/maploader.js');
                    for(let i=0;i<3;i++)game.hyLayer.world.hitTest(nameMap.get('zh-en').split(',').map(Number));
                });
                await loaded;await ready(page);await check(page,'en');
                assert.deepEqual(await progress(page),before,'entry switching saves pending proof, TT, rewards and balances');
                await page.reload();await ready(page);await check(page,'en');
                if(mode==='survival'){
                    // The broken older implementation recorded this tile as an ordinary reward.
                    await page.evaluate(()=>{game.gotRewards.add('zh-en');game.saveload.save();});
                    await page.reload();await ready(page);await check(page,'en');
                }
                const legacy=await progress(page);
                await touch(page);await check(page,'zh');
                assert.deepEqual(await progress(page),legacy,'old collected switches are repaired without deleting progress');
                await page.evaluate(()=>game.showLayerButton('P-layer',true));
                await page.locator('button[data-layer="P-layer"]').click();
                await page.evaluate(()=>{game.ttLayer.deserialize({table:[{content:'true : True'}],active:-1});game.saveload.cancelPendingSave();});
                const pending=await progress(page);
                await Promise.all([page.waitForEvent('load'),page.locator('#pg-lang').selectOption('en')]);
                await ready(page);await check(page,'en');
                assert.deepEqual(await progress(page),pending,'settings use the same save-before-reload path');
                assert.deepEqual(errors,[]);console.log(JSON.stringify({viewport,mode,entry:'PASS',repeat:'PASS',legacy:'PASS',settings:'PASS',progress:'PASS',errors}));
            }finally{await context.close();}
            });
            for(const [name,run] of [['save-quota',page=>saveFailure(page,'quota')],['save-throw',page=>saveFailure(page,'save')],
                ['final-save-throw',page=>saveFailure(page,'save','final')],['command-draft',commandDraft],['type-draft',typeDraft],
                ['active-command',activeCommand],...(mode==='survival'?[['immediate-pL',immediateReward]]:[])]){
                await scenario(`${viewport.width}/${mode}/${name}`,()=>isolated(browser,origin,viewport,mode,run));
            }
        }
    }
    if(failures.length)throw new AggregateError(failures,`${failures.length} language browser scenarios failed`);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
