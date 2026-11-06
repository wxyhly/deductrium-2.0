import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const server = createServer(async (req,res) => {
    try {
        const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const file = resolve(root,'.'+(name==='/'?'/index.html':name));
        if (!file.startsWith(root+sep)) {res.writeHead(403).end();return;}
        res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[extname(file)]||'application/octet-stream');
        res.end(await readFile(file));
    } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const module = process.env.PLAYWRIGHT_MODULE;
const {chromium} = await import(module ? pathToFileURL(module).href : 'playwright');
const browser = await chromium.launch({headless:true,channel:'chrome'});
try {
    for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        const context = await browser.newContext({viewport});
        const page = await context.newPage();
        const errors=[];
        page.on('pageerror', e=>errors.push(String(e)));
        await page.goto(`http://127.0.0.1:${server.address().port}/?creative`);
        await page.waitForFunction(()=>window.game?.hsLayer?.hilbertSystem);
        await page.locator('button[data-layer="D-layer"]').click();
        const results=await page.evaluate(async()=>{
            const {HSParser}=await import('/js/hs/core/parser.js');
            const {getCommand}=await import('/js/hs/gui/cmdmgr.js');
            const layer=window.game.hsLayer, hs=layer.hilbertSystem, engine=layer.cmdEngine;
            const parser=new HSParser();
            let checks=0;
            const check=(v,m)=>{if(!v)throw Error(m);checks++;};
            const run=async text=>{engine.run(text);await Promise.resolve();await Promise.resolve();};
            const prompt=()=>document.querySelector('#cmd-prompt').textContent;
            const error=()=>document.querySelector('#cmd-error').style.display!=='none';
            const snap=()=>layer.serialize();
            const fresh=structuredClone(snap());
            const reset=()=>{if(engine.isExecuting()) {engine.currentArgs=[];engine.handleEsc();}engine.handleEsc();layer.deserialize(structuredClone(fresh));};
            const raw=text=>hs.fromCmd(text.split(';').map(s=>parser.parse(s,'cmd')));
            const macro=(name,body='d .i $p')=>{raw(body);hs.m(name);layer.ruleList.push({name,uuid:0});layer.ruleListView.refresh();};
            check(parser.parse('del 1,2,3,4,sWellOrder','cmd').nodes[0].name==='1,2,3,4,sWellOrder','comma list parsed literally');
            check(parser.parse('rename "a folder" "new folder"','cmd').nodes.map(n=>n.name).join('|')==='a folder|new folder','quoted folder names');
            macro('zOne'); raw('d .i $p;name 1 zOne');layer.propListView.refresh();
            await run('inln zOne');check(prompt().includes('1:')&&prompt().includes('2:'),'inline collision choices: '+prompt()+' error='+document.querySelector('#cmd-error').textContent+' names='+[...hs.saveContext().flatProps.keys()]);
            await run('1');check(!engine.isExecuting()&&hs.props.length>1,'inline chosen step expanded');
            reset();macro('zOne');raw('d .i $p;name 1 zOne');layer.propListView.refresh();
            await run('inln zOne');await run('2');check(layer.sheetGui.sheets.length===2&&hs.props.length===1,'inline macro opens independent sheet');
            check(hs.rules.get('zOne').step[0]!==hs.props[0],'loaded macro is isolated');
            reset();macro('zOne');raw('d .i $q;name 1 zOne');layer.propListView.refresh();
            const before=JSON.stringify(snap());await run('del zOne,zOne');await run('1');
            check(prompt().includes('1:')&&prompt().includes('2:'),'each repeated name asks separately');await run('2');
            check(prompt().includes('1')&&prompt().includes('y')&&hs.rules.has('zOne')&&hs.props.length===1,'confirmation before mutation');
            await run('N');check(JSON.stringify(snap())===before,'uppercase N cancels entire batch');
            await run('del 1,zOne');await run('2');await run('Y');check(!hs.rules.has('zOne')&&hs.props.length===0,'uppercase Y deletes mixed batch');
            reset();macro('zOne');macro('zTwo','d zOne $q');raw('d zTwo $r');layer.propListView.refresh();
            const deps=JSON.stringify(snap());await run('del zOne');check(error()&&JSON.stringify(snap())===deps,'macro dependency blocks deletion');engine.handleEsc();engine.currentArgs=[];engine.handleEsc();
            await run('del 1,zTwo,zOne');check(!error()&&prompt().includes('y'),'internal batch dependencies allowed');await run('y');check(!hs.rules.has('zOne')&&!hs.rules.has('zTwo')&&!hs.props.length,'dependent batch deletes atomically');
            reset();macro('zOne');raw('d zOne $q');layer.propListView.refresh();
            await run('rename zOne zNew');check(hs.rules.has('zNew')&&!hs.rules.has('zOne')&&hs.props[0].from.data.deduction.name==='zNew','rename macro updates references');
            raw('dir zFolder');await run('rename zFolder zOther');check(hs.props.at(-1).name==='zOther','rename proof folder');
            layer.ruleList.push({name:'a folder',uuid:0,children:[]});layer.ruleListView.refresh();await run('rename "a folder" "new folder"');check(layer.ruleList.some(n=>n.name==='new folder'),'rename rule folder');
            layer.ruleList.push(...[1,2].map(()=>({name:'<b>shared</b>',uuid:0,children:[]})));layer.ruleListView.refresh();
            await run('rename "<b>shared</b>" safeName');check(prompt().includes('<b>shared</b>')&&!document.querySelector('#cmd-prompt b'),'duplicate folder prompt renders names as text');
            reset();macro('zOne');raw('d zOne $q');layer.propListView.refresh();
            const activeFolder={name:'inspection folder',uuid:0,children:[]};layer.ruleList.push(activeFolder);layer.ruleListView.refresh();
            layer.ruleListView.onMenuAction(activeFolder,'setActiveFolder');layer.ruleListView.expandedFolders.add(activeFolder.uuid);layer.ruleListView.refresh();
            const original=JSON.stringify(snap()),ctx=hs.saveContext();await run('entr 1');check(layer.navigator.active&&hs.props!==ctx.props,'entr applied proof');
            const sheetName=layer.sheetGui.sheets[0].name;layer.sheetGui.renameSheet(0,'blocked');
            check(layer.sheetGui.sheets[0].name===sheetName&&error(),'inspection protects sheet names');engine.handleEsc();await run('entr 1');
            document.querySelector(`#ruleList .toggle-icon[data-uuid="${activeFolder.uuid}"]`).click();
            check(activeFolder.active&&layer.activeRuleFolder===activeFolder&&layer.ruleListView.expandedFolders.has(activeFolder.uuid),'inspection preserves active rule folder when collapsing');
            check(JSON.stringify(snap())===original,'inspection never saved');await run('entr 1');check(layer.navigator.depth===2,'nested entr');
            const preview=hs.props;await run('del 1');check(error()&&hs.props===preview,'inspection rejects editing');engine.handleEsc();
            check(layer.navigator.depth===1,'Esc returns one proof level');engine.handleEsc();check(!layer.navigator.active&&hs.props===ctx.props,'Esc restores original context');
            check(JSON.stringify(snap())===original,'original save restored');
            reset();await run('del 1,,2');check(error()&&!hs.props.length,'malformed list rejected');engine.handleEsc();
            return {checks};
        });
        // Exercise the actual text editor and Enter handler as well as the command engine.
        await page.locator('#cmd-esc-btn').click();
        await page.locator('#hs-cmd-input textarea').fill('d .i $p');
        await page.locator('#cmd-ok-btn').click();
        await page.waitForFunction(()=>window.game.hsLayer.hilbertSystem.props.length===1);
        assert.deepEqual(errors,[]);
        console.log(JSON.stringify({viewport,...results,uiInput:true,pageErrors:errors}));
        await context.close();
    }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
