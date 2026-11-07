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
        const context=await browser.newContext({viewport});
        const page=await context.newPage(),errors=[];
        page.on('pageerror',e=>errors.push(String(e)));
        await page.addInitScript(()=>{if(!localStorage.getItem('lang'))localStorage.setItem('lang','zh');});
        const url=`http://127.0.0.1:${server.address().port}`;
        await page.goto(url+'/?creative');
        await page.waitForFunction(()=>window.game?.hsLayer?.hilbertSystem);
        assert.equal(await page.evaluate(()=>{
            const l=window.game.hsLayer;
            return l.serialize().rbi?.length===l.hilbertSystem.rules.size;
        }),true,'fresh creative games record builtin identities');
        const old=await page.evaluate(async()=>{
            const {initialCreativeRules}=await import('/js/hs/core/initial.js');
            const {numberRules}=await import('/js/hs/core/number/rules.js');
            const {HSParser}=await import('/js/hs/core/parser.js');
            const g=window.game,l=g.hsLayer,h=l.hilbertSystem;
            l.serde.deserializeRulelist(initialCreativeRules.slice(0,-numberRules.length));
            l.addRules('qKept:⊢$p→$p;.i $p;');
            const node=l.ruleList.pop(),folder=l.ruleList[0];
            folder.children.push(node);folder.name='My logic';
            l.ruleListView.expandedFolders.add(folder.uuid);
            h.fromCmd([new HSParser().parse('d qKept $q','cmd')]);
            l.getSheetGui().sheets[0].name='Keep sheet';
            g.saveload.save();
            const raw=JSON.parse(LZString.decompressFromUTF16(localStorage.getItem('deductrium2_creative')));
            raw.data.hs.r=raw.data.hs.r.replace(/^(\(\d+\))\.i:.*$/m,'$1.i:⊢$1→$1;missingOldRule;');
            localStorage.setItem('deductrium2_creative',LZString.compressToUTF16(JSON.stringify(raw)));
            return {folder:folder.uuid,macro:node.uuid};
        });
        await page.reload();await page.waitForFunction(()=>window.game?.hsLayer?.hilbertSystem);
        await page.locator('button[data-layer="D-layer"]').click();
        const first=await page.evaluate(old=>{
            const g=window.game,l=g.hsLayer,h=l.hilbertSystem;
            const check=(v,m)=>{if(!v)throw Error(m);};
            check(l.ruleList.some(n=>n.name==='皮亚诺算数'),'Peano folder');
            const numbers=l.ruleList.find(n=>n.name==='数系');
            check(numbers.children.map(n=>n.name).join(',')==='自然数,整数,有理数,实数','number folders');
            check(![...h.rules.values()].some(r=>r.error),'current builtins and users replay');
            check(h.rules.get('.i').step.length>0,'stale builtin replaced');
            check(h.rules.get('qKept').step.length>0,'user proof kept');
            check(h.props.at(-1).ast.toString()==='$q→$q','saved sheet restored');
            check(l.ruleList[0].name==='My logic'&&l.ruleList[0].uuid===old.folder,'folder identity kept');
            check(l.ruleList[0].children.some(n=>n.name==='qKept'&&n.uuid===old.macro),'user macro node kept');
            l.addRules('qInside:⊢$r→$r;.i $r;');
            const node=l.ruleList.pop();numbers.children[0].children.push(node);
            g.saveload.save();
            return g.saveload.serialize();
        },old);
        assert.ok((await page.locator('#ruleList').textContent()).includes('皮亚诺算数'));
        assert.ok((await page.locator('#ruleList').textContent()).includes('数系'));
        const switched=await page.evaluate(first=>{
            const g=window.game,l=g.hsLayer;
            const pkg={version:0,mode:'creative',timestamp:Date.now(),data:structuredClone(first)};
            pkg.data.hs.r=pkg.data.hs.r.replace(/^(\(\d+\))\.i:.*$/m,'$1.i:⊢$1→$1;missingAgain;');
            if(!g.saveload.loadFromString(LZString.compressToUTF16(JSON.stringify(pkg))))throw Error('slot load');
            const h=l.hilbertSystem;
            if([...h.rules.values()].some(r=>r.error))throw Error('every load refresh');
            if(!l.ruleList.find(n=>n.name==='数系').children[0].children.some(n=>n.name==='qInside'))throw Error('user within builtin folder lost');
            g.saveload.save();return g.saveload.serialize();
        },first);
        assert.deepEqual(switched,first,'same-page reload preserves tree and proof sheets');
        await page.reload();await page.waitForFunction(()=>window.game?.hsLayer?.hilbertSystem);
        assert.deepEqual(await page.evaluate(()=>window.game.saveload.serialize()),first,'subsequent startup remains stable');
        await page.evaluate(()=>{localStorage.setItem('lang','en');});
        await page.reload();await page.waitForFunction(()=>window.game?.hsLayer?.hilbertSystem);
        assert.deepEqual(await page.evaluate(()=>window.game.saveload.serialize()),first,'language switch keeps existing folders');
        assert.deepEqual(errors,[]);
        await context.close();
        const survival=await browser.newContext({viewport}),sp=await survival.newPage();
        await sp.goto(url);await sp.waitForFunction(()=>window.game?.hsLayer?.hilbertSystem);
        assert.equal(await sp.evaluate(()=>window.game.hsLayer.hilbertSystem.rules.has('apn1')),false,'survival stays locked');
        await survival.close();
        console.log(JSON.stringify({viewport,legacyRefresh:true,userWithinBuiltinKept:true,repeatRefresh:true,proofsKept:true,languageStable:true,survivalIsolated:true,errors}));
    }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
