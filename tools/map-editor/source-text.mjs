// Text-only map editing. Original source slices are retained for unchanged rows.
export function fingerprint(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0).toString(16).padStart(8, '0');
}

function decodeTemplate(raw) {
    let text = ''; const offsets = [];
    for (let i = 0; i < raw.length;) {
        const start = i; let value = raw[i++];
        if (value === '$' && raw[i] === '{') throw Error('不支持含插值的地图模板。');
        if (value === '\\') {
            const c = raw[i++];
            if (c === undefined) throw Error('地图模板末尾有不完整的转义。');
            if (c === '\n') continue;
            if (c === '\r') { if (raw[i] === '\n') i++; continue; }
            const simple = {n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0'};
            if (Object.hasOwn(simple, c)) value = simple[c];
            else if (c === 'x' || c === 'u') {
                const brace = c === 'u' && raw[i] === '{';
                const end = brace ? raw.indexOf('}', i) : i + (c === 'x' ? 2 : 4);
                const hex = raw.slice(i + (brace ? 1 : 0), end);
                if (!/^[\da-f]+$/i.test(hex) || end < i || end > raw.length) throw Error('无效的模板 Unicode 转义。');
                value = String.fromCodePoint(parseInt(hex, 16)); i = end + (brace ? 1 : 0);
            } else value = c;
        }
        text += value;
        for (let j = 0; j < value.length; j++) offsets.push(start);
    }
    offsets.push(raw.length);
    return {text, offsets};
}

function bracketEnd(text, start) {
    let depth = 0, quote = '';
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '[') depth++;
        else if (c === ']' && --depth === 0) return i + 1;
    }
    throw Error('元数据方括号未闭合。');
}

export function readText(text) {
    const values = {}; let lang = '', buffer = '', pre = '', multilingual = false;
    for (let i = 0; i < text.length;) {
        if (text[i] === '\\' && /[\[\]]/.test(text[i + 1] || ' ')) { buffer += text[i + 1]; i += 2; continue; }
        const tag = text.slice(i).match(/^\[(n|[A-Za-z]{2,3})\]/);
        if (tag) {
            i += tag[0].length;
            if (tag[1] === 'n') { buffer += '\n'; continue; }
            if (lang) values[lang] = (values[lang] || '') + buffer; else pre += buffer;
            lang = tag[1]; buffer = ''; multilingual = true; continue;
        }
        buffer += text[i++];
    }
    if (!multilingual) return {'':buffer};
    values[lang] = (values[lang] || '') + buffer;
    values[Object.keys(values)[0]] = pre + values[Object.keys(values)[0]];
    return values;
}

function validateValues(values) {
    const keys = Object.keys(values);
    if (!keys.length || keys.some(key => key !== '' && !/^[A-Za-z]{2,3}$/.test(key)) || (keys.includes('') && keys.length > 1)) throw Error('无效的语言字段。');
}

export function writeText(values) {
    validateValues(values);
    // The runtime treats a backslash immediately before [ as a literal bracket.
    // Put a single backslash-ended language last so it cannot escape the next tag.
    const keys = Object.keys(values).sort((a,b) => Number(values[a].endsWith('\\')) - Number(values[b].endsWith('\\')));
    const escape = value => value.replace(/\r\n?/g, '\n').replace(/[\[\]]/g, '\\$&').replaceAll('\n', '[n]');
    const text = keys.map(key => (key ? `[${key}]` : '') + escape(values[key])).join('');
    const decoded = readText(text);
    if (keys.some(key => decoded[key] !== values[key].replace(/\r\n?/g, '\n')) || Object.keys(decoded).length !== keys.length) {
        throw Error('地图格式无法保留紧接换行或另一语言标记的反斜杠，请调整该处文案；草稿仍可保存。');
    }
    return text.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
}

