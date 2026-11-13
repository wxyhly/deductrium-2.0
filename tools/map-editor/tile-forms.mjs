/** Structured editors for common tile data and world banks/migrations.
 * Writes only the existing unapplied textareas and dispatches bubbling `input`,
 * so the editor's own Apply / undo path remains the single commit. */
export function installTileForms(api) {
    const $ = id => document.getElementById(id);
    const fields = $('tile-fields');
    const scriptSection = $('script-section');
    if (!fields || !scriptSection) return;

    const section = document.createElement('details');
    section.className = 'author-section';
    section.id = 'author-tile-form';
    const summary = document.createElement('summary');
    summary.textContent = '常用字段';
    const body = document.createElement('div');
    section.append(summary, body);
    fields.insertBefore(section, scriptSection);

    const gateHost = group(body, '门 / 证明');
    const gateKind = labeledSelect(gateHost, '门条件', [
        ['', '（不设置）'], ['p', '证明 p（公式在格子文字）'], ['d', '演绎 d（公式在格子文字）'],
        ['payD', '支付推理素 payD'], ['never', '永不开放 never']
    ]);
    const gateAmount = labeledInput(gateHost, '支付数量', 'number');
    gateAmount.input.min = '0'; gateAmount.input.step = 'any';
    const gateHint = note(gateHost, '证明/演绎的公式写在上方“文字”里；勾选后 data 只记 p:true 或 d:true。');

    const rewardHost = group(body, '奖励');
    const rewardGetD = labeledInput(rewardHost, '获得推理素 getD', 'number');
    rewardGetD.input.min = '0'; rewardGetD.input.step = 'any';
    const rewardLayer = labeledInput(rewardHost, '解锁层级 unl.layer', 'text');
    const rewardInfo = labeledInput(rewardHost, '资料 info（多个用逗号分隔）', 'text');
    const rewardAc = labeledInput(rewardHost, '成就 ac', 'text');
    const rewardDstr = labeledInput(rewardHost, '拆除目标 dstrTarget（多个用逗号分隔）', 'text');
    const rewardRequires = labeledInput(rewardHost, '前置奖励 requiresReward', 'text');

    const status = live(body);
    const actions = document.createElement('div');
    actions.className = 'author-row';
    const write = button(actions, '写入表单', 'primary');
    const clearStructured = button(actions, '清除这些字段');
    const revert = button(actions, '还原这些字段');
    body.append(actions);
    note(body, '只改动这里列出的字段，其余 data、脚本和文字保持原样。写完后仍需点“应用 Apply”才会保存。');

    let syncing = false;
    const draft = pendingDraft(api, status, '常用字段');
    api.registerSelectionGuard(() => {
        if (!draft.dirty) return true;
        section.open = true;
        status.textContent = '常用字段尚未写入，请先写入表单或还原这些字段，再切换格子。';
        status.dataset.error = 'true';
        return false;
    });
    for (const type of ['input', 'change']) body.addEventListener(type, event => {
        event.stopPropagation();
        if (type === 'input' && !syncing && event.target.matches('input, select')) draft.mark();
    });
    blockUnwritten($('tile-form'), 'submit', draft, section, status, '写入表单或还原这些字段');
    const set = (control, value) => { syncing = true; control.value = value; syncing = false; };

    function readData() {
        try { const value = JSON.parse($('tile-data').value); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
        catch { return null; }
    }
    function listValue(value) {
        if (Array.isArray(value)) return value.join(', ');
        return value === undefined || value === null ? '' : String(value);
    }
    function parseList(text) {
        const parts = text.split(',').map(part => part.trim()).filter(Boolean);
        if (!parts.length) return undefined;
        return parts.length === 1 ? parts[0] : parts;
    }
    function refresh() {
        if (!section.isConnected) return;
        if (!draft.reload()) return;
        const data = readData();
        const broken = data === null;
        status.textContent = broken ? '高级 data JSON 目前无法解析，结构化字段已暂停，避免覆盖。' : '';
        status.dataset.error = String(broken);
        for (const control of body.querySelectorAll('input, select, button')) control.disabled = broken || fields.disabled;
        if (broken) return;
        const kind = data.never ? 'never' : data.payD !== undefined ? 'payD' : data.d ? 'd' : data.p ? 'p' : '';
        set(gateKind, kind);
        set(gateAmount.input, data.payD === undefined ? '' : String(data.payD));
        set(rewardGetD.input, data.getD === undefined ? '' : String(data.getD));
        set(rewardLayer.input, data.unl && typeof data.unl === 'object' ? data.unl.layer ?? '' : '');
        set(rewardInfo.input, listValue(data.info));
        set(rewardAc.input, data.ac === undefined ? '' : String(data.ac));
        set(rewardDstr.input, listValue(data.dstrTarget));
        set(rewardRequires.input, data.requiresReward === undefined ? '' : String(data.requiresReward));
        updateVisibility();
    }
    function updateVisibility() {
        const kind = gateKind.value;
        gateAmount.label.hidden = kind !== 'payD';
        gateHint.hidden = kind !== 'p' && kind !== 'd';
    }
    gateKind.addEventListener('change', () => { if (!syncing) updateVisibility(); });

    function amount(input, label) {
        if (input.value.trim() === '') return undefined;
        const value = Number(input.value);
        if (!Number.isFinite(value) || value < 0 || value > 1e12) throw Error(`${label} 须为 0～1e12 的数字。`);
        return value;
    }
    function commit(mutate) {
        const current = readData();
        if (!current) { status.textContent = '高级 data JSON 无法解析，未写入。'; status.dataset.error = 'true'; return; }
        try { mutate(current); }
        catch (error) { status.textContent = error.message; status.dataset.error = 'true'; return; }
        $('tile-data').value = JSON.stringify(current, null, 2);
        draft.reset();
        $('tile-data').dispatchEvent(new Event('input', {bubbles: true}));
        refresh();
        status.textContent = '已写入表单，尚未应用。请在下方点“应用 Apply”。';
        status.dataset.error = 'false';
    }
    const GATE_KEYS = ['p', 'd', 'payD', 'never'];
    write.addEventListener('click', () => commit(data => {
        for (const key of GATE_KEYS) delete data[key];
        const kind = gateKind.value;
        if (kind === 'payD') data.payD = amount(gateAmount.input, '支付数量') ?? 0;
        else if (kind === 'never') data.never = true;
        else if (kind === 'p' || kind === 'd') data[kind] = true;
        const getD = amount(rewardGetD.input, '获得推理素');
        if (getD === undefined) delete data.getD; else data.getD = getD;
        const layer = rewardLayer.input.value.trim();
        if (layer) data.unl = {...(data.unl && typeof data.unl === 'object' ? data.unl : {}), layer};
        else if (data.unl && typeof data.unl === 'object') { const rest = {...data.unl}; delete rest.layer; if (Object.keys(rest).length) data.unl = rest; else delete data.unl; }
        for (const [key, input] of [['info', rewardInfo.input], ['dstrTarget', rewardDstr.input]]) {
            const value = parseList(input.value);
            if (value === undefined) delete data[key]; else data[key] = value;
        }
        for (const [key, input] of [['ac', rewardAc.input], ['requiresReward', rewardRequires.input]]) {
            const value = input.value.trim();
            if (value) data[key] = value; else delete data[key];
        }
    }));
    clearStructured.addEventListener('click', () => commit(data => {
        for (const key of [...GATE_KEYS, 'getD', 'info', 'ac', 'dstrTarget', 'requiresReward']) delete data[key];
        if (data.unl && typeof data.unl === 'object') { const rest = {...data.unl}; delete rest.layer; if (Object.keys(rest).length) data.unl = rest; else delete data.unl; }
    }));
    revert.addEventListener('click', () => { draft.reset(); refresh(); status.textContent = '已还原常用字段。'; });

    window.addEventListener('map-editor-project-change', refresh);
    window.addEventListener('map-editor-selection-change', refresh);
    $('tile-data').addEventListener('input', () => { if (!syncing) refresh(); });
    refresh();

    installBanks(api);
    installMigrations(api);
}

const ROUNDING = [['none', '不取整 none'], ['floor', '向下 floor'], ['ceil', '向上 ceil'], ['round', '四舍五入 round']];
const RATE_FIELDS = [
    ['from', '源币种 from', 'text'], ['to', '目标币种 to', 'text'], ['rate', '汇率 rate', 'number'],
    ['feeRate', '费率 feeRate', 'number'], ['feeFixed', '固定费 feeFixed', 'number'], ['minimum', '最小额 minimum', 'number'],
    ['precision', '精度 precision', 'number']
];

function installBanks(api) {
    const area = document.getElementById('world-banks');
    if (!area) return;
    const box = document.createElement('details');
    box.className = 'author-section';
    const summary = document.createElement('summary');
    summary.textContent = '结构化银行';
    const host = document.createElement('div');
    box.append(summary, host);
    (area.closest('label') ?? area).before(box);
    note(host, '每个银行是 { 规则… }；方向必须写全 from/to/rate/feeRate/feeFixed/minimum/rounding/precision。币种用 reasoning、type 或本世界币种。');
    const list = document.createElement('div');
    list.className = 'author-list';
    host.append(list);
    const status = live(host);
    let banks = {}, active = null;
    const draft = pendingDraft(api, status, '银行');
    const canOpen = () => {
        if (!draft.dirty) return true;
        status.textContent = '银行尚未写入，请先写入银行表或还原银行表，再编辑其他银行。';
        status.dataset.error = 'true';
        return false;
    };

    function parse() {
        try { const value = JSON.parse(area.value); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
        catch (error) { status.textContent = `银行 JSON 无法解析：${error.message}`; status.dataset.error = 'true'; return null; }
    }
    function writeBack() {
        area.value = JSON.stringify(banks, null, 2);
        draft.reset();
        active = null;
        area.dispatchEvent(new Event('input', {bubbles: true}));
        status.textContent = '已写入银行 JSON，请在世界设置里点“应用世界设置”。';
        status.dataset.error = 'false';
        render();
    }
    function render() {
        list.replaceChildren();
        const ids = Object.keys(banks);
        if (!ids.length) { const empty = document.createElement('p'); empty.className = 'author-empty'; empty.textContent = '还没有银行。'; list.append(empty); }
        for (const id of ids) {
            const item = document.createElement('div');
            item.className = 'author-item';
            const main = document.createElement('div');
            main.className = 'author-item-main';
            const title = document.createElement('strong');
            title.textContent = id;
            const count = document.createElement('small');
            count.textContent = `${(banks[id]?.rules ?? []).length} 个兑换方向`;
            main.append(title, count);
            const edit = button(item, '编辑');
            edit.addEventListener('click', () => { if (canOpen()) open(id); });
            item.prepend(main);
            list.append(item);
        }
        if (active) open(active.id, active.draft);
    }
    function open(id, data) {
        list.querySelector('.author-form')?.remove();
        active = {id, draft: data ?? structuredClone(banks[id] ?? {rules: []})};
        const form = document.createElement('div');
        form.className = 'author-form';
        const idInput = labeledInput(form, '银行 ID', 'text');
        idInput.input.value = active.draft.id ?? id;
        idInput.input.addEventListener('input', () => { active.draft.id = idInput.input.value; });
        const rules = document.createElement('div');
        form.append(rules);
        const drawRules = () => {
            rules.replaceChildren();
            active.draft.rules.forEach((rule, index) => {
                const card = document.createElement('div');
                card.className = 'author-group';
                const legend = document.createElement('strong');
                legend.textContent = `方向 ${index + 1}`;
                card.append(legend);
                const grid = document.createElement('div');
                grid.className = 'author-kv';
                for (const [key, label, type] of RATE_FIELDS) {
                    const input = document.createElement('input');
                    input.type = type; input.placeholder = label; input.setAttribute('aria-label', label);
                    input.value = rule[key] ?? '';
                    if (type === 'number') { input.min = '0'; input.step = 'any'; }
                    input.addEventListener('input', () => { active.draft.rules[index][key] = type === 'number' ? input.value : input.value.trim(); });
                    grid.append(input);
                }
                const rounding = document.createElement('select');
                rounding.setAttribute('aria-label', '取整 rounding');
                for (const [value, label] of ROUNDING) { const option = document.createElement('option'); option.value = value; option.textContent = label; rounding.append(option); }
                rounding.value = rule.rounding || 'none';
                rounding.addEventListener('change', () => { active.draft.rules[index].rounding = rounding.value; });
                const remove = button(card, '删除方向', 'author-danger');
                remove.addEventListener('click', () => { active.draft.rules.splice(index, 1); draft.mark(); drawRules(); });
                card.append(grid, rounding, remove);
                rules.append(card);
            });
        };
        drawRules();
        const row = document.createElement('div');
        row.className = 'author-row';
        const addRule = button(row, '添加方向');
        addRule.addEventListener('click', () => {
            active.draft.rules.push({from: 'reasoning', to: 'type', rate: 1, feeRate: 0, feeFixed: 0, minimum: 1, rounding: 'none', precision: 12});
            draft.mark();
            drawRules();
        });
        const save = button(row, '写入此银行', 'primary');
        save.addEventListener('click', saveAll);
        const removeBank = button(row, '删除此银行', 'author-danger');
        removeBank.addEventListener('click', () => { delete banks[id]; active = null; mark(); render(); });
        form.append(row);
        list.append(form);
    }
    function saveAll() {
        if (active) {
            const nextId = (active.draft.id ?? active.id).trim();
            if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(nextId) || nextId.startsWith('builtin:')) {
                status.textContent = '银行 ID 须以字母或数字开头，不能用 builtin: 前缀。'; status.dataset.error = 'true'; return;
            }
            let rules;
            try { rules = active.draft.rules.map(normalizeRule); }
            catch (error) { status.textContent = error.message; status.dataset.error = 'true'; return; }
            if (!rules.length) { status.textContent = '银行至少需要一个兑换方向。'; status.dataset.error = 'true'; return; }
            if (nextId !== active.id && Object.hasOwn(banks, nextId)) {
                status.textContent = '该银行 ID 已存在，未写入。'; status.dataset.error = 'true'; return;
            }
            if (nextId !== active.id) delete banks[active.id];
            banks[nextId] = {rules};
        }
        writeBack();
    }
    const mark = () => draft.mark();
    for (const type of ['input', 'change']) host.addEventListener(type, event => {
        event.stopPropagation();
        if (type === 'input' && event.target.matches('input, select')) mark();
    });
    blockUnwritten(document.getElementById('world-apply'), 'click', draft, box, status, '写入银行表或还原银行表');
    const add = button(host, '添加银行');
    add.addEventListener('click', () => {
        if (!canOpen() || parse() === null) return;
        let n = Object.keys(banks).length + 1;
        while (Object.hasOwn(banks, `bank-${n}`)) n++;
        open(`bank-${n}`, {rules: []}); mark(); box.open = true;
    });
    button(host, '写入银行表', 'primary').addEventListener('click', saveAll);
    button(host, '还原银行表').addEventListener('click', () => { draft.reset(); reload(); status.textContent = '已还原银行表。'; });
    function reload() {
        if (!draft.reload()) return;
        banks = {}; active = null;
        const value = parse();
        if (!value) { list.replaceChildren(); return; }
        banks = value; active = null; status.textContent = ''; render();
    }
    area.addEventListener('input', reload);
    window.addEventListener('map-editor-project-change', reload);
    reload();
}

function normalizeRule(raw) {
    const rule = {};
    for (const key of ['from', 'to']) {
        const value = String(raw[key] ?? '').trim();
        if (!value || /[\s;"']/.test(value)) throw Error(`方向的 ${key} 币种无效。`);
        rule[key] = value;
    }
    if (rule.from === rule.to) throw Error('兑换的两个币种必须不同。');
    for (const key of ['rate', 'feeRate', 'feeFixed', 'minimum']) {
        const value = Number(raw[key]);
        if (!Number.isFinite(value) || value < 0 || value > 1e12) throw Error(`${key} 须为 0～1e12 的数字。`);
        rule[key] = value;
    }
    if (rule.rate === 0) throw Error('汇率 rate 必须大于 0。');
    if (!['none', 'floor', 'ceil', 'round'].includes(raw.rounding)) throw Error('取整方式无效。');
    const precision = Number(raw.precision);
    if (!Number.isInteger(precision) || precision < 0 || precision > 12) throw Error('精度 precision 须为 0～12 的整数。');
    rule.rounding = raw.rounding; rule.precision = precision;
    return rule;
}

function installMigrations(api) {
    const area = document.getElementById('world-migrations');
    if (!area) return;
    const box = document.createElement('details');
    box.className = 'author-section';
    const summary = document.createElement('summary');
    summary.textContent = '结构化迁移';
    const host = document.createElement('div');
    box.append(summary, host);
    (area.closest('label') ?? area).before(box);
    note(host, '每次升级一条：from → to。remap 把旧砖块 ID 对应到新 ID，留空目标表示删除该身份；reset 列出需要清空进度的 ID。');
    const list = document.createElement('div');
    list.className = 'author-list';
    host.append(list);
    const status = live(host);
    let rows = [];
    const draft = pendingDraft(api, status, '迁移');
    for (const type of ['input', 'change']) host.addEventListener(type, event => {
        event.stopPropagation();
        if (type === 'input' && event.target.matches('input')) draft.mark();
    });
    blockUnwritten(document.getElementById('world-apply'), 'click', draft, box, status, '写入迁移表或还原迁移表');

    function parse() {
        try { const value = JSON.parse(area.value); return Array.isArray(value) ? value : null; }
        catch (error) { status.textContent = `迁移 JSON 无法解析：${error.message}`; status.dataset.error = 'true'; return null; }
    }
    function writeBack() {
        let value;
        try {
            value = rows.map(row => {
                const from = Number(row.from), to = Number(row.to);
                if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || from >= to)
                    throw Error('from、to 须为正整数且 from < to。');
                const remap = {};
                for (const pair of row.remap) {
                    const old = pair.old.trim();
                    if (!old || Object.hasOwn(remap, old)) throw Error('旧砖块 ID 不能为空或重复。');
                    Object.defineProperty(remap, old, {value: pair.next.trim() || null, enumerable: true});
                }
                return {from, to, remap, reset: row.reset.split(',').map(part => part.trim()).filter(Boolean)};
            });
        } catch (error) { status.textContent = error.message; status.dataset.error = 'true'; return; }
        area.value = JSON.stringify(value, null, 2);
        draft.reset();
        area.dispatchEvent(new Event('input', {bubbles: true}));
        status.textContent = '已写入迁移 JSON，请在世界设置里点“应用世界设置”。';
        status.dataset.error = 'false';
        render();
    }
    function render() {
        list.replaceChildren();
        if (!rows.length) { const empty = document.createElement('p'); empty.className = 'author-empty'; empty.textContent = '还没有迁移计划。'; list.append(empty); return; }
        rows.forEach((row, index) => {
            const form = document.createElement('div');
            form.className = 'author-form';
            const head = document.createElement('div');
            head.className = 'author-row';
            const from = labeledInput(head, 'from', 'number'); from.input.value = row.from ?? '';
            const to = labeledInput(head, 'to', 'number'); to.input.value = row.to ?? '';
            from.input.addEventListener('input', () => { row.from = from.input.value; });
            to.input.addEventListener('input', () => { row.to = to.input.value; });
            form.append(head);
            const remapHost = document.createElement('div');
            form.append(remapHost);
            const drawRemap = () => {
                remapHost.replaceChildren();
                row.remap.forEach((pair, pairIndex) => {
                    const line = document.createElement('div');
                    line.className = 'author-kv';
                    const a = document.createElement('input'); a.placeholder = '旧 ID'; a.setAttribute('aria-label', '旧砖块 ID'); a.value = pair.old;
                    const b = document.createElement('input'); b.placeholder = '新 ID（空=删除）'; b.setAttribute('aria-label', '新砖块 ID'); b.value = pair.next;
                    const remove = button(line, '移除');
                    a.addEventListener('input', () => { pair.old = a.value; });
                    b.addEventListener('input', () => { pair.next = b.value; });
                    remove.addEventListener('click', () => { row.remap.splice(pairIndex, 1); draft.mark(); drawRemap(); });
                    line.append(a, b, remove); remapHost.append(line);
                });
            };
            drawRemap();
            const reset = labeledInput(form, 'reset（逗号分隔的砖块 ID）', 'text');
            reset.input.value = row.reset;
            reset.input.addEventListener('input', () => { row.reset = reset.input.value; });
            const actions = document.createElement('div');
            actions.className = 'author-row';
            const addMap = button(actions, '添加 remap');
            addMap.addEventListener('click', () => {
                row.remap.push({old: '', next: ''}); draft.mark(); drawRemap();
            });
            const save = button(actions, '写入此条', 'primary');
            save.addEventListener('click', writeBack);
            const remove = button(actions, '删除此条', 'author-danger');
            remove.addEventListener('click', () => { rows.splice(index, 1); draft.mark(); render(); });
            form.append(actions);
            list.append(form);
        });
    }
    const add = button(host, '添加迁移');
    add.addEventListener('click', () => {
        if (parse() === null) return;
        const revision = Number(document.getElementById('world-revision')?.value) || 1;
        rows.push({from: Math.max(1, revision - 1), to: Math.max(2, revision), remap: [], reset: ''});
        draft.mark();
        box.open = true; render();
    });
    button(host, '写入迁移表', 'primary').addEventListener('click', writeBack);
    button(host, '还原迁移表').addEventListener('click', () => { draft.reset(); reload(); status.textContent = '已还原迁移表。'; });
    function reload() {
        if (!draft.reload()) return;
        rows = [];
        const value = parse();
        if (!value) { list.replaceChildren(); return; }
        rows = value.map(row => ({from: row.from ?? '', to: row.to ?? '',
            remap: Object.entries(row.remap ?? {}).map(([old, next]) => ({old, next: next ?? ''})),
            reset: Array.isArray(row.reset) ? row.reset.join(', ') : ''}));
        status.textContent = ''; render();
    }
    area.addEventListener('input', reload);
    window.addEventListener('map-editor-project-change', reload);
    reload();
}

// A project replacement is an accepted discard; ordinary refreshes never discard drafts.
function pendingDraft(api, status, name) {
    let project = api.project, dirty = false;
    const current = () => {
        if (project !== api.project) { project = api.project; dirty = false; }
        return dirty;
    };
    api.registerPendingGuard(current);
    return {
        get dirty() { return current(); },
        mark() {
            project = api.project; dirty = true;
            status.textContent = `${name}尚未写入，请先写入或还原。`;
            status.dataset.error = 'false';
            api.redraw();
        },
        reset() { project = api.project; dirty = false; api.redraw(); },
        reload() { return !current(); }
    };
}

function blockUnwritten(target, type, draft, section, status, action) {
    target?.addEventListener(type, event => {
        if (!draft.dirty) return;
        event.preventDefault(); event.stopImmediatePropagation(); section.open = true;
        status.textContent = `还有未写入的结构化字段，请先${action}。`;
        status.dataset.error = 'true';
        status.scrollIntoView({block: 'nearest'});
    }, true);
}

function group(parent, title) {
    const box = document.createElement('fieldset');
    box.className = 'author-group';
    const legend = document.createElement('legend');
    legend.textContent = title;
    box.append(legend); parent.append(box); return box;
}
function labeledSelect(parent, label, options) {
    const field = document.createElement('label');
    field.textContent = label;
    const select = document.createElement('select');
    select.setAttribute('aria-label', label);
    for (const [value, text] of options) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
    field.append(select); parent.append(field); return select;
}
function labeledInput(parent, label, type) {
    const field = document.createElement('label');
    field.textContent = label;
    const input = document.createElement('input');
    input.type = type; input.autocomplete = 'off';
    field.append(input); parent.append(field);
    return {label: field, input};
}
function button(parent, text, cls) {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = text;
    if (cls) element.className = cls === 'primary' ? '' : cls;
    if (cls === 'primary') element.classList.add('primary');
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
