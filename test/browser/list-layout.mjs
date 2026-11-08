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
let browser;
try {
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
    browser=await chromium.launch({headless:true,channel:'chrome'});
    for(const width of [3772,1440,390]) for(const lang of ['zh','en']) {
        const context=await browser.newContext({viewport:{width,height:width===390?844:1000}});
        await context.addInitScript(lang=>localStorage.setItem('lang',lang),lang);
        const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
        try {
            await page.goto(origin+'/?creative');await page.waitForSelector('#loading.hide',{state:'attached'});
            await page.locator('button[data-layer="D-layer"]').click();
            await page.evaluate(async()=>{
                const {HSParser}=await import('/js/hs/core/parser.js');
                const parser=new HSParser;
                game.hsLayer.hilbertSystem.fromCmd(String.raw`hyp $1↔$2;<.<>1 1;m l;var x;var y;cond x⊂y;cond y⊂x;aext;<a4 5 x;<a4 6 y;<:l(d\c) 3 z;<:l(d\c) 4 z;var z;<a4 8 z;<a4 9 z;.<> 11 12;cd 4;mp 7 13;m qLayoutMixedSources`.split(';').map(text=>parser.parse(text,'cmd')));
                game.hsLayer.ruleList.push({name:'qLayoutMixedSources'});
                game.hsLayer.cmdEngine.run('.i $p;m zLongRuleNameUsedToCheckTheSourceColumnCanGrowWithoutAFixedWidth;zLongRuleNameUsedToCheckTheSourceColumnCanGrowWithoutAFixedWidth $p;.i $q;qLayoutMixedSources');
            });
            await page.waitForFunction(()=>!game.hsLayer.cmdEngine.isExecuting());
            await page.evaluate(()=>{
                const view=game.hsLayer.ruleListView;
                const expand=nodes=>{for(const node of nodes)if(node.children){if(!node.uuid)node.uuid=view.idCounter++;view.expandedFolders.add(node.uuid);expand(node.children);}};
                expand(game.hsLayer.ruleList);view.refresh();
            });
            const formulae=await page.locator('#propRows .cell-content').allTextContents();assert.ok(formulae.length>=2);
            assert.equal(await page.locator('#propRows .proof-tags').last().locator('.proof-tag').count(),4);
            for(const theme of ['light','dark']) {
                await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
                const metrics=await page.evaluate(()=>{
                    const rows=[...document.querySelectorAll('#ruleRows .item-row, #propRows .item-row')].filter(row=>row.querySelector('.proof-tag'));
                    const rect=node=>node.getBoundingClientRect();
                    const violations=rows.flatMap(row=>{
                        const extra=row.querySelector('.cell-extra'),source=rect(extra),main=rect(row.querySelector('.cell-content')),menu=rect(row.querySelector('.cell-actions')),bounds=rect(row);
                        const problems=[];
                        if(extra.scrollWidth>extra.clientWidth+1)problems.push('scrolling');
                        if(source.right>menu.left+1)problems.push('menu overlap');
                        if(main.width<=0)problems.push('no formula space');
                        if(source.width>bounds.width*.4+1)problems.push('source takes too much space');
                        if(menu.right<bounds.right-1)problems.push('menu left the row edge');
                        if(main.right>source.left+1)problems.push('formula overlap');
                        const badges=[...row.querySelectorAll('.proof-tag')];
                        if(innerWidth>=1000 && badges.some(badge=>Math.abs(rect(badge).top-rect(badges[0]).top)>1))problems.push('labels wrap on a wide row');
                        if(innerWidth>=1000 && extra.querySelector('.extra-text').getBoundingClientRect().height>28)problems.push('source wraps on a wide row');
                        for(const badge of row.querySelectorAll('.proof-tag')){
                            const b=rect(badge);if(b.left<source.left-1||b.right>source.right+1||b.bottom>source.bottom+1)problems.push('clipped label');
                        }
                        return problems.map(problem=>({problem,text:extra.textContent}));
                    });
                    const proof=[...document.querySelectorAll('#propRows .item-row')].filter(row=>row.querySelector('.proof-tag'));
                    return {violations, sources:proof.map(row=>row.querySelector('.cell-extra').textContent), widths:proof.map(row=>rect(row.querySelector('.cell-extra')).width),
                        formulaWidths:proof.map(row=>rect(row.querySelector('.cell-content')).width),
                        pageOverflow:document.documentElement.scrollWidth>innerWidth};
                });
                assert.deepEqual(metrics.violations,[]);assert.equal(metrics.pageOverflow,false);
                assert.ok(metrics.widths[0]>metrics.widths[1]+40, 'a long source grows beyond the short source width: '+JSON.stringify(metrics));
                assert.ok(metrics.formulaWidths[0]>=100,'the formula retains usable width');
                assert.deepEqual(await page.locator('#propRows .cell-content').allTextContents(),formulae);
                console.log(JSON.stringify({width,lang,theme,...metrics}));
            }
            // The old stylesheet addresses these four direct children. Their
            // structure must remain compatible when a browser keeps that CSS.
            assert.equal(await page.locator('#propRows .item-row:not(.drop-placeholder):not(.activePlaceholder)').evaluateAll(rows=>rows.every(row=>
                ['cell-name','cell-content','cell-extra','cell-actions'].every((name,index)=>row.children[index]?.classList.contains(name)))),true);
            assert.deepEqual(errors,[]);
        } finally {await context.close();}
    }
} finally {await browser?.close();await new Promise(r=>server.close(r));}
