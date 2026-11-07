// Run: node test/browser/map-script-editor.mjs [repository root]
// Uses generated js/ as-is. PLAYWRIGHT_MODULE selects an installed Playwright.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp} from 'node:fs/promises';
import {resolve, extname, sep, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../..', import.meta.url)));
const fixture = {
    format:'deductrium-map-project-v1', id:'script-editor-browser', title:'Script editing regression',
    version:1, tiling:{p:6,q:4}, tiles:[
        {id:'first',hash:'',type:0,name:'entry',text:{zh:'第一格',en:'First tile'},
            data:{script:'message "第一格"\nrequire tile door == road', unknown:{keep:true}}},
        {id:'second',hash:'3',type:0,name:'door',text:'Second tile',data:{script:'message "第二格"'}},
    ], modules:[], instances:[],
};
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(root + sep)) {res.writeHead(403).end();return;}
        res.setHeader('Content-Type', ({'.js':'text/javascript','.mjs':'text/javascript',
            '.html':'text/html','.css':'text/css','.json':'application/json'})[extname(file)] || 'text/plain;charset=utf-8');
        res.end(await readFile(file));
    } catch {res.writeHead(404).end();}
});
const snapshot = page => page.evaluate(() => ({json:mapEditor.project.toJSON(),
    undo:mapEditor.project._undo.length,redo:mapEditor.project._redo.length}));
const field = page => page.locator('#tile-script');
const menu = page => page.locator('#script-completions');
const options = page => menu(page).getByRole('option');
const labels = page => options(page).locator(':scope > span').allTextContents();
const active = page => field(page).getAttribute('aria-activedescendant');
const ready = async page => {
    await page.waitForFunction(() => window.mapEditor || !document.getElementById('fatal').hidden);
    assert.equal(await page.locator('#fatal').isVisible(), false, await page.locator('#fatal').textContent());
    await page.waitForSelector('#script-completions', {state:'attached'});
};
const openEditor = async page => {
    if (await page.locator('#task-panel').isVisible()) await page.locator('#close-panel').click();
    if (page.viewportSize().width <= 700 && await page.locator('#toggle-inspector').getAttribute('aria-expanded') !== 'true')
        await page.locator('#toggle-inspector').click();
    if (!await page.locator('#script-section').evaluate(element => element.open))
        await page.locator('#script-section > summary').click();
    await field(page).scrollIntoViewIfNeeded();
};
const draft = async (page, source, cursor = source.length) => {
    await field(page).fill(source);
    await field(page).evaluate((element, cursor) => element.setSelectionRange(cursor,cursor), cursor);
    // Keyboard invocation also refreshes candidates at a deliberately moved caret.
    await field(page).press('Control+Space');
};
const hiddenMenu = async page => {
    assert.equal(await menu(page).isVisible(), false);
    assert.equal(await field(page).getAttribute('aria-expanded'), 'false');
    assert.equal(await active(page), null);
};
const matchesSource = async page => {
    assert.equal(await page.locator('#script-highlight').textContent(), await field(page).inputValue(),
        'decoration preserves every source character exactly');
};
const choose = async (page, label) => {
    const values = await labels(page), index = values.indexOf(label);
    assert.ok(index >= 0, `expected ${label} among ${JSON.stringify(values)}`);
    for (let i=0;i<=index;i++) await field(page).press('ArrowDown');
    assert.equal(await options(page).nth(index).getAttribute('aria-selected'), 'true');
    await field(page).press('Enter');
};
const reset = async page => {
    await page.locator('#reset-form').click();
    await hiddenMenu(page); await matchesSource(page);
};
const focusStayed = page => field(page).evaluate(element => document.activeElement === element);
const assertHit = async locator => {
    await locator.scrollIntoViewIfNeeded();
    const own = await locator.evaluate(element => {
        const r=element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    });
    assert.equal(own,true,'control center is clickable without force or an intercepting completion menu');
};

