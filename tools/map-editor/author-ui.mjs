/** Authoring workflow UI: bulk edit, literal search/replace, diagnostics,
 * map-owned content library, publication metadata and portable bundles.
 * Mounted beside the existing panels; never writes through their hosts. */
import {installTileForms} from './tile-forms.mjs';
import {validateWorldContent} from '../../js/hy/world-content.js';
import {checkWorldContent} from '../../js/hy/script-engine.js';
import {validatePublication} from '../../js/hy/publication.js';
import {exportWorldBundle, migrationDiff} from '../../js/hy/world-bundle.js';
import {buildWorld} from './publish.mjs';

const TYPES = ['道路', '墙', '门', '奖励', '序数'];
const SEARCH_FIELDS = [['', '全部字段'], ['text', '文字'], ['name', '名称'], ['data.script', '脚本'], ['data', 'data'], ['title', '项目标题']];
const CONTENT_KINDS = [['rules', '规则'], ['definitions', '定义'], ['knowledge', '资料'], ['achievements', '成就']];

export function installAuthorUI(api) {
    installTileForms(api);
    const projectPanel = document.getElementById('project-panel');
    const tilesPanel = document.getElementById('tiles-panel');
    if (!projectPanel || !tilesPanel) return;

    const search = mountSearch(api, tilesPanel);
    const bulk = mountBulk(api, tilesPanel);
    mountIssues(api, tilesPanel);
    const library = mountLibrary(api, projectPanel);
    const publication = mountPublication(api, projectPanel);
    mountBundle(api, projectPanel);
    mountMigration(api, projectPanel);
    mountDebugNote(projectPanel);

    window.addEventListener('map-editor-project-change', () => {
        search.onProjectChange();
        bulk.onProjectChange();
        library.onProjectChange();
        publication.onProjectChange();
    });
    window.addEventListener('map-editor-group-change', () => {
        search.onProjectChange();
        bulk.onProjectChange();
    });
}

function mountSearch(api, panel) {
    const {section, host} = disclosure(panel, '全字段查找与替换', {open: false});
    note(host, '按字面量查找（不是正则）。先预览差异，确认后再应用；只读字段会被跳过。');
    const query = labeledInput(host, '查找', 'search');
    const replacement = labeledInput(host, '替换为', 'text');
    const row = document.createElement('div');
    row.className = 'author-row';
    const field = labeledSelect(row, '字段', SEARCH_FIELDS);
    const sensitive = check(row, '区分大小写');
    const selectionOnly = check(row, '仅选区');
    host.append(row);
    const actions = document.createElement('div');
    actions.className = 'author-row';
    const find = button(actions, '查找');
    const preview = button(actions, '预览替换');
    const apply = button(actions, '应用替换', 'primary');
    apply.disabled = true;
    host.append(actions);
    const status = live(host);
    const results = document.createElement('div');
    results.className = 'author-list';
    host.append(results);
    let previewToken = 0;

    function options() {
        const value = {query: query.input.value, caseSensitive: sensitive.checked};
        if (field.value) value.fields = [field.value];
        if (selectionOnly.checked) value.hashes = api.selection;
        return value;
    }
    function invalidate() { previewToken++; apply.disabled = true; }
    for (const input of [query.input, replacement.input, field]) input.addEventListener('input', invalidate);
    field.addEventListener('change', invalidate);
    sensitive.addEventListener('change', invalidate);
    selectionOnly.addEventListener('change', invalidate);

    find.addEventListener('click', () => {
        invalidate();
        try {
            const matches = api.project.searchProject(options());
            results.replaceChildren();
            status.dataset.error = 'false';
            status.textContent = matches.length ? `找到 ${matches.length} 处。` : '没有匹配。';
            for (const match of matches.slice(0, 200)) results.append(matchRow(api, match));
            if (matches.length > 200) note(results, `其余 ${matches.length - 200} 处已省略，请缩小范围。`);
        } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
    });
    preview.addEventListener('click', () => {
        const token = ++previewToken;
        try {
            const result = api.project.previewReplace({...options(), replacement: replacement.input.value});
            results.replaceChildren();
            status.dataset.error = String(result.errors.length > 0);
            status.textContent = `将修改 ${result.changes.length} 处，跳过只读 ${result.skipped.length} 处${result.errors.length ? `，${result.errors.length} 个错误` : ''}。`;
            for (const error of result.errors) results.append(errorRow(error));
            for (const change of result.changes.slice(0, 100)) results.append(diffRow(api, change));
            apply.disabled = token !== previewToken || !result.changes.length || result.errors.length > 0;
        } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; apply.disabled = true; }
    });
    apply.addEventListener('click', () => {
        const token = previewToken;
        try {
            api.applyProject(project => {
                const result = project.applyReplace({...options(), replacement: replacement.input.value});
                if (!result.changes.length) throw Error('没有可应用的替换。');
                return result;
            }, '替换已应用');
            if (token === previewToken) { apply.disabled = true; status.textContent = '替换已应用。'; status.dataset.error = 'false'; results.replaceChildren(); }
        } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
    });
    return {onProjectChange() { invalidate(); }};
}

