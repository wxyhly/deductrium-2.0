// Normal index.html mounting, legacy saves, real movement and editor isolation.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(process.argv[2]||fileURLToPath(new URL('../..',import.meta.url)));
const manifest=JSON.parse(await readFile(resolve(root,'examples/intuitionistic-propositional.world.json'),'utf8'));
const tile=id=>manifest.tiles.find(tile=>tile.id===id);
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
// Seed only the starting tile. Every boundary crossing uses the real movement/collision chain.
const cross=(page,target)=>page.evaluate(async target=>{
    const {Hvec}=await import('/js/hy/algebra.js');
    const w=game.hyLayer.world,before=w.currentTile.join(',');
    const adjacent=Array.from({length:6},(_,i)=>i).some(i=>
        w.atlasTile.getNeighborAndDir(w.currentTile,i,true)[0].join(',')===target);
    if(!adjacent)throw Error(`Not adjacent: ${before} -> ${target}`);
    for(let n=0;n<160;n++){
        const rotor=w.atlasTile.rotors.get(target);
        if(!rotor)throw Error(`Missing neighbor rotor: ${target}`);
        const center=w.localCamMat.apply(rotor.apply(new Hvec())),length=Math.hypot(center.x,center.y);
        w.moveCam(center.x/length*.025,-center.y/length*.025);
        const at=w.currentTile.join(',');
        if(at===target)return n+1;
        if(at!==before)throw Error(`Unexpected destination: ${at}`);
    }
    throw Error(`No crossing: ${before} -> ${target}`);
},target);
let browser;
try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const {chromium}=await import(process.env.PLAYWRIGHT_MODULE
        ?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href:'playwright');
    browser=await chromium.launch({headless:true,channel:'chrome'});
    const origin=`http://127.0.0.1:${server.address().port}`;
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
        const context=await browser.newContext({viewport}),errors=[];
        context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
        try{
            const page=await context.newPage();await page.goto(origin+'/index.html');await ready(page);
            const initial=await page.evaluate(async manifest=>{
                const {blockMap,nameMap}=await import('/js/hy/maploader.js');
                return {key:game.saveload.saveKey,current:game.hyLayer.world.currentTile,
                    size:blockMap.size,entry: nameMap.get(`mod:${manifest.id}::entry`),
                    ipc:game.hsLayer.hilbertSystem.rules.has('a3i'),
                    main:structuredClone(blockMap.get(manifest.entry.mainHash))};
            },manifest);
            assert.equal(initial.key,'deductrium2_survival');assert.deepEqual(initial.current,[]);
            assert.equal(initial.size,2120+manifest.tiles.length);assert.equal(initial.entry,tile('entry').hash);
            assert.equal(initial.ipc,false,'IPC axioms require collecting their toolkit');
            // An actual pre-mod-shaped save: preserve main-world rewards, money and camera, with no script state.
            const old=await page.evaluate(async()=>{
                const {nameMap}=await import('/js/hy/maploader.js');
                game.hyLayer.world.hitTest(nameMap.get('neg').split(',').map(Number));
                game.parcoursDeductrium=17;
                const data=game.saveload.serialize();delete data.ms;
                const raw=LZString.compressToUTF16(JSON.stringify({version:0,mode:'survival',timestamp:1,data}));
                game.saveload.cancelPendingSave();localStorage.setItem('deductrium2_survival',raw);
                return {hy:data.hy,rw:data.rw,D:data.D};
            });
            await page.reload();await ready(page);
            assert.deepEqual(await page.evaluate(()=>{
                const data=game.saveload.serialize();return {hy:data.hy,rw:data.rw,D:data.D};
            }),old,'legacy main progress and position survive the built-in addition');
            assert.equal(await page.evaluate(()=>game.saveload.writesBlocked),false);
            await page.evaluate(async hash=>{
                const {Rotor}=await import('/js/hy/algebra.js'),w=game.hyLayer.world;
                w.currentTile=hash.split(',').map(Number);w.localCamMat=new Rotor();
                w.atlasTile.generateRotors(w.currentTile);
            },manifest.entry.mainHash);
            const outward=await cross(page,tile('entry').hash);
            const homeward=await cross(page,manifest.entry.mainHash);
            await cross(page,tile('entry').hash);await cross(page,tile('toolkit').hash);
            assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('a3i')),true);
            assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('a3')),true,
                'the main-world a3 reward remains usable');
            await page.locator('button[data-layer="D-layer"]').click();
            const field=page.locator('#hs-cmd-input textarea');
            await field.fill('d a1 P P;d a1 P (P→P);d a2 P (P→P) P;d mp 3 2;d mp 4 1');
            await page.locator('#cmd-ok-btn').click();
            assert.equal(await page.locator('#cmd-error').textContent(),'');
            await cross(page,tile('identity').hash);
            await page.evaluate(()=>{game.saveload.cancelPendingSave();game.saveload.save();});
            const saved=await page.evaluate(()=>({data:game.saveload.serialize(),at:game.hyLayer.world.currentTile}));
            await page.reload();await ready(page);
            assert.deepEqual(await page.evaluate(()=>game.hyLayer.world.currentTile),saved.at);
            assert.deepEqual(await page.evaluate(()=>game.saveload.serialize().ms),saved.data.ms);
            assert.equal(await page.evaluate(()=>game.hsLayer.hilbertSystem.rules.has('a3i')),true);
            assert.equal(await page.evaluate(async hash=>{
                const {blockMap}=await import('/js/hy/maploader.js');
                const block=blockMap.get(hash);
                return game.hyLayer.world.onPassGate(block.name??hash,block,hash);
            },tile('identity').hash),true,'saved constructive proof still passes the native #pi gate');
            const editor=await context.newPage();await editor.goto(origin+'/tools/map-editor/index.html');
            await editor.waitForFunction(()=>window.mapEditor);
            assert.equal(await editor.evaluate(async()=>{
                const {nameMap}=await import('/js/hy/maploader.js');
                return [...nameMap.keys()].some(name=>name.startsWith('mod:intuitionistic-propositional::'));
            }),false,'built-in mounting does not alter the editor official-base fixture');
            assert.deepEqual(errors,[]);
            console.log(JSON.stringify({viewport,normalIndex:'PASS',legacySave:'PASS',outward,homeward,
                toolkit:'PASS',nativeGate:'PASS',savedProgress:'PASS',editorIsolation:'PASS',errors}));
        }finally{await context.close();}
    }
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
