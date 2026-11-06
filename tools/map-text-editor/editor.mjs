import {MapDocument} from './model.mjs';
import {HWorld} from '../../js/hy/hworld.js';
import {Hvec, Rotor} from '../../js/hy/algebra.js';
import {blockMap, nameMap} from '../../js/hy/maploader.js';

const $ = id => document.getElementById(id);
const canvas = $('map'), world = new HWorld(canvas);
world.hitTest = () => true; // Free navigation, without collecting rewards or touching game saves.
world.localDraw.drawPlayer = () => {}; // Keep the selected tile's wording unobscured.
world.localDraw.textTo = (point,text) => {
    if (!text || point.z > 100) return;
    const size = Math.min(canvas.width,canvas.height), lines = text.split('\n');
    const scale = world.localDraw.scale/(point.z+1)*size/2, context = world.localDraw.ctxt;
    const font = Math.min(18*(window.devicePixelRatio||1),size*.045,size*.46/(lines.length*1.3))/point.z;
    context.font = `${font}px sans-serif`;
    for (const [i,line] of lines.entries()) context.fillText(line,point.x*scale+canvas.width/2,
        point.y*scale+canvas.height/2+font*((i-(lines.length-1)/2)*1.3+.25),size*.52/point.z);
};
let doc, selected, language = 'zh', suggestions = [], changes = [], storageOK = true, blockedDraft;
const storageKey = () => `deductrium-map-text-editor-v1:${doc.fingerprint}`;
const textFor = row => { const values = doc.values(row.id); return values[language] ?? values[''] ?? values.zh ?? Object.values(values)[0] ?? ''; };
const hasText = row => Object.values(doc.values(row.id)).some(value => value.trim());
const say = message => { $('status').textContent = message; };

function persist() {
    try {
        if (blockedDraft) throw Error('recovery blocked');
        localStorage.setItem(storageKey(), JSON.stringify(doc.project())); storageOK = true; $('draft-status').textContent = '已自动暂存到本浏览器 · 建议另存草稿文件';
    }
    catch { storageOK = false; $('draft-status').textContent = '浏览器暂存不可用，请导出草稿文件'; }
    if (blockedDraft) $('draft-status').textContent = '旧草稿恢复失败，已保留原记录；请导出草稿保存本次修改';
    $('dirty-count').textContent = `${doc.edits.size} 格已修改`;
}
function validateExport() {
    try { doc.exportSource(); $('export').disabled = false; $('export').title = ''; return true; }
    catch(error) { $('export').disabled = true; $('export').title = error.message; say(error.message); return false; }
}
function syncTiles() {
    blockMap.clear(); nameMap.clear();
    for (const [hash, row] of doc.tiles) {
        const values = row.id ? doc.values(row.id) : {'':''};
        blockMap.set(hash, {type:row.type,name:row.name,text:values[''] ?? values,data:{editorRow:row.id}});
        if (row.name) nameMap.set(row.name, hash);
    }
}
world.onTileText = block => block?.data?.editorRow ? textFor(doc.byId.get(block.data.editorRow)) : '';
world.onTileColor = block => {
    const id = block?.data?.editorRow;
    if (id && id === selected?.id) return '#c1e3b3';
    if (id && doc.edits.has(id)) return '#f8df9d';
    return ['#f9fbf1','#d8dfd1','#e7ce99','#d5e3b8','#bedbda'][block?.type ?? 1];
};
world.onTextColor = () => '#344e35';
function draw() { world.onLoop(); }
function resize() {
    const rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1,Math.round(rect.width * ratio)); canvas.height = Math.max(1,Math.round(rect.height * ratio));
    if (doc) draw();
}
new ResizeObserver(resize).observe(canvas);

function renderList() {
    const search = $('search').value.toLocaleLowerCase(), scope = $('scope').value, filter = $('filter').value;
    const rows = doc.records.filter(row => row.active && (hasText(row) || doc.edits.has(row.id)) && (scope === 'all' || row.scope === scope) &&
        (filter === 'all' || filter === 'edited' ? filter !== 'edited' || doc.edits.has(row.id) : row.type === 0) &&
        (!search || `${row.line} ${row.hash} ${row.name || ''} ${row.section} ${Object.values(doc.values(row.id)).join(' ')}`.toLocaleLowerCase().includes(search)));
    $('count').textContent = `${rows.length} 格 · 已修改 ${doc.edits.size} 格`;
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
        const button = document.createElement('button'); button.type = 'button'; button.className = `tile-row${selected?.id === row.id ? ' selected' : ''}${doc.edits.has(row.id) ? ' edited' : ''}`;
        button.dataset.id = row.id; button.setAttribute('role','listitem'); button.setAttribute('aria-label',`第 ${row.line} 行 ${textFor(row).slice(0,35)}`);
        const meta = document.createElement('small'); meta.textContent = `L${row.line} · ${row.name || ['提示','墙','闸门','奖励','序数'][row.type]}`;
        const excerpt = document.createElement('span'); excerpt.className = 'excerpt'; excerpt.textContent = textFor(row).replaceAll('\n',' ');
        button.append(meta,excerpt); button.onclick = () => select(row,true); fragment.append(button);
    }
    $('tiles').replaceChildren(fragment);
}

