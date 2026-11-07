import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(process.argv[2]||fileURLToPath(new URL('../..',import.meta.url)));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const server=createServer(async(req,res)=>{
    try {
        const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
        if(!file.startsWith(root+sep)) {res.writeHead(403).end();return;}
        res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css'})[extname(file)]||'text/plain;charset=utf-8');
        res.end(await readFile(file));
    } catch {res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
const origin=`http://127.0.0.1:${server.address().port}`;
const tiles=[
    ['',{type:0,name:'entry',text:'Entry',data:{script:'give money 20;unlock layer D-layer;unlock reward neg;unlock reward macro;unlock reward hyp'}}],
    ['0',{type:3,name:'disable',text:'Restrict',data:{script:'disable axiom a3;give key red;set flag limited;set count trips 1'}}],
    ['1',{type:2,name:'keydoor',text:'Key',data:{script:'require key red;require flag limited;require count trips == 1;take key red;take money 3;enable axiom a3;open gate opened;set text sign "Done"'}}],
    ['2',{type:2,name:'proof',text:'(¬$p→¬$q)→($q→$p)',data:{p:true}}],
    ['3',{type:2,name:'opened',text:'Closed',data:{never:true}}],
    ['4',{type:0,name:'sign',text:'Original',data:{}}],
    ['5',{type:3,name:'latefail',text:'Denied',data:{getD:100,script:'give money 100;require key missing;give key nope'}}],
];
try {
    browser=await chromium.launch({headless:true,channel:'chrome'});
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(String(error)));
        await page.addInitScript(tiles=>{
            if(!localStorage.getItem('deductrium2_map_preview')) {
                localStorage.setItem('deductrium2_map_preview',JSON.stringify({tiles}));
                localStorage.setItem('deductrium2_survival','untouched-normal-save');
            }
        },tiles);
        await page.goto(origin+'/?map-editor-preview');
        await page.waitForFunction(()=>window.game?.saveload);
        const first=await page.evaluate(async()=>{
            const {getCommand}=await import('/js/hs/gui/cmdmgr.js');
            const {HSParser}=await import('/js/hs/core/parser.js');
            const {blockMap,nameMap}=await import('/js/hy/maploader.js');
            const parser=new HSParser(),game=window.game,hs=game.hsLayer,world=game.hyLayer.world;
            const hit=id=>world.hitTest(nameMap.get(id).split(',').map(Number));
            const exec=async text=>{const cmd=parser.parse(text,'cmd');await getCommand(cmd.name).execute(cmd.nodes);};
            const result={size:blockMap.size,initialMoney:game.deductrium};
            await exec('d a3 $p $q');await exec('m qSaved');await exec('d qSaved');
            await exec('d a1 ((¬$p→¬$q)→($q→$p)) $r');
            result.proofBefore=hit('proof');result.restrict=hit('disable');
            result.proofRestricted=hit('proof');
            const before=hs.hilbertSystem.props.slice();
            try {await exec('d qSaved');result.denied=false;} catch {result.denied=true;}
            try {await exec('d mp 2 1');result.conditionDenied=false;} catch {result.conditionDenied=true;}
            result.unchanged=before.length===hs.hilbertSystem.props.length&&before.every((p,i)=>p===hs.hilbertSystem.props[i]);
            result.failed=hit('latefail');result.moneyAfterFailure=game.deductrium;
            result.key=game.mapScript.keys.slice();result.disabled=game.mapScript.disabledAxioms.slice();
            game.saveload.save();return result;
        });
        assert.deepEqual(first,{size:7,initialMoney:20,proofBefore:true,restrict:true,proofRestricted:false,denied:true,conditionDenied:true,unchanged:true,failed:false,moneyAfterFailure:20,key:['red'],disabled:['a3']});
        await page.reload();await page.waitForFunction(()=>window.game?.saveload);
        const second=await page.evaluate(async()=>{
            const {blockMap,nameMap}=await import('/js/hy/maploader.js');
            const game=window.game,world=game.hyLayer.world;
            const hit=id=>world.hitTest(nameMap.get(id).split(',').map(Number));
            const restored={money:game.deductrium,keys:game.mapScript.keys.slice(),disabled:game.mapScript.disabledAxioms.slice(),proof:hit('proof')};
            const pass=hit('keydoor'),result={restored,pass,money:game.deductrium,keys:game.mapScript.keys.slice(),disabled:game.mapScript.disabledAxioms.slice(),proof:hit('proof'),opened:hit('opened'),text:blockMap.get(nameMap.get('sign')).text};
            game.saveload.save();return result;
        });
        assert.deepEqual(second,{restored:{money:20,keys:['red'],disabled:['a3'],proof:false},pass:true,money:17,keys:[],disabled:[],proof:true,opened:true,text:'Done'});
        await page.reload();await page.waitForFunction(()=>window.game?.saveload);
        assert.deepEqual(await page.evaluate(async()=>{
            const {blockMap,nameMap}=await import('/js/hy/maploader.js'),game=window.game;
            return {money:game.deductrium,keys:game.mapScript.keys,disabled:game.mapScript.disabledAxioms,
                gate:blockMap.get(nameMap.get('opened')).type,text:blockMap.get(nameMap.get('sign')).text,
                normal:localStorage.getItem('deductrium2_survival')};
        }),{money:17,keys:[],disabled:[],gate:0,text:'Done',normal:'untouched-normal-save'});
        assert.deepEqual(errors,[]);
        console.log(JSON.stringify({viewport,checks:'actual preview map, scripts, late rollback, disabled existing macro and proof, restore, unlock, keys, gate/text persistence, normal save isolation',errors}));
        await context.close();
    }
} finally {await browser?.close();await new Promise(done=>server.close(done));}