function matchRow(api, match) {
    const item = document.createElement('div');
    item.className = 'author-item';
    const main = document.createElement('div');
    main.className = 'author-item-main';
    const title = document.createElement('strong');
    title.textContent = match.tileId ? `${match.tileId} · ${match.field}` : match.field;
    const excerpt = document.createElement('span');
    excerpt.textContent = clip(String(match.value), 160);
    const meta = document.createElement('small');
    meta.textContent = `${match.hash ?? '项目'}${match.readOnly ? ' · 只读' : ''}`;
    main.append(title, excerpt, meta);
    item.append(main);
    if (match.hash !== undefined) item.append(jumpButton(api, match.hash));
    return item;
}
function diffRow(api, change) {
    const item = matchRow(api, change);
    const diff = document.createElement('div');
    diff.className = 'author-diff';
    const before = document.createElement('del');
    before.textContent = clip(String(change.before), 120);
    const after = document.createElement('ins');
    after.textContent = clip(String(change.after), 120);
    diff.append(before, document.createTextNode(' → '), after);
    item.querySelector('.author-item-main').append(diff);
    return item;
}

function mountBulk(api, panel) {
    const {host} = disclosure(panel, '批量编辑选区');
    note(host, '作用于格子列表里勾选的选区，一次撤销。实例格与范围外的格子会被拒绝，整批不会部分生效。');
    const summary = document.createElement('p');
    summary.className = 'author-note';
    host.append(summary);
    const type = labeledSelect(host, '类型（留空不改）', [['', '不修改'], ['0', '道路'], ['1', '墙'], ['2', '门'], ['3', '奖励'], ['4', '序数']]);
    const row = document.createElement('div');
    row.className = 'author-row';
    const getD = labeledInput(row, 'getD', 'number');
    const payD = labeledInput(row, 'payD', 'number');
    for (const input of [getD.input, payD.input]) { input.min = '0'; input.step = 'any'; }
    host.append(row);
    const script = labeledArea(host, '脚本（留空不改）', 3);
    const removeScript = check(host, '移除脚本');
    const advanced = document.createElement('details');
    const advancedSummary = document.createElement('summary');
    advancedSummary.textContent = '高级 JSON 补丁';
    const patch = labeledArea(advanced, 'patch JSON', 4);
    patch.value = '{}';
    advanced.append(advancedSummary);
    host.append(advanced);
    const actions = document.createElement('div');
    actions.className = 'author-row';
    const apply = button(actions, '应用到选区', 'primary');
    host.append(actions);
    const status = live(host);
    const impact = document.createElement('div');
    host.append(impact);

    const danger = document.createElement('div');
    danger.className = 'author-form';
    const dangerTitle = document.createElement('strong');
    dangerTitle.textContent = '批量删除';
    danger.append(dangerTitle);
    note(danger, '先查看影响，再确认删除。删除可撤销，但会清掉这些格子的进度身份。');
    const impactButton = button(danger, '查看删除影响');
    const confirm = button(danger, '确认删除选区', 'author-danger');
    confirm.disabled = true;
    host.append(danger);
    let impactToken = 0;

    function selectionNote() {
        const count = api.selection.length;
        summary.textContent = count ? `当前选区 ${count} 格。` : '选区为空。请先在格子列表勾选。';
    }
    selectionNote();
    function amount(input, label) {
        if (input.value.trim() === '') return undefined;
        const value = Number(input.value);
        if (!Number.isFinite(value) || value < 0 || value > 1e12) throw Error(`${label} 须为 0～1e12 的数字。`);
        return value;
    }
    apply.addEventListener('click', () => {
        try {
            const hashes = api.selection;
            if (!hashes.length) throw Error('选区为空。');
            const extra = JSON.parse(patch.value || '{}');
            if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw Error('补丁须为 JSON 对象。');
            const value = {...extra};
            if (type.value !== '') value.type = Number(type.value);
            const reward = {};
            const gained = amount(getD.input, 'getD'), paid = amount(payD.input, 'payD');
            if (gained !== undefined) reward.getD = gained;
            if (paid !== undefined) reward.payD = paid;
            if (Object.keys(reward).length) value.reward = {...reward, ...(value.reward ?? {})};
            if (removeScript.checked) value.script = null;
            else if (script.value.trim()) value.script = script.value;
            if (!Object.keys(value).length) throw Error('没有要修改的内容。');
            api.applyProject(project => project.batchEdit(hashes, value), `已批量修改 ${hashes.length} 格`);
            status.textContent = '批量修改已应用。'; status.dataset.error = 'false';
        } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
    });
    impactButton.addEventListener('click', () => {
        const token = ++impactToken;
        confirm.disabled = true; impact.replaceChildren();
        try {
            const hashes = api.selection;
            if (!hashes.length) throw Error('选区为空。');
            const result = api.project.deleteImpact(hashes);
            const lines = [`将删除 ${result.tileIds.length} 格：${result.tileIds.slice(0, 12).join('、')}${result.tileIds.length > 12 ? '…' : ''}`];
            if (result.readOnly.length) lines.push(`只读/实例格 ${result.readOnly.length} 个，删除会被拒绝：${result.readOnly.slice(0, 8).join('、')}`);
            if (result.references.length) lines.push(`${result.references.length} 处引用指向这些格子。`);
            if (result.dependentTileIds.length) lines.push(`${result.dependentTileIds.length} 个格子依赖它们：${result.dependentTileIds.slice(0, 8).join('、')}`);
            status.textContent = lines.join('\n'); status.dataset.error = 'false';
            for (const ref of result.references.slice(0, 30)) impact.append(errorRow({...ref, message: `${ref.kind} → ${ref.target}`}));
            confirm.disabled = token !== impactToken || result.readOnly.length > 0;
        } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
    });
    confirm.addEventListener('click', () => {
        try {
            const hashes = api.selection;
            const result = api.project.deleteImpact(hashes);
            if (result.readOnly.length) throw Error('选区含只读或实例格，已取消。');
            if (!window.confirm(`确认删除 ${result.tileIds.length} 格？此操作可撤销。`)) return;
            api.applyProject(project => project.batchEdit(hashes, {delete: true}), `已删除 ${result.tileIds.length} 格`);
            confirm.disabled = true; impact.replaceChildren();
            status.textContent = '选区已删除。'; status.dataset.error = 'false';
        } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
    });
    for (const input of [type, getD.input, payD.input, script, patch, removeScript]) input.addEventListener('input', () => { status.textContent = ''; });
    return {onProjectChange() { selectionNote(); impactToken++; confirm.disabled = true; impact.replaceChildren(); }};
}

