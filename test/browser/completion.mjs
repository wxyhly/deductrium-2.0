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
        const page=await context.newPage();
        const errors=[];
        page.on('pageerror',e=>errors.push(String(e)));
        await page.goto(`http://127.0.0.1:${server.address().port}/?creative`);
        await page.waitForFunction(()=>window.game?.hsLayer?.hilbertSystem);
        await page.locator('button[data-layer="D-layer"]').click();
        const input=page.locator('#hs-cmd-input textarea');
        const list=page.locator('#hs-completions');
        const completionState=()=>page.evaluate(()=>{
            const l=window.game.hsLayer,el=document.querySelector('#hs-cmd-input textarea');
            return {value:el.value,normalized:l.cmdInput.getValue(),cursor:[el.selectionStart,el.selectionEnd],
                pending:l.cmdEngine.getCompletionContext(),candidates:[...document.querySelectorAll('#hs-completions li')].map(n=>n.textContent)};
        });
        let checks=0;
        const check=(v,m)=>{assert.ok(v,m);checks++;};
        const state=()=>page.evaluate(()=>{
            const l=window.game.hsLayer;
            return {props:l.hilbertSystem.props.length,executing:l.cmdEngine.isExecuting(),rules:l.hilbertSystem.rules.size,error:document.querySelector('#cmd-error').textContent};
        });
        const reset=()=>page.evaluate(()=>{
            const l=window.game.hsLayer;
            l.cmdEngine.currentArgs=[];l.cmdEngine.handleEsc();l.cmdEngine.handleEsc();
            l.hilbertSystem.loadContext(l.hilbertSystem.createEmptyContext());l.propListView.refresh();
            l.cmdInput.setValue('');
        });
        await page.evaluate(async()=>{
            const layer=window.game.hsLayer,{HSParser}=await import('/js/hs/core/parser.js'),parser=new HSParser();
            layer.hilbertSystem.fromCmd([parser.parse('d .i $p','cmd')]);layer.hilbertSystem.m('ss1');
            layer.hilbertSystem.fromCmd(['d ss1 $p','name 1 ss1'].map(text=>parser.parse(text,'cmd')));
            layer.ruleList.push({name:'ss1',uuid:0});layer.ruleListView.refresh();layer.propListView.refresh();
        });
        for(const command of ['del','rename','inln','entr']) {
            await input.fill(command+' ss1');
            const labels=await list.locator('.completion-name').allTextContents();
            check(labels.length===2&&labels[0]==='[P] ss1'&&labels[1]==='[D] ss1',command+' preserves same-named proof and macro as separate candidates');
        }
        for(const kind of ['P','D']) {
            await input.fill('del ss1');
            await list.locator('li').filter({hasText:'['+kind+'] ss1'}).click();
            check((await state()).executing&&/1:.*2:/s.test(await page.locator('#cmd-prompt').textContent()),kind+' candidate retains explicit ambiguity selection');
            await reset();
            if(kind==='P') await page.evaluate(async()=>{
                const layer=window.game.hsLayer,{HSParser}=await import('/js/hs/core/parser.js'),parser=new HSParser();
                layer.hilbertSystem.fromCmd(['d .i $p','name 1 ss1'].map(text=>parser.parse(text,'cmd')));layer.propListView.refresh();
            });
        }
        await page.evaluate(()=>{
            const layer=window.game.hsLayer;layer.hilbertSystem.rules.delete('ss1');layer.ruleList.splice(layer.ruleList.findIndex(node=>node.name==='ss1'),1);layer.ruleListView.refresh();
        });
        // Typing a replacement-trigger character must not discard intervening
        // whitespace from the editor's token-based normalization.
        for (const command of ['del', 'inln', 'entr', 'rename']) {
            await input.fill(command);
            for (let i=0;i<12;i++) await input.press('Space');
            check((await completionState()).normalized===command+' '.repeat(12),command+' retains spaces without an argument');
            await input.press('s');
            const typed=await completionState();
            check(typed.value===command+' '.repeat(12)+'s'&&typed.normalized===typed.value,command+' retains spaces when s triggers normalization');
            check(typed.cursor[0]===command.length+13&&typed.cursor[1]===typed.cursor[0],command+' retains the insertion cursor');
        }
        await input.fill('a');
        check(await list.isVisible(),'input displays candidates');
        const rulePreview=list.locator('li').filter({hasText:'[D] a1'}).first();
        check(await rulePreview.locator('.completion-hint .token-replvar-wff').count()>0,'rule preview uses formula token highlighting');
        check(await rulePreview.locator('.completion-name .token-rule-axiom').count()>0,'candidate rule name uses rule highlighting');
        check(await rulePreview.locator('.completion-hint .token-replvar-wff').first().evaluate(el=>getComputedStyle(el).color)==='rgb(252, 93, 73)','preview uses the existing token palette');
        await input.press('ArrowDown');await input.press('ArrowDown');
        await input.press('Tab');
        check(await input.inputValue()==='a2','arrows select, Tab fills without executing');
        check(!(await state()).executing&&(await state()).props===0,'Tab preserves engine/proof');
        check(await input.evaluate(el=>el===document.activeElement),'Tab retains input focus');
        await input.fill('a');await input.press('ArrowUp');
        const selected=await page.locator('#hs-completions .active').textContent();
        await input.press('Tab');
        check(selected.includes(await input.inputValue()),'ArrowUp wraps to last candidate');
        await input.fill('a');
        const shiftAllowed=await input.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',shiftKey:true,bubbles:true,cancelable:true})));
        check(shiftAllowed,'Shift arrows preserve text selection');
        await input.fill('entr a');
        check(!(await list.isVisible()),'inspection excludes primitive axioms');
        await input.fill('entr ca');await input.press('Tab');
        check(await input.inputValue()==='entr ca1','inspection completes derived rules without generation');
        const beforeFiltered=await state();
        for (const command of ['entr','inln']) {
            for (const prefix of ['va1','ea1','ua1','>a1','v(a1','e(a1','u(a1','>(a1']) {
                await input.fill(command+' '+prefix);
                check(!(await list.isVisible()),command+' excludes unsupported derived target '+prefix);
            }
        }
        check((await state()).rules===beforeFiltered.rules&&(await state()).props===beforeFiltered.props,'derived filtering preserves rules and proof');
        await input.fill('d .i');await input.press('Tab');
        check(await input.inputValue()==='d .i','explicit deduction name completed');
        await input.press('Enter');
        check((await state()).executing,'Enter executes accepted rule and prompts for formula');
        await input.fill('a');
        check(!(await list.isVisible()),'formula prompt has no rule suggestions');
        await input.fill('$p');await input.press('Enter');
        check((await state()).props===1&&!(await state()).executing,'formula parameter executes normally');
        await input.fill('del 1');
        check(await list.locator('.completion-hint .token-replvar-wff').count()>0,'proof target preview highlights its formula');
        await reset();
        await input.fill('hy');
        check(await list.locator('.completion-name .token-cmd').count()>0,'command candidate name uses command highlighting');
        await input.fill('.i');
        const formulaBox=await list.locator('.completion-hint').first().boundingBox();
        await page.mouse.click(formulaBox.x+formulaBox.width/2,formulaBox.y+formulaBox.height/2);
        check((await state()).executing&&(await input.inputValue())==='$'&&(await completionState()).pending.argumentCount===1,'clicking highlighted preview selects the candidate without inserting formula fragments');
        await reset();
        await input.fill('a');await input.press('ArrowDown');await input.press('Enter');
        check((await state()).executing,'Enter accepts selected candidate and executes it');
        await reset();
        await input.fill('d');await input.press('Enter');await input.fill('a');await input.press('Tab');
        check(await input.inputValue()==='a1'&&(await state()).executing,'interactive d name prompt completes');
        await reset();
        const original=await state();
        for (const prefix of ['d ca','d vc<a','d c(a','d mp(#,a']) {
            await input.fill(prefix);await input.press('Tab');
            check((await input.inputValue()).endsWith('a1'),'meta prefix/composition '+prefix);
        }
        check((await state()).rules===original.rules&&(await state()).props===0,'suggestions never generate rules');
        await input.fill('d .i $p;\nd a $q');
        await input.evaluate(el=>el.setSelectionRange(13,13));
        // Put the caret just after the final rule prefix, before the following parameter.
        await input.evaluate(el=>{const n=el.value.lastIndexOf('a')+1;el.setSelectionRange(n,n);});
        await input.press('Tab');
        check(await input.inputValue()==='d .i $p;\nd a1 $q','cursor insertion preserves preceding commands and later parameters');
        await reset();
        await page.evaluate(async()=>{
            const l=window.game.hsLayer,{HSParser}=await import('/js/hs/core/parser.js');
            l.hilbertSystem.fromCmd([new HSParser().parse('d .i $p','cmd')]);
            l.hilbertSystem.m('zTabMacro');
            l.hilbertSystem.f(new HSParser().parse('tabBox','item'));l.hilbertSystem.pop();
            l.ruleList.push({name:'zTabMacro',uuid:0},{name:'my folder',uuid:0,children:[]},
                {name:'escape"folder\\tail',uuid:0,children:[]});
            l.ruleListView.refresh();l.propListView.refresh();
        });
        await input.fill('entr tabB');
        check(!(await list.isVisible()),'inspection excludes named proof folder');
        await input.fill('inln tabB');await input.press('Tab');
        check(await input.inputValue()==='inln tabBox','inline completes named proof folder');
        await input.press('Enter');
        check((await state()).props===0&&!(await state()).executing,'inline executes completed proof folder');
        await input.fill('ZTa');await input.press('Tab');
        check(await input.inputValue()==='zTabMacro','case insensitive custom macro completion');
        await input.fill('del 1,zTa');await input.press('Tab');
        check(await input.inputValue()==='del 1,zTabMacro','mixed deletion list completes current target: '+await input.inputValue()+' '+await list.textContent());
        check(!(await state()).executing,'deletion completion does not trigger confirmation');
        await input.fill('rename "my f');await input.press('Tab');
        check(await input.inputValue()==='rename "my folder"','quoted folder name completion');
        const escapedName='escape"folder\\tail';
        const escapedToken=JSON.stringify(escapedName);
        const fullRename='rename '+escapedToken+' "escaped full result"';
        await input.fill(fullRename);
        await input.evaluate(el=>{const cursor='rename "escape'.length;el.setSelectionRange(cursor,cursor);});
        await input.press('Tab');
        check(await input.inputValue()===fullRename,'full rename cursor replaces entire escaped token');
        await input.press('Enter');
        check(await page.evaluate(()=>window.game.hsLayer.ruleList.some(n=>n.children&&n.name==='escaped full result')),'full completed escaped name resolves and renames');
        await page.evaluate(()=>{
            const l=window.game.hsLayer;
            l.ruleList.push({name:'prompt"folder\\tail',uuid:0,children:[]});l.ruleListView.refresh();
        });
        await input.fill('rename');await input.press('Enter');
        const promptToken=JSON.stringify('prompt"folder\\tail');
        await input.fill(promptToken);
        await input.evaluate(el=>{const cursor='"prompt'.length;el.setSelectionRange(cursor,cursor);});
        const promptBefore=await completionState();
        check(promptBefore.normalized===promptToken&&promptBefore.candidates.length>0,'literal prompt preserves raw escaped input and finds candidates: '+JSON.stringify(promptBefore));
        await input.press('Tab');
        check(await input.inputValue()===promptToken,'prompt cursor replaces entire escaped token: '+JSON.stringify({expected:promptToken,before:promptBefore,after:await completionState()}));
        await input.press('Enter');
        const literalNewName='  "escaped prompt result"  ';
        await input.fill(literalNewName);
        check((await completionState()).normalized===literalNewName,'new-name prompt preserves leading and trailing whitespace');
        await input.press('Enter');
        check(await page.evaluate(()=>window.game.hsLayer.ruleList.some(n=>n.children&&n.name==='escaped prompt result')),'interactive escaped target resolves and renames');
        await input.fill('rename');await input.press('Enter');
        await input.fill('"my f');await input.press('Tab');await input.press('Enter');
        await input.fill('"my renamed folder"');await input.press('Enter');
        check(await page.evaluate(()=>window.game.hsLayer.ruleList.some(n=>n.children&&n.name==='my renamed folder')),'interactive rename accepts completed quoted folder');
        await input.fill('rename zTabMacro zN');
        check(!(await list.isVisible()),'rename new-name parameter never completed');
        await input.fill('d .i $p');await input.press('Enter');
        await input.fill('m');await input.press('Enter');await input.fill('z');
        check(!(await list.isVisible()),'new macro name prompt never completed');
        await reset();
        await input.fill('en');await list.locator('li').filter({hasText:'[C] entr'}).click();
        check(await input.inputValue()==='entr'&&!(await state()).executing,'clicking command only inserts command');
        await input.fill('d a');await list.locator('li').first().click();
        check((await state()).executing,'clicking rule executes and prompts like 1.0');
        await reset();
        await input.fill('a');
        await input.dispatchEvent('compositionstart');
        check(!(await list.isVisible()),'IME composition hides candidates');
        await input.dispatchEvent('keydown',{key:'Tab',isComposing:true});
        check(await input.inputValue()==='a','IME Tab leaves input unchanged');
        await input.dispatchEvent('compositionend');
        check(await list.isVisible(),'IME completion restores suggestions');
        await input.press('Escape');
        check(!(await list.isVisible()),'Escape dismisses list and follows command cancellation');
        await input.fill('a');await input.press('Shift+Tab');
        check(!(await list.isVisible()),'backwards focus traversal dismisses list');
        await input.fill('a');
        const rect=await list.boundingBox();
        check(rect.x>=0&&rect.x+rect.width<=viewport.width+1&&rect.y>=0,'candidate popup fits viewport');
        await input.fill('a');await page.locator('button[data-layer="P-layer"]').click();
        check(!(await list.isVisible()),'blur hides suggestions');
        assert.deepEqual(errors,[]);
        console.log(JSON.stringify({viewport,checks,pageErrors:errors}));
        await context.close();
    }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