function update() {
    persist(); syncTiles(); $('preview').textContent = selected ? textFor(selected) : ''; renderList(); draw(); validateExport();
}
function select(row, jump) {
    selected = row; $('tile-title').textContent = row.name || `第 ${row.line} 行`;
    for (const id of ['reset','add-language','locate']) $(id).disabled = false;
    $('tile-meta').textContent = `${['提示 / 道路','墙','闸门 / 题目','奖励','序数'][row.type]} · 源码 L${row.line}\n${row.section}\n坐标：${row.hash || '原点'}`;
    $('original-text').textContent = Object.entries(row.values).map(([key,value])=>`${key || '无语言标记'}\n${value}`).join('\n\n');
    $('original-prefix').textContent = row.prefix;
    renderFields();
    const proposal = suggestions.find(item => item.original === (row.values.zh ?? row.values['']));
    $('suggestion').hidden = !proposal;
    $('suggestion-text').textContent = proposal?.proposal ?? '';
    $('use-suggestion').onclick = () => {
        const values = {...doc.values(row.id)};
        if (Object.hasOwn(values,'')) { values.zh = values['']; delete values['']; }
        values.zh = proposal.proposal; doc.set(row.id,values); renderFields(); update();
    };
    if (jump) { world.currentTile = row.hash ? row.hash.split(',').map(Number) : []; world.localCamMat = new Rotor(); world.atlasTile.generateRotors(world.currentTile); }
    $('coordinate').textContent = `L${row.line} · ${row.hash || '原点'}`; $('preview').textContent = textFor(row); renderList(); draw();
}
function renderFields() {
    $('fields').replaceChildren(); if (!selected) return;
    for (const [key,value] of Object.entries(doc.values(selected.id))) {
        const wrapper = document.createElement('div'); wrapper.className = 'field';
        const label = document.createElement('label'); label.className = 'field-label'; label.htmlFor = `text-${key || 'plain'}`;
        label.textContent = {zh:'中文',en:'English','':'原文（无语言标记）'}[key] ?? key;
        const counter = document.createElement('span'); counter.textContent = `${value.length} 字符`; label.append(counter);
        const input = document.createElement('textarea'); input.id = label.htmlFor; input.dataset.language = key; input.value = value; input.spellcheck = false; input.rows = Math.min(14,Math.max(5,value.split('\n').length+1));
        input.oninput = () => {
            doc.set(selected.id,{...doc.values(selected.id),[key]:input.value}); counter.textContent = `${input.value.length} 字符`; update();
        };
        wrapper.append(label,input); $('fields').append(wrapper);
    }
}
function load(next, recover = true) {
    doc = next; selected = undefined; blockedDraft = undefined; $('recover-draft').hidden = true;
    renderFields(); $('tile-title').textContent = '选择一格'; $('suggestion').hidden = true;
    for (const id of ['tile-meta','preview','original-text','original-prefix']) $(id).textContent = '';
    for (const id of ['reset','add-language','locate']) $(id).disabled = true;
    let recovered = false, recoveryError;
    if (recover) {
        let stored;
        try { stored = localStorage.getItem(storageKey()); if (stored) { doc.restore(JSON.parse(stored)); recovered = true; } }
        catch {
            if (stored) { blockedDraft = stored; $('recover-draft').hidden = false; }
            recoveryError = '旧草稿未能恢复，原记录已保留；可导出未恢复草稿，修正后手动导入。';
        }
    }
    syncTiles(); $('scope').value = 'reasoning'; $('filter').value = 'hints'; $('search').value = '';
    const first = doc.records.find(row=>row.active && row.scope === 'reasoning' && row.type === 0 && hasText(row)) ??
        doc.records.find(row=>row.active && hasText(row));
    if (first) { $('scope').value = first.scope; if (first.type !== 0) $('filter').value = 'all'; select(first,true); }
    renderList(); persist();
    say(recoveryError ?? (recovered ? `已恢复浏览器草稿 · ${doc.edits.size} 格修改` : `地图已加载 · ${doc.records.filter(row=>row.active && hasText(row)).length} 个文字格`));
    validateExport();
}
function download(name,text,type) {
    const url = URL.createObjectURL(new Blob([text],{type})), link = document.createElement('a');
    link.href = url; link.download = name; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('export').onclick = () => { if (validateExport()) { download('map.ts',doc.exportSource(),'text/plain;charset=utf-8'); say(`已导出 map.ts · ${doc.edits.size} 格修改`); } };
$('recover-draft').onclick = () => { if (blockedDraft) download('unrecovered-map-text-draft.json',blockedDraft,'application/json'); };
$('save-draft').onclick = () => { download('map-text-draft.json',JSON.stringify(doc.project(),null,2),'application/json'); say('已导出可继续编辑的草稿'); };
$('import').onclick = () => $('file').click();
$('file').onchange = async () => {
    const file = $('file').files[0]; if (!file) return;
    try {
        const text = await file.text(); let next;
        if (file.name.toLowerCase().endsWith('.json')) { const project = JSON.parse(text); next = new MapDocument(project.source,world.atlasTile); next.restore(project); }
        else next = new MapDocument(text,world.atlasTile);
        if (doc.edits.size && !confirm('导入会切换编辑内容。当前草稿已在浏览器暂存，建议先导出草稿文件。继续？')) return;
        load(next,false); say(`已导入 ${file.name}`);
    } catch(error) { say(`导入失败：${error.message}`); }
    finally { $('file').value = ''; }
};
$('reset').onclick = () => { if (selected && doc.edits.has(selected.id) && confirm('恢复本格的全部语言原文？')) { doc.edits.delete(selected.id); select(selected,false); update(); } };
$('add-language').onclick = () => {
    if (!selected) return;
    const key = prompt('新增语言代码（如 en、zh、ja）','en'); if (key === null) return;
    if (!/^[A-Za-z]{2,3}$/.test(key)) { say('语言代码应为 2～3 位英文字母。'); return; }
    const values = {...doc.values(selected.id)};
    if (Object.hasOwn(values,key)) { $(`text-${key}`).focus(); return; }
    if (Object.hasOwn(values,'')) { values.zh = values['']; delete values['']; }
    values[key] ??= ''; doc.set(selected.id,values); renderFields(); update();
};
for (const id of ['search','scope','filter']) $(id).addEventListener(id === 'search' ? 'input':'change',renderList);
$('map-language').onchange = () => { language = $('map-language').value; renderList(); if (selected) $('preview').textContent = textFor(selected); draw(); };
$('locate').onclick = () => { if (selected) select(selected,true); };
function tab(changesActive) {
    $('workspace').hidden = changesActive; $('changes-panel').hidden = !changesActive;
    $('edit-tab').classList.toggle('active',!changesActive); $('changes-tab').classList.toggle('active',changesActive);
    if (!changesActive) resize();
}
$('edit-tab').onclick = () => tab(false); $('changes-tab').onclick = () => tab(true);
function renderChanges() {
    const query = $('changes-search').value.toLocaleLowerCase(), fragment = document.createDocumentFragment();
    for (const item of changes.filter(item=>JSON.stringify(item).toLocaleLowerCase().includes(query))) {
        const row = document.createElement('tr');
        for (const value of [`${item.category} · ${item.title}`,item.before,item.after,item.note,item.status]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
        fragment.append(row);
    }
    $('changes-body').replaceChildren(fragment);
}
$('changes-search').oninput = renderChanges;

let drag;
canvas.onpointerdown = event => { canvas.setPointerCapture(event.pointerId); drag = {x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false}; };
canvas.onpointermove = event => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4) drag.moved = true;
    if (drag.moved) { const size = Math.min(canvas.clientWidth,canvas.clientHeight); world.moveCam(-dx/size*1.4,dy/size*1.4); draw(); }
    drag.x = event.clientX; drag.y = event.clientY;
};
canvas.onpointerup = event => {
    if (!drag) return;
    const click = !drag.moved; drag = null;
    if (!click) return;
    const rect = canvas.getBoundingClientRect(), size = Math.min(rect.width,rect.height)*world.localDraw.scale;
    const x = (event.clientX-rect.left-rect.width/2)*2/size, y = (event.clientY-rect.top-rect.height/2)*2/size, radius = x*x+y*y;
    if (radius >= 1) return;
    const point = world.localCamMat.conj().apply(new Hvec((1+radius)/(1-radius),2*x/(1-radius),2*y/(1-radius)));
    for (const [hash,rotor] of world.atlasTile.rotors) {
        if (world.atlasTile.isInDomain(rotor.conj().apply(point)) !== -1) continue;
        const row = doc.tiles.get(hash);
        if (row?.id && hasText(row)) select(row,false); else say('此格没有文字；可从左侧列表选择文字格。');
        break;
    }
};
canvas.onpointercancel = () => { drag = null; };
window.addEventListener('beforeunload', event => { if (!storageOK && doc?.edits.size) { event.preventDefault(); event.returnValue = ''; } });

try {
    const responses = await Promise.all([fetch('../../src/hy/map.ts'),fetch('./changes.json'),fetch('./suggestions.json')]);
    if (!responses[0].ok) throw Error('无法读取 src/hy/map.ts，请通过本地 HTTP 服务打开编辑器。');
    changes = responses[1].ok ? await responses[1].json() : []; suggestions = responses[2].ok ? await responses[2].json() : [];
    load(new MapDocument(await responses[0].text(),world.atlasTile)); renderChanges(); resize();
    // Read-only diagnostics for the standalone editor's browser regression tests.
    window.mapTextEditor = {get document(){return doc;},get selected(){return selected;},world,select,load};
} catch(error) { $('fatal').hidden = false; $('fatal').textContent = `加载失败：${error.message}`; say('加载失败'); }