function mountIssues(api, panel) {
    const {section, host} = disclosure(panel, '地图检查');
    note(host, '只读分析：引用、依赖和连通性。不会修改项目。');
    const actions = document.createElement('div');
    actions.className = 'author-row';
    const refresh = button(actions, '重新检查', 'primary');
    const filter = labeledSelect(actions, '严重级别', [['', '全部'], ['error', '错误'], ['warning', '警告']]);
    host.append(actions);
    const counts = document.createElement('div');
    counts.className = 'author-counts';
    host.append(counts);
    const status = live(host);
    const list = document.createElement('div');
    list.className = 'author-list';
    host.append(list);
    let report = null;

    function render() {
        list.replaceChildren(); counts.replaceChildren();
        if (!report) return;
        const diagnostics = report.diagnostics ?? [];
        for (const severity of ['error', 'warning']) {
            const count = diagnostics.filter(item => item.severity === severity).length;
            const pill = document.createElement('span');
            pill.className = 'author-pill'; pill.dataset.severity = severity;
            pill.textContent = `${severity === 'error' ? '错误' : '警告'} ${count}`;
            counts.append(pill);
        }
        const visible = diagnostics.filter(item => !filter.value || item.severity === filter.value);
        status.textContent = visible.length ? '' : '没有符合筛选的问题。';
        for (const item of visible.slice(0, 300)) {
            const row = document.createElement('div');
            row.className = 'author-item'; row.dataset.severity = item.severity || '';
            const main = document.createElement('div');
            main.className = 'author-item-main';
            const title = document.createElement('strong');
            title.textContent = item.message || item.code || '问题';
            const meta = document.createElement('small');
            meta.textContent = [item.tileId, item.field, item.line ? `第 ${item.line} 行` : '', item.hash].filter(Boolean).join(' · ');
            main.append(title, meta); row.append(main);
            if (item.hash !== undefined) row.append(jumpButton(api, item.hash));
            list.append(row);
        }
        const topology = report.topology;
        if (topology) {
            const extra = document.createElement('p');
            extra.className = 'author-note';
            extra.textContent = `连通分量 ${topology.components?.length ?? 0} · 孤立 ${topology.isolatedTileIds?.length ?? 0} · 不可达 ${topology.unreachableTileIds?.length ?? 0}${topology.allowsExternalPaths ? ' · 扩展地图仅检查局部路径' : ''}`;
            list.append(extra);
        }
    }
    function run() {
        try {
            report = api.project.analyzeProject();
            status.dataset.error = 'false'; render();
        } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
    }
    refresh.addEventListener('click', run);
    filter.addEventListener('change', render);
    window.addEventListener('map-editor-project-change', () => { if (section.open && report) run(); });
    section.addEventListener('toggle', () => { if (section.open && !report) run(); });
}

