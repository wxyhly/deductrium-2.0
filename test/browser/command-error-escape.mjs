import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const server=createServer(async(req,res)=>{
    try {
        const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const file=resolve(root,'.'+(name==='/'?'/index.html':name));
        if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
        res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[extname(file)]||'application/octet-stream');
        res.end(await readFile(file));
    } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const results=[];
try {
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        for(const escape of ['keyboard','button']) {
            const context=await browser.newContext({viewport});
            const page=await context.newPage();
            const pageErrors=[];
            page.on('pageerror',e=>pageErrors.push(String(e)));
            await page.goto(`http://127.0.0.1:${server.address().port}/?creative`);
            await page.waitForFunction(()=>window.game?.hsLayer?.hilbertSystem);
            await page.locator('button[data-layer="D-layer"]').click();
            await page.evaluate(async()=>{
                const {HSParser}=await import('/js/hs/core/parser.js');
                const layer=window.game.hsLayer,hs=layer.hilbertSystem,p=new HSParser();
                hs.fromCmd([p.parse('d .i $p','cmd')]);hs.m('ss1');
                layer.ruleList.push({name:'ss1',uuid:0});
                hs.fromCmd(['d ss1 $q','name 1 ss1'].map(t=>p.parse(t,'cmd')));
                layer.propListView.refresh();layer.ruleListView.refresh();
                window.escapeProof={props:hs.props,step:hs.props[0],macro:hs.rules.get('ss1'),
                    snapshot:JSON.stringify(layer.serialize())};
            });
            const input=page.locator('#hs-cmd-input textarea');
            const state=()=>page.evaluate(()=>{
                const l=window.game.hsLayer,t=document.querySelector('#hs-cmd-input textarea');
                return {value:t.value,disabled:t.disabled,focused:document.activeElement===t,
                    error:document.querySelector('#cmd-error').style.display!=='none',
                    message:document.querySelector('#cmd-error').textContent,
                    prompt:document.querySelector('#cmd-prompt').textContent,
                    pending:l.cmdEngine.getCompletionContext(),
                    unchanged:l.hilbertSystem.props===window.escapeProof.props&&l.hilbertSystem.props[0]===window.escapeProof.step&&l.hilbertSystem.rules.get('ss1')===window.escapeProof.macro&&JSON.stringify(l.serialize())===window.escapeProof.snapshot};
            });
            await input.fill('del ss1');await input.press('Enter');
            assert.match((await state()).prompt,/1:.*2:/s);
            await input.fill('2');await input.press('Enter');
            const rejected=await state();
            assert.ok(rejected.error&&rejected.disabled&&rejected.unchanged,JSON.stringify(rejected));
            assert.match(rejected.message,/ss1/);
            assert.equal(rejected.pending.argumentCount,2);
            // A document-level fallback must not steal Escape from another editor.
            await page.evaluate(()=>{
                const other=document.createElement('input');other.id='escape-other-input';document.body.appendChild(other);
            });
            await page.locator('#escape-other-input').fill('keep my input');
            await page.locator('#escape-other-input').press('Escape');
            const outside=await state();
            assert.ok(outside.error&&outside.disabled&&outside.unchanged);
            assert.equal(outside.pending.argumentCount,2);
            assert.equal(await page.evaluate(()=>document.activeElement?.id),'escape-other-input');
            await page.evaluate(()=>document.querySelector('#escape-other-input').remove());
            // Force real keyboard delivery to body, as happens after disabling input.
            assert.equal(await page.evaluate(()=>document.activeElement.tagName),'BODY');
            if(escape==='keyboard')await page.keyboard.press('Escape');
            else await page.locator('#cmd-esc-btn').click();
            const recovered=await state();
            let retried=false;
            if(!recovered.disabled&&!recovered.error&&recovered.pending?.argumentCount===1) {
                assert.equal(recovered.value,'2');
                assert.equal(recovered.focused,true);
                assert.equal(recovered.unchanged,true);
                // Re-selecting the same macro rejects again, without losing the command.
                await input.press('Enter');assert.ok((await state()).error);
                if(escape==='keyboard')await page.keyboard.press('Escape');
                else await page.locator('#cmd-esc-btn').click();
                // A parse error is different: the choice was never collected.
                await input.fill('invalid choice');await input.press('Enter');
                assert.ok((await state()).error);
                if(escape==='keyboard')await page.keyboard.press('Escape');
                else await page.locator('#cmd-esc-btn').click();
                const parseRecovery=await state();
                assert.ok(!parseRecovery.error&&!parseRecovery.disabled&&parseRecovery.focused&&parseRecovery.unchanged);
                assert.equal(parseRecovery.value,'invalid choice');
                assert.equal(parseRecovery.pending.argumentCount,1);
                await input.fill('1');await input.press('Enter');
                assert.match((await state()).prompt,/y/i);
                await input.fill('n');await input.press('Enter');
                const cancelled=await state();
                assert.ok(!cancelled.error&&!cancelled.disabled&&!cancelled.pending&&cancelled.unchanged);
                // Restart, recover, then back up once more and edit the target itself.
                await input.fill('del ss1');await input.press('Enter');await input.fill('2');await input.press('Enter');
                if(escape==='keyboard')await page.keyboard.press('Escape');
                else await page.locator('#cmd-esc-btn').click();
                await input.press('Escape');
                assert.equal((await state()).pending.argumentCount,0);
                assert.equal((await state()).value,'ss1');
                await input.fill('1');await input.press('Enter');await input.fill('n');await input.press('Enter');
                assert.ok((await state()).unchanged);
                await input.fill('hyp $r');await input.press('Enter');
                assert.equal(await page.evaluate(()=>window.game.hsLayer.hilbertSystem.props.length),2);
                // Disposing the manager removes its document listener and editor callback.
                await page.evaluate(()=>{
                    const l=window.game.hsLayer;
                    window.disposedEscapes=0;l.cmdEngine.onIdleEscape=()=>{window.disposedEscapes++;return true;};
                    l.cmdUIMgr.destroy();
                });
                await input.press('Escape');
                assert.equal(await page.evaluate(()=>window.disposedEscapes),0);
                retried=true;
            }
            results.push({viewport,escape,rejected,recovered,retried,pageErrors});
            await context.close();
        }
    }
    console.log(JSON.stringify(results));
    assert.ok(results.every(r=>r.retried&&r.pageErrors.length===0),'Esc must recover the original command after dependency rejection');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
