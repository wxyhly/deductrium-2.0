import {SCRIPT_RULES, SCRIPT_TRIGGER_TIMINGS, supportedScriptGroups} from './script-help.mjs';

// Some browsers omit the offset in JSON.parse errors. Scan only on failure to
// locate the first invalid token; JSON.parse remains the authoritative parser.
function jsonErrorOffset(source) {
    let offset = 0;
    const fail = () => { throw offset; };
    const space = () => { while (/[\t\n\r ]/.test(source[offset] || '\0')) offset++; };
    function string() {
        offset++;
        while (offset < source.length) {
            const character = source[offset++];
            if (character === '"') return;
            if (character.charCodeAt(0) < 32) { offset--; fail(); }
            if (character === '\\') {
                if (source[offset] === 'u') {
                    offset++;
                    for (let i = 0; i < 4; i++, offset++) if (!/[0-9a-f]/i.test(source[offset] || 'x')) fail();
                } else if (!/["\\/bfnrt]/.test(source[offset++] || '\0')) { offset--; fail(); }
            }
        }
        fail();
    }
    function value() {
        space();
        const token = source[offset];
        if (token === '"') return string();
        if (token === '{' || token === '[') {
            const object = token === '{', close = object ? '}' : ']';
            offset++; space();
            if (source[offset] === close) { offset++; return; }
            while (offset < source.length) {
                if (object) {
                    if (source[offset] !== '"') fail();
                    string(); space(); if (source[offset] !== ':') fail(); offset++;
                }
                value(); space();
                if (source[offset] === close) { offset++; return; }
                if (source[offset] !== ',') fail();
                offset++; space();
            }
            fail();
        }
        const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(offset));
        if (!literal) fail();
        offset += literal[0].length;
    }
    try { value(); space(); } catch { /* offset identifies the invalid token */ }
    return offset;
}

export function installScriptEditor({parse, say, refresh}) {
    const $ = id => document.getElementById(id);
    const script = $('tile-script'), data = $('tile-data'), gutter = $('script-gutter');
    let scriptIssue = null, dataIssue = null, scriptChecked = false, dataChecked = false;
    let scriptTimer, dataTimer;
    const lines = () => script.value.split('\n');
    function renderGutter() {
        const fragment = document.createDocumentFragment();
        lines().forEach((_, i) => {
            const number = document.createElement('span'); number.textContent = String(i + 1);
            if (i + 1 === scriptIssue?.line) number.className = 'err';
            fragment.append(number);
        });
        gutter.replaceChildren(fragment); gutter.scrollTop = script.scrollTop;
    }
    function gotoLine(field, line, column = null) {
        const source = field.value.split('\n'), at = Math.min(Math.max(line - 1, 0), source.length - 1);
        const start = source.slice(0, at).reduce((offset, text) => offset + text.length + 1, 0);
        field.closest('details').open = true;
        field.focus();
        const offset = column === null ? start : start + Math.min(column - 1, source[at].length);
        field.setSelectionRange(offset, column === null ? start + source[at].length : offset);
        field.scrollTop = Math.max(0, at * parseFloat(getComputedStyle(field).lineHeight) - field.clientHeight / 2);
        gutter.scrollTop = script.scrollTop;
    }
    function showScriptIssue(error) {
        const message = error.message || String(error), match = /^Map script line (\d+):\s*([\s\S]*)$/.exec(message);
        scriptIssue = {line: Number(match?.[1] || 1), message};
        $('script-error-text').textContent = `第 ${scriptIssue.line} 行：${lines()[scriptIssue.line - 1] ?? ''} — ${match?.[2] || message}`;
        $('script-error').hidden = false; script.setAttribute('aria-invalid', 'true');
        $('script-summary').textContent = `第 ${scriptIssue.line} 行有错误`;
        renderGutter(); refresh();
    }
    const commandCount = commands => commands.reduce((count, command) => count + (command.op === 'if'
        ? command.branches.reduce((n, branch) => n + commandCount(branch.body), 0) + commandCount(command.elseBody || []) : 1), 0);
    function check({focus = false, announce = false, throwError = false} = {}) {
        clearTimeout(scriptTimer); scriptChecked = true;
        try {
            const commands = parse(script.value);
            scriptIssue = null; $('script-error').hidden = true; script.removeAttribute('aria-invalid');
            $('script-summary').textContent = script.value.trim() ? `${commandCount(commands)} 条命令 ✓` : '未配置';
            renderGutter(); refresh();
            if (announce) say('脚本语法检查通过');
            return commands;
        } catch (error) {
            showScriptIssue(error);
            if (focus) gotoLine(script, scriptIssue.line);
            if (announce) say(error.message || String(error), true);
            if (throwError) throw error;
            return null;
        }
    }
    function showDataIssue(error) {
        const message = error.message || String(error), position = /position (\d+)/i.exec(message);
        const location = /line (\d+) column (\d+)/i.exec(message);
        const offset = position ? Number(position[1]) : error instanceof SyntaxError ? jsonErrorOffset(data.value) : 0;
        const prefix = data.value.slice(0, offset).split('\n');
        dataIssue = {line: location ? Number(location[1]) : prefix.length, column: location ? Number(location[2]) : prefix.at(-1).length + 1};
        $('data-error').textContent = `第 ${dataIssue.line} 行，第 ${dataIssue.column} 列：${message}`;
        $('data-error').hidden = false; data.setAttribute('aria-invalid', 'true'); refresh();
    }
    function readData({focus = false, throwError = false} = {}) {
        clearTimeout(dataTimer); dataChecked = true;
        try {
            const value = JSON.parse(data.value);
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('data 必须是 JSON 对象。');
            if (Object.hasOwn(value, 'script')) throw Error('请在上方地图脚本字段编辑 script，其他 data JSON 不要重复填写 script。');
            dataIssue = null; $('data-error').hidden = true; data.removeAttribute('aria-invalid');
            $('data-summary').textContent = `${Object.keys(value).length} 个字段`; refresh();
            return value;
        } catch (error) {
            showDataIssue(error);
            if (focus) gotoLine(data, dataIssue.line, dataIssue.column);
            if (throwError) throw error;
            return null;
        }
    }
    function insert(item) {
        $('script-section').open = true; script.focus();
        const start = script.selectionStart, end = script.selectionEnd;
        const prefix = start && script.value[start - 1] !== '\n' ? '\n' : '';
        const suffix = end < script.value.length && script.value[end] !== '\n' ? '\n' : '';
        const text = prefix + item.template + suffix, before = script.value;
        // Native insertion keeps textarea undo history. Fall back for other engines.
        let inserted = false;
        try { inserted = document.execCommand('insertText', false, text); } catch { /* fallback below */ }
        if (!inserted || script.value === before) script.setRangeText(text, start, end, 'end');
        script.dispatchEvent(new Event('input', {bubbles: true}));
        const placeholder = item.select ? item.template.indexOf(item.select) : -1;
        if (placeholder >= 0) script.setSelectionRange(start + prefix.length + placeholder, start + prefix.length + placeholder + item.select.length);
        $('script-insert').value = '';
    }
    const entries = new Map(), help = document.createDocumentFragment();
    const timings = document.createElement('table'); timings.className = 'script-trigger-timings';
    const caption = document.createElement('caption'); caption.textContent = '触发时机'; timings.append(caption);
    const head = timings.createTHead().insertRow();
    for (const label of ['格子类型', '触发时机']) {
        const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; head.append(cell);
    }
    const body = timings.createTBody();
    for (const [type, timing] of SCRIPT_TRIGGER_TIMINGS) {
        const row = body.insertRow(), label = document.createElement('th');
        label.scope = 'row'; label.textContent = type; row.append(label);
        row.insertCell().textContent = timing;
    }
    help.append(timings);
    const rules = document.createElement('p'); rules.className = 'hint'; rules.textContent = SCRIPT_RULES; help.append(rules);
    for (const group of supportedScriptGroups(parse)) {
        const options = document.createElement('optgroup'); options.label = group.label;
        const heading = document.createElement('h4'); heading.textContent = group.label;
        const list = document.createElement('dl'); help.append(heading, list);
        for (const item of group.entries) {
            entries.set(item.id, item);
            const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; options.append(option);
            const term = document.createElement('dt'), code = document.createElement('code'); code.textContent = item.template;
            const button = document.createElement('button'); button.type = 'button'; button.textContent = '插入';
            button.setAttribute('aria-label', `插入${item.label}`); button.onclick = () => insert(item);
            term.append(code, button);
            const note = document.createElement('dd'); note.textContent = item.note; list.append(term, note);
        }
        $('script-insert').append(options);
    }
    $('script-help').replaceChildren(help);
    $('script-insert').onchange = () => { const item = entries.get($('script-insert').value); if (item) insert(item); };
    $('script-check').onclick = () => check({announce: true});
    $('script-help-toggle').onclick = () => {
        $('script-help').hidden = !$('script-help').hidden;
        $('script-help-toggle').setAttribute('aria-expanded', String(!$('script-help').hidden));
    };
    $('script-goto').onclick = () => { if (scriptIssue) gotoLine(script, scriptIssue.line); };
    script.addEventListener('scroll', () => { gutter.scrollTop = script.scrollTop; });
    script.addEventListener('input', () => {
        renderGutter(); clearTimeout(scriptTimer);
        if (scriptChecked) scriptTimer = setTimeout(() => check(), 300);
        else $('script-summary').textContent = script.value.trim() ? `已配置 · ${lines().length} 行` : '未配置';
    });
    // These actions validate or discard the draft themselves. Rendering a blur
    // error can move the button between pointerdown and click and cancel it.
    const handlesDraft = target => target?.id === 'apply-tile' || target?.id === 'reset-form';
    script.addEventListener('blur', event => {
        if (handlesDraft(event.relatedTarget)) clearTimeout(scriptTimer);
        else check();
    });
    data.addEventListener('blur', event => {
        if (handlesDraft(event.relatedTarget)) clearTimeout(dataTimer);
        else readData();
    });
    data.addEventListener('input', () => {
        clearTimeout(dataTimer);
        if (dataChecked) dataTimer = setTimeout(() => readData(), 300);
    });
    return {
        check, readData,
        get errorMessage() { return scriptIssue ? `脚本第 ${scriptIssue.line} 行有错误` : dataIssue ? `data 第 ${dataIssue.line} 行有错误` : ''; },
        reset() {
            clearTimeout(scriptTimer); clearTimeout(dataTimer);
            scriptIssue = dataIssue = null; scriptChecked = dataChecked = false;
            for (const field of [script, data]) field.removeAttribute('aria-invalid');
            $('script-error').hidden = $('data-error').hidden = true;
            $('script-summary').textContent = script.value.trim() ? `已配置 · ${lines().length} 行` : '未配置';
            renderGutter();
        }
    };
}