function mountLibrary(api, panel) {
    const {host} = disclosure(panel, '地图内容库');
    const hint = note(host, '');
    const kind = labeledSelect(host, '集合', CONTENT_KINDS);
    const list = document.createElement('div');
    list.className = 'author-list';
    host.append(list);
    const form = document.createElement('div');
    form.className = 'author-form';
    form.hidden = true;
    host.append(form);
    const status = live(host);
    const actions = document.createElement('div');
    actions.className = 'author-row';
    const add = button(actions, '新增');
    const apply = button(actions, '应用内容库', 'primary');
    const cancel = button(actions, '放弃修改');
    host.append(actions);
    let draft = null, editing = null, formDirty = false, formKind = kind.value;
    let ownerProject = api.project;

    api.registerPendingGuard(() => formDirty);
    function worldReady() { return !!api.project.world; }
    function source() { return draft ?? api.project.world?.content ?? blankContent(); }
    function updateHint() {
        hint.textContent = worldReady()
            ? '规则 ID 用原子名（如 qIdentity，勿用 c/v/u/a/d 开头）。应用时才校验；证明必须是完整的已检查证明，不能把定理直接升成公理。'
            : '请先在世界设置里配置并应用世界，再编辑内容库。';
        for (const control of [add, apply, cancel, kind]) control.disabled = !worldReady();
    }
    function renderList() {
        list.replaceChildren();
        const entries = source()[kind.value] ?? [];
        if (!entries.length) { const empty = document.createElement('p'); empty.className = 'author-empty'; empty.textContent = '此集合还没有条目。'; list.append(empty); }
        entries.forEach((entry, index) => {
            const item = document.createElement('div');
            item.className = 'author-item';
            const main = document.createElement('div');
            main.className = 'author-item-main';
            const title = document.createElement('strong');
            title.textContent = entry.id || `（未命名 ${index + 1}）`;
            const meta = document.createElement('small');
            meta.textContent = entry.symbol || entry.statement || textOf(entry.title) || '';
            main.append(title, meta);
            const edit = button(item, '编辑');
            edit.disabled = !worldReady();
            edit.addEventListener('click', () => openForm(index));
            item.prepend(main); list.append(item);
        });
    }
    function openForm(index) {
        if (!form.hidden) { status.textContent = '请先加入或更新当前条目，或放弃修改。'; status.dataset.error = 'true'; return; }
        editing = index;
        formKind = kind.value;
        const entry = index === null ? blankEntry(kind.value) : structuredClone(source()[kind.value][index]);
        form.hidden = false; form.replaceChildren();
        const id = labeledInput(form, '本地 ID', 'text');
        id.input.value = entry.id ?? '';
        const fields = {id};
        if (kind.value === 'rules') {
            fields.statement = labeledArea(form, '命题 statement', 2); fields.statement.value = entry.statement ?? '';
            fields.proof = labeledArea(form, '证明 proof', 6); fields.proof.value = entry.proof ?? '';
            const sample = button(form, '填入示例 qIdentity');
            sample.addEventListener('click', () => { id.input.value = 'qIdentity'; fields.statement.value = '⊢$1→$1'; fields.proof.value = 'd .i $1'; formDirty = true; api.redraw(); });
        } else if (kind.value === 'definitions') {
            fields.defKind = labeledSelect(form, '种类', [['constant', '常量'], ['function', '函数'], ['predicate', '谓词']]);
            fields.defKind.value = entry.kind ?? 'function';
            fields.symbol = labeledInput(form, '符号 symbol', 'text'); fields.symbol.input.value = entry.symbol ?? '';
            fields.parameters = labeledInput(form, '参数（空格分隔，如 $x $y）', 'text');
            fields.parameters.input.value = (entry.parameters ?? []).join(' ');
            fields.body = labeledArea(form, '定义体 body', 2); fields.body.value = entry.body ?? '';
        } else {
            const localized = (name, value) => {
                const zh = labeledInput(form, `${name}（中文）`, 'text'); zh.input.value = textOf(value, 'zh');
                const en = labeledInput(form, `${name}（English）`, 'text'); en.input.value = textOf(value, 'en');
                return {zh, en};
            };
            fields.title = localized('标题', entry.title);
            if (kind.value === 'knowledge') { fields.body = localized('正文', entry.body); fields.body.zh.input = area(fields.body.zh); fields.body.en.input = area(fields.body.en); }
            else { fields.description = localized('描述', entry.description); fields.description.zh.input = area(fields.description.zh); fields.description.en.input = area(fields.description.en); }
        }
        const row = document.createElement('div');
        row.className = 'author-row';
        const save = button(row, index === null ? '加入列表' : '更新列表', 'primary');
        const remove = button(row, '从列表移除', 'author-danger');
        remove.hidden = index === null;
        form.append(row);
        form.oninput = () => { formDirty = true; api.redraw(); };
        save.addEventListener('click', () => {
            try {
                const next = collectEntry(kind.value, fields);
                const content = structuredClone(source());
                content[kind.value] = [...(content[kind.value] ?? [])];
                if (index === null) content[kind.value].push(next); else content[kind.value][index] = next;
                draft = content; formDirty = true; form.hidden = true; editing = null;
                status.textContent = '已更新列表，尚未应用。'; status.dataset.error = 'false'; renderList();
            } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
        });
        remove.addEventListener('click', () => {
            const content = structuredClone(source());
            content[kind.value] = content[kind.value].filter((_, at) => at !== index);
            draft = content; formDirty = true; form.hidden = true; editing = null; renderList();
        });
    }
    add.addEventListener('click', () => openForm(null));
    kind.addEventListener('change', () => {
        if (!form.hidden) { kind.value = formKind; status.textContent = '请先加入或更新当前条目，或放弃修改。'; status.dataset.error = 'true'; return; }
        editing = null; renderList();
    });
    apply.addEventListener('click', () => {
        try {
            if (!worldReady()) throw Error('请先配置世界。');
            if (!form.hidden) throw Error('请先将当前条目加入或更新列表。');
            const content = validateWorldContent(structuredClone(source()));
            checkWorldContent(content);
            api.applyProject(project => project.setWorld({...project.world, content}), '内容库已应用', {allowExternalPending: true});
            draft = null; formDirty = false; form.hidden = true;
            status.textContent = '内容库已应用。'; status.dataset.error = 'false'; renderList();
        } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
    });
    cancel.addEventListener('click', () => { draft = null; formDirty = false; form.hidden = true; status.textContent = '已放弃未应用的修改。'; renderList(); });
    return {onProjectChange() {
        if (ownerProject !== api.project) {
            ownerProject = api.project; draft = null; editing = null; formDirty = false; form.hidden = true;
        }
        if (!formDirty) { draft = null; renderList(); }
        updateHint();
    }};
}