async function testHighlight(page, screenshots) {
    const source = [
        '// 中文注释 <img src=x onerror="throw 1"> require money >= 2',
        'on touch',
        '  event repeat',
        '  if count visits >= 2 and not flag ready',
        '    give money max(0, currency(type) - 1.25)',
        '    require tile @self != wall',
        '    require proof "$p→$p" using propositional intuitionistic',
        '    message ' + JSON.stringify('中文 😀 引号" 反斜线\\ 换行\n <b>literal</b> // ; req'),
        '  end',
        'end',
        '',
    ].join('\n');
    await draft(page,source); await field(page).press('Escape');
    await matchesSource(page);
    assert.equal(await page.locator('#script-highlight img, #script-highlight b, #script-highlight script').count(),0,
        'HTML-looking script strings and comments remain inert text');
    for (const kind of ['keyword','string','number','comment','operator','reference'])
        assert.ok(await page.locator('#script-highlight .script-token-'+kind).count()>0,kind+' is visibly decorated');
    const keywords = await page.locator('#script-highlight .script-token-keyword').allTextContents();
    for (const word of ['using','propositional','intuitionistic']) assert.ok(keywords.includes(word),word+' is highlighted');
    const geometry=await field(page).evaluate(element => {
        const pre=document.getElementById('script-highlight'),a=element.getBoundingClientRect(),b=pre.getBoundingClientRect();
        const css=getComputedStyle(element),style=getComputedStyle(pre);
        return {left:a.left-b.left,top:a.top-b.top,width:a.width-b.width,height:a.height-b.height,
            font:css.font,preFont:style.font,padding:css.padding,prePadding:style.padding,
            pointer:style.pointerEvents,tab:css.tabSize,preTab:style.tabSize};
    });
    for(const key of ['left','top','width','height']) assert.ok(Math.abs(geometry[key])<=1,'aligned '+key);
    assert.equal(geometry.font,geometry.preFont);assert.equal(geometry.padding,geometry.prePadding);
    assert.equal(geometry.tab,geometry.preTab);assert.equal(geometry.pointer,'none');
    await field(page).scrollIntoViewIfNeeded();
    await page.screenshot({path:join(screenshots,`script-highlight-${page.viewportSize().width}.png`)});
    const longSource=Array.from({length:45},(_,i)=>`message ${JSON.stringify('中文 '+i+' '+ 'long text '.repeat(35))}`).join('\n');
    await draft(page,longSource);
    await field(page).evaluate(element => {element.scrollTop=220;element.scrollLeft=180;element.dispatchEvent(new Event('scroll'));});
    const scroll=await field(page).evaluate(element=>({top:element.scrollTop,left:element.scrollLeft,
        preTop:document.getElementById('script-highlight').scrollTop,preLeft:document.getElementById('script-highlight').scrollLeft,
        gutter:document.getElementById('script-gutter').scrollTop}));
    assert.ok(scroll.top>0&&scroll.left>0,'both native scroll axes exercised');
    assert.ok(Math.abs(scroll.top-scroll.preTop)<=1&&Math.abs(scroll.left-scroll.preLeft)<=1,'highlight tracks both scroll axes');
    assert.ok(Math.abs(scroll.top-scroll.gutter)<=1,'line numbers track vertical scrolling');
    await matchesSource(page);await hiddenMenu(page);await reset(page);
}

