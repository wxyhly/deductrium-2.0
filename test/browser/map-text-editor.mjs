import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp} from 'node:fs/promises';
import {resolve, extname, sep, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root = resolve(process.argv[2] || fileURLToPath(new URL('../..',import.meta.url)));
const server = createServer(async (req,res)=>{
    try {
        const path = resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
        if(!path.startsWith(root+sep)) {res.writeHead(403).end();return;}
        res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[extname(path)]||'text/plain;charset=utf-8');
        res.end(await readFile(path));
    } catch {res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless:true,channel:'chrome'});
const origin = `http://127.0.0.1:${server.address().port}`, screenshots = await mkdtemp(join(tmpdir(),'deductrium-map-editor-'));
try {
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        const context = await browser.newContext({viewport,acceptDownloads:true}); const page = await context.newPage(), errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(origin+'/tools/map-text-editor/index.html'); await page.waitForFunction(()=>window.mapTextEditor);
        assert.ok(await page.locator('.tile-row').count()>100);
        const original = await page.evaluate(()=>({id:mapTextEditor.selected.id,source:mapTextEditor.document.source,values:mapTextEditor.document.values(mapTextEditor.selected.id)}));
        assert.equal(await page.locator('#text-zh').inputValue(),original.values.zh);
        // Real edits, source-safe special syntax, automatic draft restoration.
        const text = '人工修改的提示\n保留 [en] [n] [p] 字面文字\n` ${literal} \\ 😀末尾\\';
        await page.locator('#text-zh').fill(text); await page.locator('#text-en').fill('Edited English\nSecond line');
        assert.equal(await page.locator('#preview').textContent(),text);
        assert.match(await page.locator('#dirty-count').textContent(),/^1 格/);
        await page.reload(); await page.waitForFunction(()=>window.mapTextEditor);
        assert.equal(await page.locator('#text-zh').inputValue(),text);
        await page.locator('#filter').selectOption('edited'); assert.equal(await page.locator('.tile-row').count(),1);
        // Download a complete source file and reimport it through the actual upload control.
        const sourceEvent = page.waitForEvent('download'); await page.locator('#export').click(); const exported = await sourceEvent;
        const exportedText = await readFile(await exported.path(),'utf8'); assert.ok(exportedText.startsWith('export const mapData'));
        assert.notEqual(exportedText,original.source);
        const projectEvent = page.waitForEvent('download'); await page.locator('#save-draft').click(); const projectFile = await projectEvent;
        const projectText = await readFile(await projectFile.path(),'utf8'); assert.equal(JSON.parse(projectText).edits.length,1);
        page.on('dialog',dialog=>dialog.accept());
        await page.locator('#file').setInputFiles({name:'map.ts',mimeType:'text/plain',buffer:Buffer.from(exportedText)});
        await page.waitForFunction(()=>mapTextEditor.document.edits.size===0);
        assert.equal(await page.locator('#text-zh').inputValue(),text);
        await page.locator('#file').setInputFiles({name:'map-text-draft.json',mimeType:'application/json',buffer:Buffer.from(projectText)});
        await page.waitForFunction(()=>mapTextEditor.document.edits.size===1);
        assert.equal(await page.locator('#text-en').inputValue(),'Edited English\nSecond line');
        const state = await page.evaluate(()=>mapTextEditor.document.exportSource());
        await page.locator('#file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"format":"wrong","source":"oops"}')});
        await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('导入失败'));
        assert.equal(await page.evaluate(()=>mapTextEditor.document.exportSource()),state);
        // Search and jump to a remote tile; then click an actual neighboring tile on the canvas.
        await page.locator('#filter').selectOption('hints'); await page.locator('#search').fill('推理规则');
        assert.ok(await page.locator('.tile-row').count()>0); await page.locator('.tile-row').first().click();
        const remote = await page.evaluate(()=>mapTextEditor.selected.hash);
        assert.equal(await page.evaluate(()=>mapTextEditor.world.currentTile.join(',')),remote);
        await page.locator('#search').fill('');
        await page.locator('#map').scrollIntoViewIfNeeded();
        const target = await page.evaluate(async()=>{
            const {Hvec} = await import('/js/hy/algebra.js'), e = mapTextEditor, canvas=document.getElementById('map'), rect=canvas.getBoundingClientRect();
            for(const [hash,r] of e.world.atlasTile.rotors) {
                if(hash===e.selected.hash)continue;
                const block=e.document.tiles.get(hash); if(!block?.id||!Object.values(e.document.values(block.id)).some(Boolean))continue;
                const p=e.world.localCamMat.mul(r).apply(new Hvec); if(p.z>8)continue;
                const scale=e.world.localDraw.scale/(p.z+1)*Math.min(rect.width,rect.height)/2;
                return {id:block.id,x:rect.x+rect.width/2+p.x*scale,y:rect.y+rect.height/2+p.y*scale};
            }
        });
        assert.ok(target); await page.mouse.click(target.x,target.y); assert.equal(await page.evaluate(()=>mapTextEditor.selected.id),target.id,JSON.stringify({target,diagnostic:await page.evaluate(()=>({status:document.getElementById('status').textContent,rect:document.getElementById('map').getBoundingClientRect().toJSON(),height:innerHeight,at:document.elementFromPoint(...[100,500])?.tagName}))}));
        const camBefore=await page.evaluate(()=>JSON.stringify(mapTextEditor.world.localCamMat)); const box=await page.locator('#map').boundingBox();
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+20,{steps:6}); await page.mouse.up();
        assert.notEqual(await page.evaluate(()=>JSON.stringify(mapTextEditor.world.localCamMat)),camBefore);
        // The original proposal is optional and is applied only by the explicit button.
        await page.locator('#search').fill('表中推理规则'); await page.locator('.tile-row').first().click();
        assert.equal(await page.locator('#suggestion').isVisible(),true);
        const expected=await page.locator('#suggestion-text').textContent(); await page.locator('#use-suggestion').click();
        assert.equal(await page.locator('#text-zh').inputValue(),expected);
        await page.locator('#reset').click(); assert.notEqual(await page.locator('#text-zh').inputValue(),expected);
        // Change-reference table stays searchable and displays literal command characters.
        await page.locator('#changes-tab').click(); assert.ok(await page.locator('#changes-body tr').count()>=20);
        await page.locator('#changes-search').fill('entr'); assert.ok(await page.locator('#changes-body tr').count()>0);
        await page.locator('#changes-search').fill(''); await page.screenshot({path:join(screenshots,`changes-${viewport.width}.png`),fullPage:false});
        await page.locator('#edit-tab').click(); await page.locator('#search').fill('表中推理规则');
        await page.screenshot({path:join(screenshots,`editor-${viewport.width}.png`),fullPage:false});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
        assert.deepEqual(errors,[]); console.log(JSON.stringify({viewport,checks:'edit, recovery, full export, project export/import, rejected import, search, jump, canvas click/drag, suggestion/reset, reference table, layout',errors}));
        await context.close();
    }
    const context=await browser.newContext(); await context.addInitScript(()=>{Storage.prototype.setItem=function(){throw Error('blocked storage');};});
    const page=await context.newPage(); await page.goto(origin+'/tools/map-text-editor/index.html'); await page.waitForFunction(()=>window.mapTextEditor);
    await page.locator('#text-zh').fill('不能暂存，但仍可导出'); assert.match(await page.locator('#draft-status').textContent(),/不可用/);
    const downloadEvent=page.waitForEvent('download'); await page.locator('#save-draft').click(); assert.ok(await (await downloadEvent).path()); await context.close();
    console.log('PASS blocked storage export; screenshots: '+screenshots);
    const recovery=await browser.newContext(), recoveryPage=await recovery.newPage();
    recoveryPage.on('dialog',dialog=>dialog.accept());
    await recoveryPage.goto(origin+'/tools/map-text-editor/index.html'); await recoveryPage.waitForFunction(()=>window.mapTextEditor);
    const bad=await recoveryPage.evaluate(()=>{
        const e=mapTextEditor, project=e.document.project();
        project.edits=[{id:e.selected.id,values:{zh:'原有人工修改',en:'Saved'}},{id:'missing-row',values:{zh:'bad'}}];
        const key=`deductrium-map-text-editor-v1:${e.document.fingerprint}`, raw=JSON.stringify(project);
        localStorage.setItem(key,raw);return {key,raw};
    });
    await recoveryPage.reload(); await recoveryPage.waitForFunction(()=>window.mapTextEditor);
    assert.match(await recoveryPage.locator('#status').textContent(),/旧草稿未能恢复/);
    assert.equal(await recoveryPage.evaluate(key=>localStorage.getItem(key),bad.key),bad.raw);
    const oldEvent=recoveryPage.waitForEvent('download'); await recoveryPage.locator('#recover-draft').click();
    assert.equal(await readFile(await (await oldEvent).path(),'utf8'),bad.raw);
    await recoveryPage.locator('#text-zh').fill('本次继续编辑');
    assert.equal(await recoveryPage.evaluate(key=>localStorage.getItem(key),bad.key),bad.raw);
    const newEvent=recoveryPage.waitForEvent('download'); await recoveryPage.locator('#save-draft').click();
    const newDraft=JSON.parse(await readFile(await (await newEvent).path(),'utf8'));
    assert.equal(newDraft.edits[0].values.zh,'本次继续编辑');
    await recovery.close();
    const invalid=await browser.newContext(), invalidPage=await invalid.newPage();
    await invalidPage.goto(origin+'/tools/map-text-editor/index.html'); await invalidPage.waitForFunction(()=>window.mapTextEditor);
    await invalidPage.locator('#text-zh').fill('保留反斜杠\\\n下一行');
    assert.equal(await invalidPage.locator('#export').isDisabled(),true);
    assert.match(await invalidPage.locator('#status').textContent(),/地图格式无法保留/);
    await invalidPage.reload(); await invalidPage.waitForFunction(()=>window.mapTextEditor);
    assert.equal(await invalidPage.locator('#text-zh').inputValue(),'保留反斜杠\\\n下一行');
    assert.equal(await invalidPage.locator('#export').isDisabled(),true);
    const invalidEvent=invalidPage.waitForEvent('download'); await invalidPage.locator('#save-draft').click();
    assert.ok(await (await invalidEvent).path());
    await invalidPage.locator('#text-zh').fill('修正后的文字'); assert.equal(await invalidPage.locator('#export').isDisabled(),false);
    invalidPage.on('dialog',dialog=>dialog.accept());
    await invalidPage.locator('#file').setInputFiles({name:'map.ts',mimeType:'text/plain',buffer:Buffer.from('export const mapData = `\n|墙上的文字\n`;')});
    await invalidPage.waitForFunction(()=>mapTextEditor.selected?.type===1);
    assert.equal(await invalidPage.locator('textarea').inputValue(),'墙上的文字');
    await invalidPage.locator('#file').setInputFiles({name:'map.ts',mimeType:'text/plain',buffer:Buffer.from('export const mapData = `\n`;')});
    await invalidPage.waitForFunction(()=>mapTextEditor.document.records.length===0);
    assert.equal(await invalidPage.locator('textarea').count(),0); assert.equal(await invalidPage.locator('#add-language').isDisabled(),true);
    await invalid.close(); console.log('PASS failed recovery retention and unsupported syntax draft protection');
} finally {await browser.close(); await new Promise(done=>server.close(done));}