function collectEntry(kind, fields) {
    const id = fields.id.input.value.trim();
    if (!id) throw Error('请填写 ID。');
    if (kind === 'rules') return {id, statement: fields.statement.value, proof: fields.proof.value};
    if (kind === 'definitions') {
        const parameters = fields.parameters.input.value.split(/\s+/).filter(Boolean);
        return {id, kind: fields.defKind.value, symbol: fields.symbol.input.value.trim(), parameters, body: fields.body.value};
    }
    const localized = group => {
        const value = {};
        if (group.zh.input.value.trim()) value.zh = group.zh.input.value;
        if (group.en.input.value.trim()) value.en = group.en.input.value;
        if (!Object.keys(value).length) throw Error('请至少填写中文或英文。');
        return Object.keys(value).length === 1 ? Object.values(value)[0] : value;
    };
    const entry = {id, title: localized(fields.title)};
    if (kind === 'knowledge') entry.body = localized(fields.body); else entry.description = localized(fields.description);
    return entry;
}
function area(field) {
    const input = document.createElement('textarea');
    input.rows = 3; input.value = field.input.value;
    field.input.replaceWith(input); field.input = input; return input;
}

function mountPublication(api, panel) {
    const {host} = disclosure(panel, '发布信息');
    note(host, '作者、简介、引擎版本和依赖。应用后随世界一起保存，旧存档不会被改写。');
    const author = labeledInput(host, '作者', 'text');
    const description = labeledArea(host, '简介', 3);
    const version = labeledInput(host, '引擎版本（如 2.0）', 'text');
    version.input.placeholder = '2.0';
    const deps = document.createElement('div');
    host.append(deps);
    const add = button(host, '添加依赖');
    const actions = document.createElement('div');
    actions.className = 'author-row';
    const apply = button(actions, '应用发布信息', 'primary');
    const cancel = button(actions, '放弃修改');
    host.append(actions);
    const status = live(host);
    let rows = [], dirty = false, loadedProject = api.project;
    api.registerPendingGuard(() => dirty);

    function drawDeps() {
        deps.replaceChildren();
        rows.forEach((row, index) => {
            const line = document.createElement('div');
            line.className = 'author-kv';
            const id = document.createElement('input'); id.placeholder = '依赖世界 ID'; id.setAttribute('aria-label', '依赖世界 ID'); id.value = row.id;
            const min = document.createElement('input'); min.type = 'number'; min.min = '1'; min.placeholder = '最低 revision'; min.setAttribute('aria-label', '最低 revision'); min.value = row.minRevision;
            const max = document.createElement('input'); max.type = 'number'; max.min = '1'; max.placeholder = '最高（可选）'; max.setAttribute('aria-label', '最高 revision'); max.value = row.maxRevision ?? '';
            const remove = button(line, '移除');
            for (const input of [id, min, max]) input.addEventListener('input', () => { dirty = true; rows[index] = readDep(id, min, max); });
            remove.addEventListener('click', () => { rows.splice(index, 1); dirty = true; drawDeps(); });
            line.append(id, min, max, remove); deps.append(line);
        });
    }
    function load() {
        if (loadedProject !== api.project) {
            loadedProject = api.project;
            dirty = false;
            status.textContent = ''; status.dataset.error = 'false';
        }
        if (dirty) return;
        const value = api.project.world?.publication ?? {};
        author.input.value = value.author ?? ''; description.value = value.description ?? ''; version.input.value = value.engineVersion ?? '';
        rows = (value.dependencies ?? []).map(dep => ({...dep})); drawDeps();
        apply.disabled = !api.project.world;
    }
    add.addEventListener('click', () => { rows.push({id: '', minRevision: 1}); dirty = true; drawDeps(); });
    for (const input of [author.input, description, version.input]) input.addEventListener('input', () => { dirty = true; });
    apply.addEventListener('click', () => {
        try {
            if (!api.project.world) throw Error('请先配置世界。');
            const publication = {};
            if (author.input.value.trim()) publication.author = author.input.value;
            if (description.value.trim()) publication.description = description.value;
            if (version.input.value.trim()) publication.engineVersion = version.input.value.trim();
            const dependencies = rows.filter(row => row.id.trim()).map(row => ({id: row.id.trim(), minRevision: Number(row.minRevision), ...(row.maxRevision ? {maxRevision: Number(row.maxRevision)} : {})}));
            if (dependencies.length) publication.dependencies = dependencies;
            const validated = validatePublication(publication, api.project.id);
            api.applyProject(project => project.setWorld({...project.world, publication: validated}), '发布信息已应用', {allowExternalPending: true});
            dirty = false; status.textContent = '发布信息已应用。'; status.dataset.error = 'false';
        } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
    });
    cancel.addEventListener('click', () => { dirty = false; status.textContent = '已放弃未应用的修改。'; load(); });
    load();
    return {onProjectChange: load};
}
function readDep(id, min, max) {
    return {id: id.value, minRevision: min.value, ...(max.value.trim() ? {maxRevision: max.value} : {})};
}