export class MapDocument {
    constructor(source, polygon) {
        const match = /export\s+const\s+mapData\s*=\s*`/.exec(source);
        const end = source.lastIndexOf('`');
        if (!match || end <= match.index + match[0].length) throw Error('请选择含 export const mapData = `…` 的 map.ts。');
        this.source = source; this.fingerprint = fingerprint(source); this.edits = new Map();
        this.start = match.index + match[0].length; this.end = end;
        this.lines = source.slice(this.start, end).split('\n'); this.records = []; this.tiles = new Map();
        const names = new Map(), stack = []; let previous = [], section = '游戏大厅', inTT = false;
        const firstLine = source.slice(0, this.start).split('\n').length;
        for (let index = 0; index < this.lines.length; index++) {
            const raw = this.lines[index], {text, offsets} = decodeTemplate(raw.replace(/\r$/, '')), trimmed = text.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('//')) {
                if (!/^\/\/\s*[:%\d]/.test(trimmed)) section = trimmed.slice(2).trim();
                if (section === '序数附加') inTT = false;
                continue;
            }
            if (trimmed === '{') { stack.push(previous); continue; }
            if (trimmed === '}') { if (!stack.length) throw Error(`第 ${firstLine + index} 行：多余的 }。`); previous = stack.pop(); continue; }
            const head = text.trimStart().match(/^([^@|#$O]*)([@|#$O])/);
            if (!head) throw Error(`第 ${firstLine + index} 行：无法识别格子。`);
            const indent = text.length - text.trimStart().length;
            let address = head[1], pos = indent + head[0].length, parent = null, tile = [];
            const named = address.match(/^:([^,]+),/);
            if (named) { parent = named[1]; address = address.slice(named[0].length); }
            else if (address.startsWith('%*')) { parent = '%*'; address = address.slice(2).replace(/^,/, ''); }
            else if (address.startsWith('%')) { parent = '%'; address = address.slice(1).replace(/^,/, ''); }
            if (parent === '%') tile = previous;
            else if (parent === '%*') tile = [...previous];
            else if (parent !== null) { if (!names.has(parent)) throw Error(`第 ${firstLine + index} 行：未知锚点 ${parent}。`); tile = [...names.get(parent)]; }
            const walk = value => {
                if (!/^-?\d+$/.test(value)) throw Error(`第 ${firstLine + index} 行：无效方向 ${value}。`);
                polygon.getNeighborAndDir(tile, Number(value), false);
            };
            if (address.includes(';')) {
                for (const direction of address.split(';').filter(Boolean)) { walk(direction); const old = this.tiles.get(tile.join(',')); if (old?.id) old.active = false; this.tiles.set(tile.join(','), {type:'@|#$O'.indexOf(head[2]),text:''}); }
                if (parent !== '%*') previous = tile;
                continue;
            }
            for (const direction of address.split(',').filter(Boolean)) walk(direction);
            const name = text.slice(pos).match(/^\[\[([^\]]+)\]\]/)?.[1];
            if (name !== undefined) { pos += name.length + 4; names.set(name, [...tile]); }
            for (;;) {
                if (text.startsWith('[=', pos)) pos = bracketEnd(text, pos);
                else { const shortcut = text.slice(pos).match(/^\[(p|d|t|td|never)\]/); if (!shortcut) break; pos += shortcut[0].length; }
            }
            if (parent === 'type') inTT = true;
            const record = {id:String(firstLine + index), line:firstLine + index, index, raw, rawStart:offsets[pos],
                hash:tile.join(','), name, type:'@|#$O'.indexOf(head[2]), prefix:text.slice(0,pos), section,
                scope:inTT ? 'type' : 'reasoning', values:readText(text.slice(pos)), active:true};
            const old = this.tiles.get(record.hash); if (old?.id) old.active = false;
            this.records.push(record); this.tiles.set(record.hash, record);
            if (parent !== '%*') previous = tile;
        }
        if (stack.length) throw Error('地图代码块 { 未闭合。');
        this.byId = new Map(this.records.map(record => [record.id, record]));
    }
    values(id) { return this.edits.get(id) || this.byId.get(id)?.values; }
    set(id, values) {
        const row = this.byId.get(id); if (!row) throw Error('找不到地图行。');
        if (!values || typeof values !== 'object' || Array.isArray(values) || Object.values(values).some(v => typeof v !== 'string')) throw Error('文案必须为语言与文本的映射。');
        validateValues(values);
        if (JSON.stringify(values) === JSON.stringify(row.values)) this.edits.delete(id);
        else this.edits.set(id, {...values});
    }
    exportSource() {
        const lines = [...this.lines];
        for (const [id, values] of this.edits) {
            const row = this.byId.get(id), cr = row.raw.endsWith('\r') ? '\r' : '';
            try { lines[row.index] = row.raw.slice(0,row.rawStart) + writeText(values) + cr; }
            catch (error) { throw Error(`第 ${row.line} 行：${error.message}`); }
        }
        return this.source.slice(0,this.start) + lines.join('\n') + this.source.slice(this.end);
    }
    project() { return {format:'deductrium-map-text-v1',source:this.source,fingerprint:this.fingerprint,edits:[...this.edits].map(([id,values])=>({id,values}))}; }
    restore(project) {
        if (project?.format !== 'deductrium-map-text-v1' || project.source !== this.source || project.fingerprint !== this.fingerprint || !Array.isArray(project.edits)) throw Error('草稿的原地图与当前地图不一致，请导入草稿所用的 map.ts。');
        const previous = this.edits; this.edits = new Map();
        try { for (const entry of project.edits) this.set(entry.id,entry.values); }
        catch (error) { this.edits = previous; throw error; }
    }
}