async function testCompletion(page,screenshots) {
    await draft(page,'req');
    assert.deepEqual(await labels(page),['require']);
    assert.equal(await active(page),null,'automatic suggestions do not select an Enter action');
    await field(page).press('Tab');
    assert.equal(await field(page).inputValue(),'require ');
    await hiddenMenu(page);assert.equal(await focusStayed(page),true);

    const tail='\nmessage "保留尾部"';
    await draft(page,'reqWrong'+tail,3);await field(page).press('Tab');
    assert.equal(await field(page).inputValue(),'require '+tail,'completion replaces the whole caret token and retains following lines');
    await draft(page,'give cu 3\nmessage "tail"',7);await field(page).press('Tab');
    assert.equal(await field(page).inputValue(),'give currency 3\nmessage "tail"','existing whitespace and suffix survive');

    await draft(page,'give ');
    assert.ok((await labels(page)).includes('currency'));
    assert.equal((await labels(page)).includes('require'),false,'second-word menu stays in command context');
    assert.ok(await options(page).count()<=80);
    const second=(await labels(page))[1];
    await field(page).press('ArrowDown');await field(page).press('ArrowDown');
    assert.equal(await options(page).nth(1).getAttribute('aria-selected'),'true');
    await field(page).press('ArrowUp');
    assert.equal(await options(page).first().getAttribute('aria-selected'),'true');
    await field(page).press('ArrowDown');await field(page).press('Tab');
    assert.equal(await field(page).inputValue(),'give '+second+' ','Tab accepts the explicit selection');

    await draft(page,'req');await field(page).press('Enter');
    assert.equal(await field(page).inputValue(),'req\n','Enter inserts a native newline when no candidate was explicitly selected');
    await draft(page,'req');await field(page).press('ArrowDown');await field(page).press('Enter');
    assert.equal(await field(page).inputValue(),'require ','ArrowDown makes Enter accept completion');
    await draft(page,'req');await field(page).press('Escape');await hiddenMenu(page);
    assert.equal(await field(page).isVisible(),true,'Escape closes suggestions without closing the mobile property drawer');
    await field(page).press('Control+Space');
    assert.deepEqual(await labels(page),['require'],'Ctrl+Space reopens candidates without editing text');
    await assertHit(options(page).first());
    await page.screenshot({path:join(screenshots,`script-menu-${page.viewportSize().width}.png`)});
    await options(page).first().click();
    assert.equal(await field(page).inputValue(),'require ');assert.equal(await focusStayed(page),true,'click does not blur the textarea');
    await hiddenMenu(page);

    for(const [source,label,expected] of [
        ['on to','touch','on touch '],
        ['message "ok; req"; req','require','message "ok; req"; require '],
        ['// req\nreq','require','// req\nrequire '],
        ['require tile do','door','require tile door '],
        ['if not fl','flag','if not flag '],
        ['set language z','zh','set language zh '],
        ['require proof "$p→$p" u','using','require proof "$p→$p" using '],
        ['require rule "$p,$p→$q⊢$q" using propositional intu','intuitionistic',
            'require rule "$p,$p→$q⊢$q" using propositional intuitionistic '],
        ['add axiom zBrowserAxiom "⊢$p"\nrequire axiom zB','zBrowserAxiom',
            'add axiom zBrowserAxiom "⊢$p"\nrequire axiom zBrowserAxiom '],
        ['on touch\n  add axiom zBrowserEvent "⊢$p"; require axiom zBr','zBrowserEvent',
            'on touch\n  add axiom zBrowserEvent "⊢$p"; require axiom zBrowserEvent '],
    ]) {await draft(page,source);await choose(page,label);assert.equal(await field(page).inputValue(),expected);await matchesSource(page);}
    const longDeclaration='add axiom zBrowserScroll "⊢'+ '$p→'.repeat(60)+'$p"';
    await draft(page,longDeclaration+'; require axiom zBrowserS');
    await field(page).evaluate(element=>{
        element.scrollLeft=element.scrollWidth;
        element.dispatchEvent(new Event('scroll'));
    });
    assert.equal(await menu(page).isVisible(),true,'native caret scrolling keeps valid completion candidates');
    await choose(page,'zBrowserScroll');
    assert.equal(await field(page).inputValue(),longDeclaration+'; require axiom zBrowserScroll ');
    await matchesSource(page);
    const taggedFormula=JSON.stringify('😀 using classical; $p→$p \\"');
    const prefix=`if proof ${taggedFormula} using propositional `;
    const suffix=' classical) and flag ready\nmessage "tail"';
    await draft(page,prefix+'intuWrong'+suffix,prefix.length+4);
    assert.equal((await labels(page)).includes('propositional'),false);
    assert.equal((await labels(page)).includes('classical'),false);
    await choose(page,'intuitionistic');
    assert.equal(await field(page).inputValue(),prefix+'intuitionistic'+suffix,
        'tag completion preserves the exact quoted formula, selected tags and following condition');
    await matchesSource(page);
    await draft(page,'require proof "$p" using propositional ');
    const remaining=await labels(page);
    assert.ok(remaining.includes('classical')&&remaining.includes('intuitionistic'));
    assert.equal(remaining.includes('propositional'),false,'already selected tags are excluded');
    await draft(page,'require type "True" ');await hiddenMenu(page);
    await draft(page,'if type "True" ');
    assert.equal((await labels(page)).includes('using'),false,'type does not advertise a source policy');
    for(const source of ['// req','  // req','message "req','message "中\\" req','message "req"','on nonsense ']) {
        await draft(page,source);await hiddenMenu(page);
        assert.equal(await field(page).inputValue(),source,'no replacement inside comments/quotes or unrelated contexts');
    }
    await draft(page,'message "ok"\nunknown-token');
    await hiddenMenu(page);await field(page).press('Tab');
    assert.equal(await field(page).inputValue(),'message "ok"\nunknown-token  ','Tab without candidates inserts two spaces');
    assert.equal(await focusStayed(page),true);
    await draft(page,'  message "ok"');await field(page).press('Shift+Tab');
    assert.equal(await field(page).inputValue(),'message "ok"');assert.equal(await focusStayed(page),true);
    await draft(page,'  message "one"\n  message "two"');
    await field(page).selectText();await field(page).press('Shift+Tab');
    assert.equal(await field(page).inputValue(),'message "one"\nmessage "two"','selected lines outdent together');
    await reset(page);
}