function mountBundle(api, panel) {
    const {host} = disclosure(panel, '导出世界包');
    note(host, '导出当前地图及本地已安装的依赖世界。可选附带游戏导出的 .dt 存档或 {mode, worldId?, compressed} JSON；不改动任何旧存档。');
    const file = document.createElement('input');
    file.type = 'file'; file.accept = '.dt,.json,.txt';
    const label = document.createElement('label');
    label.textContent = '附带存档（可选）'; label.append(file);
    host.append(label);
    const saveNote = note(host, '未选择存档时只导出地图。');
    const download = button(host, '导出世界包', 'primary');
    const status = live(host);
    let save = null, readToken = 0;
    file.addEventListener('change', async () => {
        const token = ++readToken;
        save = null; saveNote.textContent = '未选择存档时只导出地图。';
        const chosen = file.files?.[0];
        download.disabled = !!chosen;
        if (!chosen) return;
        try {
            const text = await chosen.text();
            let parsed;
            try { parsed = JSON.parse(text); }
            catch {
                const data = JSON.parse(LZString.decompressFromUTF16(text) || 'null');
                if (!data || typeof data.mode !== 'string') throw Error('无法识别游戏压缩存档。');
                parsed = {mode: data.mode, ...(data.mode.startsWith('world-') ? {worldId: data.mode.slice(6)} : {}), compressed: text};
            }
            if (!parsed || typeof parsed.compressed !== 'string' || typeof parsed.mode !== 'string') throw Error('存档须包含 mode 和 compressed。');
            if (token !== readToken) return;
            save = parsed; saveNote.textContent = `将附带存档 ${chosen.name}（mode: ${parsed.mode}）。`;
            status.textContent = ''; status.dataset.error = 'false';
        } catch (error) {
            if (token !== readToken) return;
            status.textContent = `存档无法读取：${error.message}`; status.dataset.error = 'true'; file.value = '';
        } finally { if (token === readToken) download.disabled = false; }
    });
    download.addEventListener('click', async () => {
        download.disabled = true; file.disabled = true;
        try {
            const world = buildWorld(api.project);
            const worlds = new Map([[world.id, world]]);
            if (world.publication?.dependencies?.length) {
                const {readModLibrary} = await import('../../js/hy/mods.js');
                const installed = new Map(readModLibrary().map(entry => [entry.world.id, entry.world]));
                const collect = manifest => {
                    for (const dependency of manifest.publication?.dependencies ?? []) {
                        if (worlds.has(dependency.id)) continue;
                        const target = installed.get(dependency.id);
                        if (!target) throw Error(`世界 ${manifest.id} 缺少依赖 ${dependency.id}；请先在游戏设置中安装依赖地图。`);
                        worlds.set(target.id, target);
                        collect(target);
                    }
                };
                collect(world);
            }
            const bundle = exportWorldBundle([...worlds.values()], save ?? undefined);
            const link = document.createElement('a');
            link.href = URL.createObjectURL(new Blob([bundle], {type: 'application/json'}));
            link.download = `${world.id}.bundle.json`; link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            status.textContent = '世界包已导出。'; status.dataset.error = 'false';
        } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
        finally { download.disabled = false; file.disabled = false; }
    });
}

