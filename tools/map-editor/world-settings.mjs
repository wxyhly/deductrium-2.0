import {buildWorld} from './publish.mjs';

export function installWorldSettings(api) {
    const host = document.getElementById('world-settings');
    if (!host) return;
    host.innerHTML = `<div class="field-pair"><label>世界 revision<input id="world-revision" type="number" min="1" value="1"></label><label>运行方式<select id="world-mode"><option value="standalone">独立世界</option><option value="extension">扩展主世界</option></select></label></div>
<label>入口稳定 ID<input id="world-spawn" readonly></label><div class="actions"><button id="world-use-selection" type="button">当前格设为入口</button><label>朝向<select id="world-rotation">${[0,1,2,3,4,5].map(n=>`<option>${n}</option>`).join('')}</select></label></div>
<label><input id="world-currency-enabled" type="checkbox">注册本 mod 的币种</label><div class="field-pair"><label>币种名称<input id="world-currency-name" maxlength="80"></label><label>币种符号<input id="world-currency-symbol" maxlength="16"></label></div><p id="world-currency-id" class="muted"></p>
<details><summary>银行和版本迁移（高级）</summary><label>银行配置 JSON<textarea id="world-banks" rows="5">{}</textarea></label><p class="muted">每个方向须显式设置 from/to/rate/feeRate/feeFixed/minimum/rounding/precision。兑换奖励格的属性 JSON 写 exchange: {bank, from, to, amount}；格子文字说明金额与手续费，领取时直接兑换。</p><label>迁移计划 JSON<textarea id="world-migrations" rows="5">[]</textarea></label><p class="muted">每次升级须声明 from、to、remap、reset。移动/改名保持砖块 ID；修改题目或删格必须明确处理旧进度。</p></details><button id="world-apply" type="button">应用世界设置</button><p id="world-settings-status" role="status"></p>
<details id="region-settings"><summary>半平面编辑范围</summary><label>边界格坐标<input id="region-hash" placeholder="空白代表原点"></label><div class="field-pair"><label>边界格的边<select id="region-edge">${[0,1,2,3,4,5].map(n=>`<option>${n}</option>`).join('')}</select></label><label>允许侧<select id="region-side"><option value="1">包含边界格的一侧</option><option value="-1">另一侧</option></select></label></div><p class="muted">mod 必须先设置半平面；所有 mod 格均须在内，主世界格均须在外。</p><label>扩展入口：官方格坐标<input id="world-main-hash" placeholder="空白代表官方原点"></label><label>官方格连接边<select id="world-entry-edge"><option>0</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label><label>相邻 mod 格稳定 ID<input id="world-entry-tile" placeholder="可在选择砖块后填入其 ID"></label><div class="actions"><button type="button" id="region-use-selection">以当前格为边界</button><button type="button" id="region-apply">应用范围</button><button type="button" id="region-clear">取消范围</button></div><p class="muted">按实际双曲多边形六个顶点校验；越界编辑、导入、挂载和更新会整体拒绝。</p></details>
<details><summary>更新模块库版本</summary><label>新版模块 JSON<textarea id="module-update-json" rows="5"></textarea></label><label>明确删除的局部砖块 ID（JSON 数组）<textarea id="module-update-deleted" rows="2">[]</textarea></label><button type="button" id="module-update-apply">检查并更新全部实例</button></details>`;
    const $ = id => document.getElementById(id);
    let currentProject = api.project;
    const pending = new Set();
    api.registerPendingGuard(() => pending.size > 0);
    const action = (run, message) => api.applyProject(run, message, {allowExternalPending:true});
    const status = (text, error=false) => { $('world-settings-status').textContent=text; $('world-settings-status').dataset.error=String(error); };
    const run = action => { try { return action(); } catch(error) {status(error.message,true);} };
    const refresh = () => {
        if (currentProject !== api.project) {currentProject = api.project;pending.clear();}
        const value=api.project.world ?? {};
        $('region-clear').disabled=!!api.project.world;
        if (api.project.world && !api.project.region) status('此世界尚未设置半平面，请先应用范围以解锁编辑');
        if (!pending.has('world')) {
        $('world-revision').value=value.revision ?? 1; $('world-mode').value=value.mode ?? 'standalone';
        $('world-main-hash').value=value.entry?.mainHash ?? ''; $('world-entry-edge').value=value.entry?.edge ?? 0; $('world-entry-tile').value=value.entry?.tileId ?? '';
        $('world-spawn').value=value.spawn?.tileId ?? ''; $('world-rotation').value=value.spawn?.rotation ?? 0;
        $('world-currency-enabled').checked=!!value.currency; $('world-currency-name').value=value.currency?.name ?? ''; $('world-currency-symbol').value=value.currency?.symbol ?? '';
        $('world-currency-id').textContent='币种 ID：mod:'+api.project.id;
        $('world-banks').value=JSON.stringify(value.banks ?? {},null,2); $('world-migrations').value=JSON.stringify(value.migrations ?? [],null,2);
        }
        if (!pending.has('region')) {
        const region=api.project.region;
        $('region-hash').value=region?.hash ?? ''; $('region-edge').value=region?.edge ?? 0; $('region-side').value=region?.side ?? 1;
        }
    };
    const mark = event => {const id = event.target.id;pending.add(id.startsWith('region-') ? 'region' : id.startsWith('module-update-') ? 'module' : 'world');status('设置尚未应用');};
    host.addEventListener('input',mark);host.addEventListener('change',mark);
    $('world-use-selection').onclick=()=>run(()=>{if(!api.selected)throw Error('请选择已有砖块作为入口');$('world-spawn').value=api.selected.id;pending.add('world');status('入口已选择，请应用设置');});
    $('world-apply').onclick=()=>run(()=>{
        const settings={revision:Number($('world-revision').value),mode:$('world-mode').value,
            ...($('world-mode').value==='extension'?{entry:{mainHash:$('world-main-hash').value.trim(),edge:Number($('world-entry-edge').value),tileId:$('world-entry-tile').value}}:{}),
            spawn:{tileId:$('world-spawn').value,rotation:Number($('world-rotation').value)},banks:JSON.parse($('world-banks').value),migrations:JSON.parse($('world-migrations').value),
            ...($('world-currency-enabled').checked?{currency:{id:'mod:'+api.project.id,name:$('world-currency-name').value,...($('world-currency-symbol').value?{symbol:$('world-currency-symbol').value}:{})}}:{})};
        if (!api.project.region) throw Error('请先应用半平面范围再配置世界');
        if (api.project.tiles.size) buildWorld(api.project,settings); action(project=>project.setWorld(settings),'世界设置已应用');pending.delete('world');refresh();status('世界设置已应用；发布前会再次完整校验');
    });
    const publish=()=>{if(pending.size)throw Error('请先应用尚未确认的世界、范围或模块更新设置');return buildWorld(api.project);};
    const download=(filename,data)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    $('export-world').onclick=()=>run(()=>{const world=publish();download(world.id+'.world.json',world);status('已发布世界 JSON；项目 JSON 另存编辑信息');});
    $('play-world').onclick=()=>run(()=>{const world=publish();localStorage.setItem('deductrium2_world_manifest',JSON.stringify(world));window.open('../../index.html?mod-world','_blank','noopener');status('已打开世界；进度按世界 ID 隔离，版本更新须通过迁移校验');});
    $('region-use-selection').onclick=()=>{$('region-hash').value=api.selectedHash;pending.add('region');status('边界已选择，请应用范围');};
    $('region-apply').onclick=()=>run(()=>{const region={hash:$('region-hash').value,edge:Number($('region-edge').value),side:Number($('region-side').value)};action(project=>project.setRegion(region),'半平面范围已应用');pending.delete('region');refresh();status('范围已应用');});
    $('region-clear').onclick=()=>run(()=>{action(project=>project.setRegion(null),'范围已取消');pending.delete('region');refresh();});
    $('module-update-apply').onclick=()=>run(()=>{const input=JSON.parse($('module-update-json').value),deletedTileIds=JSON.parse($('module-update-deleted').value);let diff;action(project=>{diff=project.updateModule(input,{deletedTileIds});},'模块全部实例已更新');pending.delete('module');status(`更新 ${diff.instanceIds.length} 个实例；保留 ${diff.retainedTileIds.length} 格，新增 ${diff.addedTileIds.length} 格，删除 ${diff.deletedTileIds.length} 格`);});
    window.addEventListener('map-editor-project-change',refresh);refresh();
}
