import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp} from 'node:fs/promises';
import {resolve, extname, sep, join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root=resolve(process.argv[2]||fileURLToPath(new URL('../..',import.meta.url)));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[extname(file)]||'text/plain;charset=utf-8');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`, screenshots=await mkdtemp(join(tmpdir(),'deductrium-map-authoring-'));
const fixture={format:'deductrium-world-v2',id:'authoring',title:'作者测试',revision:1,mode:'standalone',spawn:{tileId:'start',rotation:0},region:{hash:'3,3,3,3',edge:1,side:1},banks:{},migrations:[],tiles:[
 {id:'start',hash:'',type:0,name:'start',text:'入口',data:{keep:{nested:7}}},
 {id:'prize',hash:'1',type:3,name:'prize',text:{zh:'领取标记',en:'Claim marker'},data:{script:'unlock reward macro',keep:9}},
 {id:'gate',hash:'2',type:2,name:'gate',text:'P→P',data:{p:true,requiresReward:'missing-key'}}]};
const section=(page,title)=>page.locator('details.author-section').filter({has:page.locator('summary').filter({hasText:title})}).first();
const open=async locator=>{await locator.evaluate(e=>e.open=true);};
const panel=async(page,name)=>{if(!await page.locator(`#${name}-panel`).isVisible())await page.locator(`#open-${name}`).click();};
const snapshot=page=>page.evaluate(()=>JSON.stringify(mapEditor.project.toJSON()));
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(origin+'/tools/map-editor/index.html');await page.waitForFunction(()=>window.mapEditor);
  await page.locator('#file').setInputFiles({name:'authoring.world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await page.waitForFunction(()=>mapEditor.project.id==='authoring');await page.waitForFunction(()=>document.querySelectorAll('.author-section').length>=8);
  await panel(page,'tiles');
  await page.locator('.tile-row[data-hash="1"] input[type=checkbox]').check();
  const bulk=section(page,'批量编辑选区');await open(bulk);assert.match(await bulk.textContent(),/当前选区 1 格/);
  await bulk.getByLabel('getD',{exact:true}).fill('8');await bulk.getByRole('button',{name:'应用到选区',exact:true}).click();
  assert.equal(await page.evaluate(()=>mapEditor.project.tiles.get('1').data.getD),8);assert.equal(await page.evaluate(()=>mapEditor.project.tiles.get('1').data.keep),9);
  await bulk.getByRole('button',{name:'查看删除影响',exact:true}).click();assert.equal(await bulk.getByRole('button',{name:'确认删除选区',exact:true}).isEnabled(),true);
  await page.locator('.tile-row[data-hash="2"] input[type=checkbox]').check();assert.equal(await bulk.getByRole('button',{name:'确认删除选区',exact:true}).isDisabled(),true,'selection change invalidates deletion approval');
  const search=section(page,'全字段查找与替换');await open(search);
  await search.getByLabel('查找',{exact:true}).fill('标记');await search.getByLabel('替换为',{exact:true}).fill('徽记');
  await search.getByRole('button',{name:'预览替换',exact:true}).click();assert.equal(await search.getByRole('button',{name:'应用替换',exact:true}).isEnabled(),true);
  assert.equal(await page.evaluate(()=>mapEditor.project.tiles.get('1').text.zh),'领取标记');
  await search.getByRole('button',{name:'应用替换',exact:true}).click();assert.equal(await page.evaluate(()=>mapEditor.project.tiles.get('1').text.zh),'领取徽记');
  const issues=section(page,'地图检查');await open(issues);const unchanged=await snapshot(page);await issues.getByRole('button',{name:'重新检查',exact:true}).click();assert.equal(await snapshot(page),unchanged);assert.match(await issues.textContent(),/missing-key|前置|奖励/);
  await page.evaluate(()=>mapEditor.selectHash('2'));await page.locator('#close-panel').click();
  if(await page.locator('#toggle-inspector').isVisible()&&await page.locator('#toggle-inspector').getAttribute('aria-expanded')!=='true')await page.locator('#toggle-inspector').click();
  const tileForm=page.locator('#author-tile-form');await open(tileForm);await tileForm.getByLabel('门条件',{exact:true}).selectOption('payD');await tileForm.getByLabel('支付数量',{exact:true}).fill('3');
  await tileForm.getByRole('button',{name:'写入表单',exact:true}).click();assert.equal(await page.evaluate(()=>mapEditor.project.tiles.get('2').data.p),true,'structured fields stay unapplied');
  await page.locator('#apply-tile').click();assert.equal(await page.evaluate(()=>mapEditor.project.tiles.get('2').data.payD),3);assert.equal(await page.evaluate(()=>mapEditor.project.tiles.get('2').data.requiresReward),'missing-key');
  await panel(page,'project');const library=section(page,'内容库');await open(library);
  await library.getByRole('button',{name:'新增',exact:true}).click();await library.getByRole('button',{name:'填入示例 qIdentity',exact:true}).click();
  await library.getByLabel('命题 statement',{exact:true}).fill('⊢P');await library.getByRole('button',{name:'加入列表',exact:true}).click();
  const beforeInvalid=await snapshot(page);await library.getByRole('button',{name:'应用内容库',exact:true}).click();assert.equal(await snapshot(page),beforeInvalid,'invalid theorem is not committed');assert.match(await library.locator('.author-status').textContent(),/证明无效/);
  await library.getByRole('button',{name:'编辑',exact:true}).click();await library.getByLabel('命题 statement',{exact:true}).fill('⊢$1→$1');await library.getByRole('button',{name:'更新列表',exact:true}).click();await library.getByRole('button',{name:'应用内容库',exact:true}).click();
  assert.equal(await page.evaluate(()=>mapEditor.project.world.content.rules[0].id),'qIdentity');
  const publication=section(page,'发布信息');await open(publication);await publication.getByLabel('作者',{exact:true}).fill('地图作者');await publication.getByLabel('简介',{exact:true}).fill('多行简介\n第二行');await publication.getByLabel('引擎版本（如 2.0）',{exact:true}).fill('2.0');await publication.getByRole('button',{name:'应用发布信息',exact:true}).click();
  assert.equal(await page.evaluate(()=>mapEditor.project.world.publication.author),'地图作者');
  await page.locator('#publish-settings').evaluate(e=>e.open=true);await page.locator('#world-rotation').selectOption('1');await page.locator('#world-apply').click();assert.equal(await page.evaluate(()=>mapEditor.project.world.content.rules[0].id),'qIdentity','world settings preserve content');assert.equal(await page.evaluate(()=>mapEditor.project.world.publication.author),'地图作者');
  const bundleSection=section(page,'导出世界包');await open(bundleSection);const download=page.waitForEvent('download');await bundleSection.getByRole('button',{name:'导出世界包',exact:true}).click();const bundle=JSON.parse(await readFile(await(await download).path(),'utf8'));assert.equal(bundle.worlds[0].publication.author,'地图作者');assert.equal(bundle.worlds[0].content.rules[0].id,'qIdentity');
  const migration=section(page,'迁移差异');await open(migration);await migration.locator('input[type=file]').setInputFiles({name:'previous.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.waitForFunction(()=>[...document.querySelectorAll('details.author-section')].find(e=>e.querySelector('summary')?.textContent==='迁移差异')?.querySelector('.author-status').textContent.length>0);
  await page.screenshot({path:join(screenshots,`project-${viewport.width}.png`)});
  for(const dark of [true,false]){await page.emulateMedia({colorScheme:dark?'dark':'light'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page overflow');}
  await library.getByRole('button',{name:'新增',exact:true}).click();
  await library.getByRole('button',{name:'填入示例 qIdentity',exact:true}).click();
  await publication.getByLabel('作者',{exact:true}).fill('旧项目未提交作者');
  const next=structuredClone(fixture);next.id='authoring-next';next.title='新项目';
  await page.locator('#file').setInputFiles({name:'next.world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(next))});
  await page.waitForFunction(()=>mapEditor.project.id==='authoring-next');
  assert.equal(await library.getByLabel('命题 statement',{exact:true}).isVisible(),false,'discarded library form cannot leak into the next project');
  assert.equal(await publication.getByLabel('作者',{exact:true}).inputValue(),'','discarded publication draft cannot leak into the next project');
  await library.getByRole('button',{name:'应用内容库',exact:true}).click();
  assert.equal(await page.evaluate(()=>mapEditor.project.world.content?.rules.length??0),0,'applying the new project does not restore discarded rules');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({viewport,checks:'bulk/selection/delete guard/search preview/replace/issues/structured gate/unapplied state/checked theorem rejection+acceptance/publication/metadata preservation/bundle/migration/layout',errors}));await context.close();
 }
 console.log('Screenshots: '+screenshots);
}finally{await browser?.close();await new Promise(done=>server.close(done));}