async function testUndoAndIME(page) {
    // fill intentionally establishes a new baseline; native typing creates undo history.
    await draft(page,'');await field(page).press('Escape');
    await field(page).pressSequentially('req');
    assert.equal(await menu(page).isVisible(),true,'real typing automatically opens candidates');
    await field(page).press('Tab');assert.equal(await field(page).inputValue(),'require ');
    await field(page).press('Control+z');
    assert.equal(await field(page).inputValue(),'req','one native Undo restores the pre-completion token');
    await matchesSource(page);
    await field(page).press('Control+Shift+z');assert.equal(await field(page).inputValue(),'require ');
    await matchesSource(page);

    await draft(page,'req');
    const ime=await field(page).evaluate(element=>{
        element.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'中'}));
        const event=new KeyboardEvent('keydown',{key:'Tab',code:'Tab',bubbles:true,cancelable:true,isComposing:true});
        const dispatched=element.dispatchEvent(event);
        return {dispatched,prevented:event.defaultPrevented,value:element.value,hidden:document.getElementById('script-completions').hidden};
    });
    assert.deepEqual(ime,{dispatched:true,prevented:false,value:'req',hidden:true},'IME composition leaves Tab to the input method');
    for(const key of ['Tab','Enter','ArrowDown','Escape']) {
        const prevented=await field(page).evaluate((element,key)=>{
            const event=new KeyboardEvent('keydown',{key,code:key,bubbles:true,cancelable:true,isComposing:true});
            element.dispatchEvent(event);return event.defaultPrevented;
        },key);
        assert.equal(prevented,false,'IME key '+key+' is not intercepted');
        assert.equal(await field(page).isVisible(),true,'IME '+key+' does not close the property drawer');
        assert.equal(await focusStayed(page),true,'IME '+key+' keeps the native editing surface focused');
    }
    await field(page).evaluate(element=>element.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中'})));
    await field(page).evaluate(element=>element.setSelectionRange(0,element.value.length));
    await page.keyboard.insertText('中文');await matchesSource(page);
    assert.equal(await field(page).inputValue(),'中文');
    const legacy=await field(page).evaluate(element=>{
        const event=new KeyboardEvent('keydown',{key:'Tab',code:'Tab',bubbles:true,cancelable:true,keyCode:229});
        element.dispatchEvent(event);return event.defaultPrevented;
    });
    assert.equal(legacy,false,'legacy IME keyCode 229 is not intercepted');
    await reset(page);
}

