import {installUI} from './ui.mjs';
import {installScriptEditor} from './script-editor.mjs';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'deductrium-map-editor-project-v1';
const TYPES = ['道路', '墙', '门', '奖励', '序数'];
const clone = value => structuredClone(value);
const hashLabel = hash => hash || '[]（原点）';
let EditorProject, Hvec, Rotor, LangMgr, parseMapScript, blockMap, nameMap, world, project;
let selectedHash = '', group = new Set(), dirty = false, fieldDirty = false, infoDirty = false;
let blockedDraft = null, preview = null, visibleLimit = 150, filePurpose = 'auto', drag = null;
let renderFrame = 0, importBusy = false, ui, scriptUI, mapInteraction = null;
let officialTiles = new Map();
let pickerOfficialBase = false;
const officialTile = hash => project?.world?.mode === 'extension' ? officialTiles.get(hash) : undefined;
const pendingGuards = new Set();
const externalPending = () => [...pendingGuards].some(check => check());

function say(message, error = false) {
    $('status').textContent = message;
    $('status').dataset.error = String(error);
}
function guard(action) {
    try { return action(); }
    catch (error) { say(error.message || String(error), true); }
}
function objectJSON(text, label) {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${label} 必须是 JSON 对象。`);
    return value;
}
function readTextField(id, original) {
    const value = $(id).value;
    // Textareas normalize line endings on assignment; keep unchanged source.
    return typeof original === 'string' && value === original.replace(/\r\n?/g, '\n') ? original : value;
}
function parseAt(value) {
    const input = value.trim();
    if (!input || input === '[]') return [];
    const at = input.startsWith('[') ? JSON.parse(input) : input.split(',').map(part => {
        if (!/^[0-5]$/.test(part.trim())) throw Error('坐标应为 0–5 组成的逗号序列，或 []。');
        return Number(part.trim());
    });
    if (!Array.isArray(at) || at.some(n => !Number.isInteger(n) || n < 0 || n > 5)) throw Error('坐标每项必须是整数 0–5。');
    // Coordinates are canonical tile addresses, not a path from the selected tile.
    const canonical = [];
    for (const edge of at) world.atlasTile.getNeighborAndDir(canonical, edge, false);
    return canonical;
}
function textFor(tile) {
    return typeof tile.text === 'string' ? tile.text : tile.text[LangMgr.lang] ?? Object.values(tile.text)[0] ?? '';
}
function updateDirty() {
    const pending = fieldDirty || infoDirty || externalPending();
    $('dirty-indicator').textContent = dirty || pending ? '●' : '';
    $('dirty-indicator').title = dirty || pending ? '有尚未保存到项目文件的更改' : '已保存 / 尚无更改';
    $('pending').hidden = !fieldDirty;
    document.querySelector('.apply-bar').dataset.pending = String(fieldDirty);
    $('apply-state').textContent = scriptUI?.errorMessage || (fieldDirty ? '未应用修改' : '');
    $('apply-state').dataset.error = String(!!scriptUI?.errorMessage);
    $('apply-project').textContent = infoDirty ? '应用项目信息 *' : '应用项目信息';
}
function discardFields() {
    return !fieldDirty || confirm('本格属性尚未 Apply。放弃表单中的修改并继续？');
}
function discardAll() {
    return !(dirty || fieldDirty || infoDirty || externalPending()) || confirm('当前有未保存到项目文件的修改。继续切换项目？建议先取消并保存项目 JSON。');
}
function requireApplied({allowExternalPending = false} = {}) {
    if (fieldDirty || infoDirty) {
        if (infoDirty) ui.openPanel('project');
        else {
            ui.openPanel(null, false);
            if (matchMedia('(max-width:700px)').matches && $('inspector').dataset.expanded !== 'true') $('toggle-inspector').click();
        }
        throw Error('请先 Apply 格子属性 / 应用项目信息，或还原表单，再执行此操作。');
    }
    if (!allowExternalPending && externalPending()) {
        ui.openPanel('project'); $('publish-settings').open = true;
        throw Error('请先应用世界设置。');
    }
}
function persist() {
    if (blockedDraft !== null) {
        $('draft-status').textContent = '旧草稿未恢复，原记录已保留；请保存项目文件';
        return;
    }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project.toJSON()));
        $('draft-status').textContent = '已暂存到本浏览器 · 请另存项目文件';
    } catch {
        $('draft-status').textContent = '浏览器暂存不可用；仍可保存项目文件';
    }
}
function syncTiles() {
    blockMap.clear(); nameMap.clear();
    if (project.world?.mode === 'extension' || pickerOfficialBase) for (const [hash, tile] of officialTiles) {
        blockMap.set(hash, clone(tile));
        if (tile.name) nameMap.set(tile.name, hash);
    }
    for (const [hash, tile] of project.tiles) {
        blockMap.set(hash, clone(tile));
        if (tile.name) nameMap.set(tile.name, hash);
    }
}
function drawMarkers() {
    const rect = $('map').getBoundingClientRect(), fragment = document.createDocumentFragment();
    const add = (hash, className) => {
        const rotor = world.atlasTile.rotors.get(hash);
        if (!rotor) return;
        const p = world.localCamMat.mul(rotor).apply(new Hvec());
        if (p.z > 100) return;
        const scale = world.localDraw.scale / (p.z + 1) * Math.min(rect.width, rect.height) / 2;
        const marker = document.createElement('i'); marker.className = `map-marker ${className}`;
        marker.style.left = `${rect.width / 2 + p.x * scale}px`;
        marker.style.top = `${rect.height / 2 + p.y * scale}px`;
        fragment.append(marker);
    };
    for (const hash of group) if (hash !== selectedHash) add(hash, '');
    if (preview) for (const hash of preview.tiles.keys()) add(hash, project.tiles.has(hash) && project.tiles.get(hash).instanceId !== preview.ignore ? 'preview conflict' : 'preview');
    add(selectedHash, 'current');
    $('markers').replaceChildren(fragment);
}
function draw() {
    if (!world || !project || renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
        renderFrame = 0;
        world.onLoop();
        drawMarkers();
        mapInteraction?.draw();
    });
}
function resize() {
    if (!world) return;
    const canvas = $('map'), rect = canvas.getBoundingClientRect(), ratio = devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    draw();
}
function jump(hash) {
    world.currentTile = hash ? hash.split(',').map(Number) : [];
    world.localCamMat = new Rotor();
    world.atlasTile.generateRotors(world.currentTile);
    draw();
}
function filteredTiles() {
    const query = $('search').value.toLocaleLowerCase(), filter = $('filter').value;
    return [...project.tiles].filter(([hash, tile]) =>
        (filter === 'all' || (filter === 'mounted' ? !!tile.instanceId : filter === 'group' ? group.has(hash) : tile.type === Number(filter))) &&
        (!query || `${hash} ${tile.name || ''} ${tile.instanceId || ''} ${typeof tile.text === 'string' ? tile.text : Object.values(tile.text).join(' ')}`.toLocaleLowerCase().includes(query)));
}
function renderList() {
    if (!project) return;
    const tiles = filteredTiles(), fragment = document.createDocumentFragment();
    for (const [hash, tile] of tiles.slice(0, visibleLimit)) {
        const row = document.createElement('div'); row.className = `tile-row${hash === selectedHash ? ' current' : ''}`; row.dataset.hash = hash;
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = group.has(hash);
        checkbox.setAttribute('aria-label', `加入选区 ${tile.name || hashLabel(hash)}`);
        checkbox.onchange = () => { if (checkbox.checked) group.add(hash); else group.delete(hash); renderSelection(); renderList(); draw(); };
        const button = document.createElement('button'); button.type = 'button';
        const meta = document.createElement('small'); meta.textContent = `${TYPES[tile.type]} · ${tile.name || hashLabel(hash)}${tile.instanceId ? ' · 模块' : ''}`;
        const excerpt = document.createElement('span'); excerpt.className = 'excerpt'; excerpt.textContent = textFor(tile).replaceAll('\n', ' ') || '（无文字）';
        button.append(meta, excerpt); button.onclick = event => selectHash(hash, {jump: true, toggle: event.shiftKey || $('multi-select').checked});
        row.append(checkbox, button); fragment.append(row);
    }
    $('tiles').replaceChildren(fragment);
    $('count').textContent = `${tiles.length} / ${project.tiles.size} 格 · 已显示 ${Math.min(visibleLimit, tiles.length)} 格`;
    $('more-tiles').hidden = tiles.length <= visibleLimit;
}
function renderSelection() {
    $('coordinate').textContent = `当前格 ${hashLabel(selectedHash)}`;
    $('selection-count').textContent = `选区 ${group.size} 格`;
    $('selection-bar').hidden = group.size === 0;
}
function renderTextMode() {
    const multilingual = $('text-mode').value === 'languages';
    $('plain-field').hidden = multilingual; $('language-fields').hidden = !multilingual;
}
function fillForm() {
    const base = officialTile(selectedHash), editable = !base && project.canEdit(selectedHash);
    const tile = project.tiles.get(selectedHash) ?? base, text = tile?.text ?? '';
    $('tile-title').textContent = tile ? `${TYPES[tile.type]}属性` : '空白格 · 可新增';
    $('tile-meta').textContent = `坐标 ${hashLabel(selectedHash)} · ${base ? '官方地图 · 只读' : !editable ? '半平面外 · 只读' : tile ? `ID ${tile.id}` : '空白，Apply 后新增'}`;
    const at = selectedHash ? selectedHash.split(',').map(Number) : [];
    for (const button of $('neighbors').querySelectorAll('button[data-edge]')) {
        const neighborHash = world.atlasTile.getNeighborAndDir(at, Number(button.dataset.edge), true)[0].join(',');
        const neighbor = project.tiles.get(neighborHash) ?? officialTile(neighborHash);
        button.dataset.kind = neighbor ? String(neighbor.type) : 'empty';
        const label = `边 ${button.dataset.edge}：${neighbor ? `${TYPES[neighbor.type]} ${neighbor.name || neighbor.id}` : '空白'} · ${hashLabel(neighborHash)}`;
        button.setAttribute('aria-label', label); button.title = label;
    }
    $('tile-type').value = String(tile?.type ?? 0); $('tile-name').value = tile?.name ?? '';
    $('text-mode').value = typeof text === 'string' ? 'plain' : 'languages';
    $('text-plain').value = typeof text === 'string' ? text : text.zh ?? Object.values(text)[0] ?? '';
    $('text-zh').value = typeof text === 'string' ? text : text.zh ?? '';
    $('text-en').value = typeof text === 'string' ? '' : text.en ?? '';
    $('text-other').value = JSON.stringify(typeof text === 'string' ? {} : Object.fromEntries(Object.entries(text).filter(([key]) => key !== 'zh' && key !== 'en')), null, 2);
    const data = clone(tile?.data ?? {});
    $('tile-script').value = typeof data.script === 'string' ? data.script : '';
    delete data.script;
    $('tile-data').value = JSON.stringify(data, null, 2);
    $('data-summary').textContent = `${Object.keys(data).length} 个字段`;
    $('tile-fields').disabled = !!tile?.instanceId || !editable;
    $('tile-form').hidden = !!tile?.instanceId;
    $('remove-tile').disabled = !tile || !editable;
    $('mounted-note').hidden = !tile?.instanceId;
    $('mounted-note').replaceChildren();
    if (tile?.instanceId) {
        const label = document.createElement('span'); label.textContent = `来自实例 ${tile.instanceId}。先分离整个实例才能逐格编辑。`;
        const button = document.createElement('button'); button.type = 'button'; button.textContent = '分离实例 detach';
        button.onclick = () => guard(() => { requireApplied(); change(() => project.detachInstance(tile.instanceId), '实例已分离，可编辑本格'); });
        const open = document.createElement('button'); open.type = 'button'; open.textContent = '在模块面板中打开';
        open.onclick = () => ui.openPanel('modules');
        $('mounted-note').append(label, open, button);
    }
    for (const section of $('tile-form').querySelectorAll('details')) delete section.dataset.dirty;
    scriptUI.reset();
    fieldDirty = false; renderTextMode(); updateDirty(); renderSelection();
}
function selectHash(hash, options = {}) {
    return guard(() => {
        const canonical = parseAt(String(hash)).join(',');
        if (!discardFields()) return false;
        selectedHash = canonical;
        if (options.toggle) { if (group.has(canonical)) group.delete(canonical); else group.add(canonical); }
        if (options.jump) jump(canonical);
        fillForm(); renderList(); draw();
        window.dispatchEvent(new CustomEvent('map-editor-project-change'));
        return true;
    });
}
function clearPreview(message = '先选择模块并预览。') {
    preview = null; $('confirm-mount').disabled = true;
    $('mount-preview').textContent = message; $('mount-preview').dataset.error = 'false'; draw();
}
function renderLibrary() {
    const previous = $('module-library').value, fragment = document.createDocumentFragment();
    for (const [id, module] of project.modules) {
        const option = document.createElement('option'); option.value = id; option.textContent = `${module.title || id} · ${id}`; fragment.append(option);
    }
    $('module-library').replaceChildren(fragment);
    if (project.modules.has(previous)) $('module-library').value = previous;
    $('preview-mount').disabled = project.modules.size === 0;
}
function renderInstances() {
    const fragment = document.createDocumentFragment();
    for (const instance of project.instances) {
        const card = document.createElement('section'); card.className = 'instance'; card.dataset.instance = instance.id;
        const title = document.createElement('strong'); title.textContent = instance.id;
        const desc = document.createElement('div'); desc.className = 'hint'; desc.textContent = `${instance.moduleId} · [${instance.at.join(',')}] · 旋转 ${instance.rotation}`;
        const actions = document.createElement('div'); actions.className = 'actions';
        const add = (text, action) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.onclick = () => guard(action); actions.append(button); };
        add('定位', () => selectHash(instance.at.join(','), {jump: true}));
        add('填入放置表单', () => {
            $('module-library').value = instance.moduleId; $('instance-id').value = instance.id; $('mount-at').value = JSON.stringify(instance.at); $('mount-rotation').value = String(instance.rotation);
            clearPreview('已填入实例；可修改锚点并预览，或使用实例的“移动到表单位置”。'); $('mount-form').scrollIntoView({block: 'nearest'});
        });
        add('预览移动', () => previewPlacement(instance.id, instance.moduleId));
        add('移动到表单位置', () => {
            requireApplied();
            const placement = readPlacement();
            const result = project.previewMount(instance.moduleId, {...placement, id: instance.id}, instance.id);
            if (result.errors.length) throw Error(result.errors.join('\n'));
            if (!confirm(`将实例 ${instance.id} 移动到 [${placement.at}]，旋转 ${placement.rotation}？`)) return;
            change(() => project.moveInstance(instance.id, {...placement, id: instance.id}), '实例已移动');
        });
        add('旋转 +1', () => { requireApplied(); change(() => project.moveInstance(instance.id, {...instance, rotation: (instance.rotation + 1) % 6}), '实例已旋转'); });
        add('分离', () => { requireApplied(); change(() => project.detachInstance(instance.id), '实例已分离'); });
        add('删除实例', () => {
            requireApplied(); if (confirm(`删除实例 ${instance.id} 及其全部格子？可撤销。`)) change(() => project.removeInstance(instance.id), '实例已删除');
        });
        card.append(title, desc, actions); fragment.append(card);
    }
    if (!project.instances.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = '暂无模块实例。'; fragment.append(empty); }
    $('instances').replaceChildren(fragment);
}
function refresh() {
    syncTiles();
    for (const hash of group) if (!project.tiles.has(hash)) group.delete(hash);
    $('undo').disabled = !project.canUndo; $('redo').disabled = !project.canRedo;
    $('project-id').value = project.id; $('project-title').value = project.title;
    $('project-heading-title').textContent = project.title || '地图编辑器';
    infoDirty = false;
    fillForm(); renderLibrary(); renderInstances(); renderList(); renderSelection(); updateDirty(); draw();
    window.dispatchEvent(new CustomEvent('map-editor-project-change'));
}
function change(action, message) {
    const value = action();
    dirty = true; clearPreview(); refresh(); persist(); say(message); return value;
}
function readPlacement() {
    const id = $('instance-id').value.trim(); if (!id) throw Error('请填写实例 ID。');
    return {id, at: parseAt($('mount-at').value), rotation: Number($('mount-rotation').value)};
}
function previewPlacement(ignoreInstanceId, moduleId = $('module-library').value) {
    clearPreview();
    return guard(() => {
        requireApplied();
        if (!moduleId) throw Error('请先导入模块。');
        const placement = readPlacement();
        if (ignoreInstanceId) placement.id = ignoreInstanceId;
        const result = project.previewMount(moduleId, placement, ignoreInstanceId);
        preview = {...result, placement, moduleId, ignore: ignoreInstanceId};
        $('mount-preview').dataset.error = String(result.errors.length > 0);
        $('mount-preview').textContent = result.errors.length ? `无法挂载 / 移动：\n${result.errors.join('\n')}` :
            `${ignoreInstanceId ? '移动预览' : '挂载预览'}：${result.tiles.size} 格\n锚点 [${placement.at.join(',')}] · 旋转 ${placement.rotation}\n${[...result.tiles.keys()].slice(0, 60).map(hashLabel).join('\n')}${result.tiles.size > 60 ? '\n…其余坐标省略' : ''}`;
        $('confirm-mount').disabled = !!ignoreInstanceId || result.errors.length > 0;
        draw(); return result;
    });
}
function download(name, text, type = 'application/json;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([text], {type})), link = document.createElement('a');
    link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function load(next, {modified = false, message = '项目已加载'} = {}) {
    next.setReadonlyBase(officialTiles.keys());
    project = next; group = new Set(); selectedHash = project.tiles.has('') ? '' : project.tiles.keys().next().value ?? '';
    dirty = modified; fieldDirty = false; infoDirty = false; visibleLimit = 150;
    $('search').value = ''; $('filter').value = 'all';
    clearPreview(); refresh(); jump(selectedHash); say(message);
}
async function officialMap(confirmSwitch = true) {
    if (importBusy) return;
    importBusy = true;
    try {
        const response = await fetch('../../src/hy/map.ts');
        if (!response.ok) throw Error(`无法读取官方 map.ts（HTTP ${response.status}）。`);
        const next = EditorProject.fromSource(await response.text(), world.atlasTile);
        if (confirmSwitch && !discardAll()) return;
        load(next, {message: `官方地图已加载 · ${next.tiles.size} 格`}); persist();
    } catch (error) { say(`加载失败：${error.message}`, true); }
    finally { importBusy = false; }
}
async function importFile(file, purpose) {
    if (importBusy) { say('正在读取文件，请稍后重试。', true); return; }
    importBusy = true;
    try {
        const text = await file.text();
        const json = file.name.toLowerCase().endsWith('.json') || text.trimStart().startsWith('{');
        const data = json ? JSON.parse(text) : null;
        if (purpose === 'module' || data?.format === 'deductrium-map-module-v1') {
            requireApplied();
            const id = change(() => project.registerModule(data), `已注册模块 ${file.name}；请设置实例并预览挂载`);
            $('module-library').value = id;
            return;
        }
        let next;
        const publishedWorld = ['deductrium-world-v1', 'deductrium-world-v2'].includes(data?.format);
        if (publishedWorld) {
            const {projectFromWorld} = await import('./publish.mjs');
            next = projectFromWorld(data, world.atlasTile);
        } else next = json ? EditorProject.fromJSON(data, world.atlasTile) : EditorProject.fromSource(text, world.atlasTile);
        if (!discardAll()) return;
        load(next, {modified: !publishedWorld, message: publishedWorld ? '已导入发布世界；稳定砖块ID保留' : `已导入 ${file.name}`}); persist();
    } catch (error) { say(`导入失败：${error.message}`, true); }
    finally { importBusy = false; }
}
function hashAtPoint(clientX, clientY) {
    const rect = $('map').getBoundingClientRect(), size = Math.min(rect.width, rect.height) * world.localDraw.scale;
    const x = (clientX - rect.left - rect.width / 2) * 2 / size, y = (clientY - rect.top - rect.height / 2) * 2 / size;
    const radius = x * x + y * y;
    if (radius >= 1 || size <= 0) return null;
    const point = world.localCamMat.conj().apply(new Hvec((1 + radius) / (1 - radius), 2 * x / (1 - radius), 2 * y / (1 - radius)));
    for (const [hash, rotor] of world.atlasTile.rotors) if (world.atlasTile.isInDomain(rotor.conj().apply(point)) === -1) return hash;
    return null;
}
function useTool(hash, shift) {
    shift ||= $('multi-select').checked;
    if (!selectHash(hash, {toggle: shift})) return;
    const mode = $('mode').value;
    if (shift || mode === 'select') return;
    guard(() => {
        requireApplied();
        if (mode === 'erase') { if (project.tiles.has(hash)) change(() => project.remove(hash), '格子已擦除'); }
        else {
            const tile = project.tiles.get(hash);
            change(() => project.put(hash, {type: Number(mode), ...(tile?.name ? {name: tile.name} : {}), text: clone(tile?.text ?? ''), data: clone(tile?.data ?? {})}), `已绘制${TYPES[Number(mode)]}`);
        }
    });
}
function wireUI() {
    ui = installUI();
    scriptUI = installScriptEditor({parse: parseMapScript, say, refresh: updateDirty});
    document.addEventListener('input', updateDirty);
    document.addEventListener('change', updateDirty);
    const markFieldsDirty = event => {
        if (event.target.id === 'script-insert') return;
        fieldDirty = true;
        const section = event.target.closest('details');
        if (section) section.dataset.dirty = 'true';
        updateDirty();
    };
    $('tile-form').oninput = markFieldsDirty;
    $('tile-form').onchange = markFieldsDirty;
    $('text-mode').onchange = renderTextMode;
    $('tile-form').onsubmit = event => {
        event.preventDefault(); guard(() => {
            if (infoDirty) throw Error('请先应用项目信息。');
            const original = project.tiles.get(selectedHash);
            const data = scriptUI.readData({focus: true, throwError: true});
            const script = readTextField('tile-script', original?.data?.script);
            scriptUI.check({focus: true, throwError: true});
            if (script.trim() || script === original?.data?.script) data.script = script;
            let text = readTextField('text-plain', original?.text);
            if ($('text-mode').value === 'languages') {
                const other = objectJSON($('text-other').value, '其他语言');
                if (Object.values(other).some(value => typeof value !== 'string')) throw Error('每种语言的文字必须是字符串。');
                const languages = original?.text && typeof original.text === 'object' ? original.text : null;
                text = {...other};
                for (const language of ['zh', 'en']) {
                    const value = readTextField(`text-${language}`, languages?.[language]);
                    if (!languages || Object.hasOwn(languages, language) || value !== '') text[language] = value;
                    else delete text[language];
                }
                // Missing-locale fallback uses the first value; retain its order.
                text = Object.fromEntries([...new Set([...Object.keys(languages ?? {}), ...Object.keys(text)])]
                    .filter(language => Object.hasOwn(text, language)).map(language => [language, text[language]]));
            }
            change(() => project.put(selectedHash, {type: Number($('tile-type').value), name: $('tile-name').value.trim() || undefined, text, data}), '格子属性已应用');
        });
    };
    $('reset-form').onclick = () => { fillForm(); say('已还原为当前格子的已应用属性'); };
    $('remove-tile').onclick = () => guard(() => {
        if (infoDirty || !discardFields()) return;
        if (confirm('删除当前格？可撤销。')) change(() => project.remove(selectedHash), '格子已删除');
    });
    $('project-form').oninput = () => { infoDirty = true; updateDirty(); };
    $('project-form').onsubmit = event => { event.preventDefault(); guard(() => {
        if (fieldDirty) throw Error('请先 Apply 或还原格子表单。');
        change(() => project.setInfo($('project-id').value.trim(), $('project-title').value), '项目信息已应用');
    }); };
    for (const action of ['undo', 'redo']) $(action).onclick = () => guard(() => {
        requireApplied(); if (project[action === 'undo' ? 'canUndo' : 'canRedo']) change(() => project[action](), action === 'undo' ? '已撤销' : '已重做');
    });
    $('new-project').onclick = () => { if (discardAll()) { load(new EditorProject(world.atlasTile), {modified: true, message: '已新建空图；可选空格后 Apply 或使用绘制工具'}); persist(); } };
    $('official-map').onclick = () => officialMap();
    $('import').onclick = () => { filePurpose = 'auto'; $('file').click(); };
    $('import-module').onclick = () => { filePurpose = 'module'; $('file').click(); };
    $('file').onchange = async () => { const file = $('file').files[0]; const purpose = filePurpose; filePurpose = 'auto'; if (file) await importFile(file, purpose); $('file').value = ''; };
    $('export-source').onclick = () => guard(() => { requireApplied(); download('map.ts', project.exportSource(), 'text/plain;charset=utf-8'); say('已导出 map.ts；模块库和实例信息请另存项目 JSON'); });
    $('play-map').onclick = () => guard(() => {
        requireApplied();
        for (const tile of project.tiles.values()) if (tile.data?.script) parseMapScript(tile.data.script);
        const tiles = [...project.tiles].map(([hash, tile]) => [hash, {type: tile.type, name: tile.name, text: tile.text, data: tile.data}]);
        localStorage.setItem('deductrium2_map_preview', JSON.stringify({tiles}));
        window.open('../../index.html?map-editor-preview', '_blank', 'noopener');
        say('已打开隔离试玩；编辑后可再次点击试玩加载新版地图');
    });
    $('export-project').onclick = () => guard(() => { requireApplied(); download('map-project.json', JSON.stringify(project.toJSON(), null, 2)); dirty = false; updateDirty(); say('项目 JSON 已导出'); });
    $('recover-draft').onclick = () => { if (blockedDraft !== null) download('unrecovered-map-editor-draft.json', blockedDraft); };
    $('export-module').onclick = () => guard(() => {
        requireApplied();
        const hashes = group.size ? [...group] : [selectedHash];
        if (!hashes.includes(selectedHash)) throw Error('请将当前格加入选区作为模块原点，或清空选区后导出单格。');
        const module = project.exportModule(hashes, selectedHash, {id: $('module-export-id').value.trim(), title: $('module-export-title').value});
        download('map-module.json', JSON.stringify(module, null, 2)); say(`已导出 ${hashes.length} 格模块`);
    });
    for (const id of ['search', 'filter']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { visibleLimit = 150; renderList(); });
    $('more-tiles').onclick = () => { visibleLimit += 150; renderList(); };
    $('select-filtered').onclick = () => { group = new Set(filteredTiles().map(([hash]) => hash)); renderList(); renderSelection(); draw(); };
    $('clear-group').onclick = () => { group.clear(); renderList(); renderSelection(); draw(); };
    $('map-language').onchange = () => { new LangMgr($('map-language').value); renderList(); draw(); };
    $('grid').onchange = () => { world.debugDraw = $('grid').checked; world.navigateDraw = $('grid').checked; draw(); };
    $('highlight').onchange = () => { world.highLightGetD = $('highlight').checked; draw(); };
    $('locate').onclick = () => jump(selectedHash);
    $('home').onclick = () => selectHash('', {jump: true});
    $('locate-form').onsubmit = event => { event.preventDefault(); guard(() => {
        const location = $('location').value.trim();
        selectHash(nameMap.get(location) ?? parseAt(location).join(','), {jump: true});
    }); };
    for (const button of $('neighbors').querySelectorAll('button[data-edge]')) button.onclick = () => {
        const at = selectedHash ? selectedHash.split(',').map(Number) : [];
        selectHash(world.atlasTile.getNeighborAndDir(at, Number(button.dataset.edge), true)[0].join(','), {jump: true});
    };
    $('anchor-selected').onclick = () => {
        const at = selectedHash ? selectedHash.split(',').map(Number) : [], edge = $('mount-edge').value;
        const target = edge === 'here' ? at : world.atlasTile.getNeighborAndDir(at, Number(edge), true)[0];
        $('mount-at').value = JSON.stringify(target); clearPreview('锚点已更新，请重新预览。');
    };
    for (const id of ['mount-form', 'module-library', 'mount-edge']) {
        $(id).addEventListener('input', () => clearPreview('放置参数已修改，请重新预览。'));
        $(id).addEventListener('change', () => clearPreview('放置参数已修改，请重新预览。'));
    }
    $('preview-mount').onclick = () => previewPlacement();
    $('clear-preview').onclick = () => clearPreview();
    $('mount-form').onsubmit = event => { event.preventDefault(); guard(() => {
        requireApplied(); if (!preview || preview.ignore || preview.errors.length) throw Error('请先完成无冲突的挂载预览。');
        change(() => project.mount(preview.moduleId, preview.placement), '模块已挂载');
    }); };
    const canvas = $('map');
    canvas.onpointerdown = event => {
        if (event.button !== 0 || drag) return;
        canvas.setPointerCapture(event.pointerId); drag = {id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false};
    };
    canvas.onpointermove = event => {
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
        if (drag.moved) {
            const size = Math.min(canvas.clientWidth, canvas.clientHeight);
            world.moveCam(-dx / size * 1.4, dy / size * 1.4); draw();
        }
        drag.x = event.clientX; drag.y = event.clientY;
    };
    canvas.onpointerup = event => {
        if (!drag || drag.id !== event.pointerId) return;
        const click = !drag.moved; drag = null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (click) {
            const hash = hashAtPoint(event.clientX, event.clientY);
            if (mapInteraction?.click(hash, event.clientX, event.clientY)) return;
            if (hash !== null) useTool(hash, event.shiftKey);
        }
    };
    canvas.onpointercancel = canvas.onlostpointercapture = () => { drag = null; };
    window.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault(); $('export-project').click(); return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && $('tile-form').contains(event.target)) {
            event.preventDefault(); if (!$('tile-fields').disabled) $('tile-form').requestSubmit(); return;
        }
        if (!(event.ctrlKey || event.metaKey) || !['z', 'y'].includes(event.key.toLowerCase()) || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
        event.preventDefault(); $(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo').click();
    });
    window.addEventListener('beforeunload', event => { if (dirty || fieldDirty || infoDirty || externalPending()) { event.preventDefault(); event.returnValue = ''; } });
    window.addEventListener('deductrium-theme-change', draw);
    new ResizeObserver(resize).observe(canvas);
}

try {
    const modules = await Promise.all([
        import('./model.mjs'), import('../../js/hy/hworld.js'), import('../../js/hy/algebra.js'),
        import('../../js/hy/maploader.js'), import('../../js/hy/appearance.js'), import('../../js/lang.js'), import('../../js/hy/script.js')
    ]);
    ({EditorProject} = modules[0]); ({Hvec, Rotor} = modules[2]); ({blockMap, nameMap} = modules[3]); ({LangMgr} = modules[5]);
    ({parseMapScript} = modules[6]);
    new LangMgr('zh'); $('map-language').value = 'zh';
    world = new modules[1].HWorld($('map'));
    officialTiles = new Map([...blockMap].map(([hash,tile]) => [hash,clone(tile)]));
    // Free camera traversal must never run reward, gate, ordinal or game-save logic.
    world.hitTest = () => true;
    world.getBlock = hash => blockMap.get(hash) ?? blockMap.get(nameMap.get(hash));
    const {tileColor, tileTextColor, tileDisplayText} = modules[4];
    world.onTileColor = (block, highlight) => tileColor(block, highlight, true);
    world.onTextColor = tileTextColor;
    world.onTileText = tileDisplayText;
    wireUI();
    let restored = false;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw !== null) {
            try { load(EditorProject.fromJSON(JSON.parse(raw), world.atlasTile), {modified: true, message: '已恢复浏览器草稿；请保存项目文件'}); restored = true; }
            catch { blockedDraft = raw; $('recover-draft').hidden = false; }
        }
    } catch { $('draft-status').textContent = '浏览器暂存不可用；仍可保存项目文件'; }
    if (!restored) {
        load(new EditorProject(world.atlasTile));
        await officialMap(false);
        if (blockedDraft !== null) say('旧草稿未能恢复，原记录已保留；可导出未恢复草稿。', true);
    }
    if (restored || blockedDraft !== null) persist();
    resize();
    Object.defineProperty(window, 'mapEditor', {configurable: true, value: Object.freeze({
        get project() { return project; }, get world() { return world; }, get selectedHash() { return selectedHash; },
        get selected() { return project.tiles.get(selectedHash); }, get selection() { return Object.freeze([...group]); },
        get dirty() { return dirty || fieldDirty || infoDirty || externalPending(); }, get preview() { return preview; },
        get officialTiles() { return new Map(officialTiles); },
        storageKey: STORAGE_KEY, selectHash, hashAtPoint,
        openPanel(name, focus = false) { ui.openPanel(name, focus); },
        redraw() { updateDirty(); draw(); },
        setMapInteraction(interaction) { mapInteraction = interaction; draw(); },
        showOfficialBase(visible) { pickerOfficialBase = !!visible; syncTiles(); draw(); },
        registerPendingGuard(check) { pendingGuards.add(check); return () => pendingGuards.delete(check); },
        applyProject(action, message = '项目已更新', options = {}) { requireApplied(options); return change(() => action(project), message); },
        mount(moduleId, placement) { return guard(() => { requireApplied(); return change(() => project.mount(moduleId, placement), '模块已挂载'); }); }
    })});
    try {
        await import('./world-settings.mjs').then(m => m.installWorldSettings(window.mapEditor));
    } catch (error) { console.warn('世界设置模块未加载', error); }
} catch (error) {
    $('fatal').hidden = false;
    $('fatal').textContent = `地图编辑器加载失败：${error.message}\n请从仓库根目录通过 HTTP 打开，确认 model.mjs 和已编译的 js/hy/appearance.js、js/hy/script.js 可用。`;
    say('加载失败', true);
}