function mountMigration(api, panel) {
    const {host} = disclosure(panel, '迁移差异');
    note(host, '选择上一版世界 JSON，与当前地图对比。只展示差异，不修改任何存档。');
    const file = document.createElement('input');
    file.type = 'file'; file.accept = '.json';
    const label = document.createElement('label');
    label.textContent = '上一版世界 JSON'; label.append(file);
    host.append(label);
    const status = live(host);
    const report = document.createElement('div');
    host.append(report);
    file.addEventListener('change', async () => {
        report.replaceChildren();
        const chosen = file.files?.[0]; if (!chosen) return;
        try {
            const oldWorld = JSON.parse(await chosen.text());
            const next = buildWorld(api.project);
            const diff = migrationDiff(oldWorld, next);
            status.dataset.error = String(!diff.valid);
            status.textContent = diff.valid ? `revision ${diff.fromRevision} → ${diff.toRevision}` : diff.issues.join('\n');
            const groups = [['保留', diff.retained], ['移动', diff.moved], ['目标变化', diff.goalchanges], ['删除', diff.deleted], ['重映射', diff.remapped], ['重置', diff.reset]];
            for (const [name, changes] of groups) {
                if (!changes?.length) continue;
                const heading = document.createElement('h3');
                heading.textContent = `${name}（${changes.length}）`;
                report.append(heading);
                for (const change of changes.slice(0, 100)) report.append(changeRow(api, change));
            }
            if (diff.added?.length) {
                const heading = document.createElement('h3');
                heading.textContent = `新增（${diff.added.length}）`;
                report.append(heading);
                for (const tile of diff.added.slice(0, 100)) {
                    const item = document.createElement('div');
                    item.className = 'author-item';
                    const main = document.createElement('div');
                    main.className = 'author-item-main';
                    const title = document.createElement('strong'); title.textContent = tile.id;
                    const meta = document.createElement('small'); meta.textContent = tile.hash || '原点';
                    main.append(title, meta); item.append(main, jumpButton(api, tile.hash));
                    report.append(item);
                }
            }
            if (![...groups.map(([, changes]) => changes?.length), diff.added?.length].some(Boolean)) note(report, '没有砖块差异。');
        } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; }
    });
}
function changeRow(api, change) {
    const item = document.createElement('div');
    item.className = 'author-item';
    const main = document.createElement('div');
    main.className = 'author-item-main';
    const title = document.createElement('strong');
    title.textContent = change.toId && change.toId !== change.fromId ? `${change.fromId} → ${change.toId}` : change.fromId;
    const meta = document.createElement('small');
    meta.textContent = [change.fromHash, change.toHash && change.toHash !== change.fromHash ? `→ ${change.toHash}` : ''].filter(Boolean).join(' ');
    main.append(title);
    if (change.oldGoal !== change.newGoal) {
        const goals = document.createElement('span');
        goals.textContent = `${clip(change.oldGoal ?? '', 60)} → ${clip(change.newGoal ?? '（删除）', 60)}`;
        main.append(goals);
    }
    main.append(meta); item.append(main);
    if (change.toHash) item.append(jumpButton(api, change.toHash));
    return item;
}