async function testDraftAndControls(page,before) {
    await draft(page,'req');
    await assertHit(page.locator('#reset-form'));
    await page.locator('#reset-form').click();
    assert.deepEqual(await snapshot(page),before,'Reset is reachable while suggestions are open');
    assert.equal(await field(page).inputValue(),fixture.tiles[0].data.script);
    await draft(page,'message "draft"\nreq');
    await field(page).press('Tab');
    assert.deepEqual(await snapshot(page),before,'accepting completion leaves all project data and history untouched');
    assert.equal(await page.locator('#pending').isVisible(),true);
    // Cancelled navigation retains the exact unfinished draft; accepted navigation discards it.
    let dialog=page.waitForEvent('dialog');
    const click=page.locator('#neighbors button[data-edge="3"]').click();
    await (await dialog).dismiss();await click;
    assert.equal(await page.evaluate(()=>mapEditor.selectedHash),'');
    assert.equal(await field(page).inputValue(),'message "draft"\nrequire ');
    dialog=page.waitForEvent('dialog');
    const next=page.locator('#neighbors button[data-edge="3"]').click();
    await (await dialog).accept();await next;
    assert.equal(await page.evaluate(()=>mapEditor.selectedHash),'3');
    await hiddenMenu(page);await matchesSource(page);
    assert.equal(await field(page).inputValue(),fixture.tiles[1].data.script,'switching tiles refreshes decoration and drops stale candidates');
    await page.evaluate(()=>mapEditor.selectHash('',{jump:true}));await openEditor(page);
    assert.deepEqual(await snapshot(page),before);
    assert.equal(await field(page).inputValue(),fixture.tiles[0].data.script);
    // A valid script can have candidates at a blank final line; Apply must remain reachable.
    const valid='message "仅显式 Apply 保存"\n';
    await draft(page,valid);
    assert.equal(await menu(page).isVisible(),true);
    await assertHit(page.locator('#apply-tile'));
    assert.deepEqual(await snapshot(page),before,'opening suggestions and scrolling to Apply do not apply the draft');
    await page.locator('#apply-tile').click();
    assert.equal(await page.locator('#pending').isVisible(),false);
    assert.equal(await page.evaluate(()=>mapEditor.selected.data.script),valid);
    const after=await snapshot(page);
    assert.equal(after.undo,before.undo+1,'one explicit Apply produces one project history item');
    assert.deepEqual(after.json.tiles.find(t=>t.id==='first').data.unknown,{keep:true});
    await hiddenMenu(page);await matchesSource(page);
}

let browser;
const screenshots=await mkdtemp(join(tmpdir(),'deductrium-script-editor-'));
try {
    await new Promise(done=>server.listen(0,'127.0.0.1',done));
    const {chromium}=await import(process.env.PLAYWRIGHT_MODULE
        ?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href:'playwright');
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH
        ?{executablePath:process.env.CHROME_PATH}:{channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'})});
    const url=`http://127.0.0.1:${server.address().port}/tools/map-editor/index.html`;
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
        const context=await browser.newContext({viewport,acceptDownloads:true,colorScheme:'light'});
        const page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        try {
            await page.goto(url);await ready(page);
            const previous=await page.evaluateHandle(()=>mapEditor.project);
            await page.locator('#file').setInputFiles({name:'script-editor.project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
            await page.waitForFunction(previous=>mapEditor.project!==previous,previous);await previous.dispose();
            await page.evaluate(()=>mapEditor.selectHash('',{jump:true}));
            const download=page.waitForEvent('download');await page.locator('#export-project').click();await download;
            await openEditor(page);
            const before=await snapshot(page),stored=await page.evaluate(()=>localStorage.getItem(mapEditor.storageKey));
            assert.equal(await page.evaluate(()=>mapEditor.dirty),false);
            await testHighlight(page,screenshots);
            await testCompletion(page,screenshots);
            assert.deepEqual(await snapshot(page),before,'all language assistance preserves the committed project');
            assert.equal(await page.evaluate(()=>localStorage.getItem(mapEditor.storageKey)),stored,'unapplied script typing is not serialized into the saved project');
            assert.equal(await page.evaluate(()=>mapEditor.dirty),false,'Reset restores the clean state after all editing exercises');
            await testDraftAndControls(page,before);
            const applied=await snapshot(page);
            await testUndoAndIME(page);
            assert.deepEqual(await snapshot(page),applied,'Undo and IME events never mutate the committed project');
            assert.deepEqual(errors,[]);
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no viewport overflow');
            console.log(JSON.stringify({viewport,highlight:'source/escaped JSON/Unicode/inert HTML/scroll PASS',
                completion:'context/axioms/events/caret/keyboard/click PASS',ime:'composition events PASS',
                undo:'native Ctrl+Z/redo PASS',draft:'reset/navigation/explicit Apply PASS',errors,screenshots}));
        } catch(error) {
            await page.screenshot({path:join(screenshots,`script-failure-${viewport.width}.png`)}).catch(()=>{});
            console.error(JSON.stringify({viewport,source:await field(page).inputValue().catch(()=>''),
                candidates:await labels(page).catch(()=>[]),errors,screenshots}));
            throw error;
        } finally {await context.close();}
    }
} finally {
    await browser?.close();
    if(server.listening)await new Promise(done=>server.close(done));
}