function mountDebugNote(panel) {
    const {host} = disclosure(panel, '调试试玩');
    note(host, '“试玩世界”会带上作者调试参数，在游戏里逐步查看脚本触发。调试记录只存在于那次试玩，不会写回地图或存档。');
}

function jumpButton(api, hash) {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = '跳转';
    element.addEventListener('click', () => api.selectHash(hash, {jump: true}));
    return element;
}
function errorRow(error) {
    const item = document.createElement('div');
    item.className = 'author-item'; item.dataset.severity = 'error';
    const main = document.createElement('div');
    main.className = 'author-item-main';
    const title = document.createElement('strong');
    title.textContent = error.message || '错误';
    const meta = document.createElement('small');
    meta.textContent = [error.tileId, error.field, error.line ? `第 ${error.line} 行` : ''].filter(Boolean).join(' · ');
    main.append(title, meta); item.append(main); return item;
}

function disclosure(panel, title) {
    const section = document.createElement('details');
    section.className = 'author-section';
    const summary = document.createElement('summary');
    summary.textContent = title;
    const host = document.createElement('div');
    section.append(summary, host);
    const anchor = panel.querySelector('.publish-bar');
    panel.insertBefore(section, anchor);
    return {section, host};
}
function labeledInput(parent, label, type) {
    const field = document.createElement('label');
    field.textContent = label;
    const input = document.createElement('input');
    input.type = type; input.autocomplete = 'off';
    field.append(input); parent.append(field); return {label: field, input};
}
function labeledArea(parent, label, rows) {
    const field = document.createElement('label');
    field.textContent = label;
    const area = document.createElement('textarea');
    area.rows = rows; area.spellcheck = false;
    field.append(area); parent.append(field); return area;
}
function labeledSelect(parent, label, options) {
    const field = document.createElement('label');
    field.textContent = label;
    const select = document.createElement('select');
    select.setAttribute('aria-label', label);
    for (const [value, text] of options) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
    field.append(select); parent.append(field); return select;
}
function check(parent, text) {
    const field = document.createElement('label');
    field.className = 'author-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    field.append(input, document.createTextNode(text)); parent.append(field); return input;
}
function button(parent, text, cls) {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = text;
    if (cls === 'primary') element.classList.add('primary');
    else if (cls) element.className = cls;
    parent.append(element); return element;
}
function note(parent, text) {
    const element = document.createElement('p');
    element.className = 'author-note'; element.textContent = text;
    parent.append(element); return element;
}
function live(parent) {
    const element = document.createElement('p');
    element.className = 'author-status'; element.setAttribute('role', 'status'); element.setAttribute('aria-live', 'polite');
    parent.append(element); return element;
}
function clip(text, limit) { const value = String(text).replace(/\s+/g, ' '); return value.length > limit ? `${value.slice(0, limit)}…` : value; }
function textOf(value, language) {
    if (typeof value === 'string') return language && language !== 'zh' ? '' : value;
    if (value && typeof value === 'object') return value[language] ?? (language ? '' : value.zh ?? value.en ?? '');
    return '';
}
function blankContent() { return {rules: [], definitions: [], knowledge: [], achievements: []}; }
function blankEntry(kind) {
    if (kind === 'rules') return {id: '', statement: '', proof: ''};
    if (kind === 'definitions') return {id: '', kind: 'function', symbol: '', parameters: [], body: ''};
    if (kind === 'knowledge') return {id: '', title: {}, body: {}};
    return {id: '', title: {}, description: {}};
}
