import {MapDocument, writeText} from './source-text.mjs';
import {parseTileContent} from '../../js/hy/maploader.js';
import {parseMapScript, rewriteMapScript} from '../../js/hy/script.js';

const clone = value => structuredClone(value);
const key = path => path.join(',');
const mod = n => (n % 6 + 6) % 6;
const own = (object, name) => Object.hasOwn(object, name);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const MAX_TILES = 20000;
function identifier(value, label = 'ID') {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value)) throw Error(`${label} 须为 1～80 位字母、数字、点、下划线或短横线`);
    return value;
}
function json(value, depth = 0) {
    if (depth > 32) throw Error('属性嵌套过深');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (Array.isArray(value)) { for (const item of value) json(item, depth + 1); return; }
    if (!object(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw Error('属性必须是普通 JSON 数据');
    for (const [name, item] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(name)) throw Error('属性包含不支持的键');
        json(item, depth + 1);
    }
}
function textValue(value) {
    if (typeof value === 'string') return value;
    if (!object(value) || !Object.keys(value).length || Object.entries(value).some(([k,v])=>!/^[A-Za-z]{2,3}$/.test(k) || typeof v !== 'string')) throw Error('文案必须为字符串或语言代码与文字的映射');
    return clone(value);
}
function tileValue(value) {
    if (!object(value) || !Number.isInteger(value.type) || value.type < 0 || value.type > 4) throw Error('砖块类型无效');
    const name = value.name || undefined;
    if (name !== undefined && (typeof name !== 'string' || /[\r\n\[\]]/.test(name) || name.length > 240)) throw Error('名称不能包含换行或方括号，最多 240 字');
    const data = value.data ?? {};
    if (!object(data)) throw Error('属性必须为 JSON 对象');
    json(data);
    if (data.script !== undefined) parseMapScript(data.script);
    if (data.scriptRepeat !== undefined && typeof data.scriptRepeat !== 'boolean') throw Error('scriptRepeat 须为布尔值');
    return {type:value.type, ...(name ? {name} : {}), text:textValue(value.text ?? ''), data:clone(data)};
}

// Addresses and rotations use exactly the survival Polygon(6,4) edge transport.
export function canonicalPath(value, polygon) {
    if (typeof value === 'string' && value.trim() && !/^\s*[0-5](\s*,\s*[0-5])*\s*$/.test(value)) throw Error('坐标须为 0～5 组成的逗号分隔路径');
    const path = typeof value === 'string' ? (value.trim() ? value.split(',').map(s=>Number(s.trim())) : []) : value;
    if (!Array.isArray(path) || path.length > 512 || path.some(n=>!Number.isInteger(n) || n < 0 || n > 5)) throw Error('坐标须为 0～5 组成的逗号分隔路径，最多 512 步；空白表示原点');
    const result = [];
    for (const direction of path) polygon.getNeighborAndDir(result, direction, false);
    return result;
}
export function transport(path, at, rotation, polygon) {
    let local = [], global = canonicalPath(at, polygon), offset = mod(rotation);
    for (const direction of canonicalPath(path, polygon)) {
        const [nextL, backL] = polygon.getNeighborAndDir(local, direction, true);
        const [nextG, backG] = polygon.getNeighborAndDir(global, mod(direction + offset), true);
        local = nextL; global = nextG; offset = mod(backG - backL);
    }
    return {at:global, rotation:offset};
}
export function relativePath(path, origin, polygon) {
    let global = canonicalPath(origin, polygon), local = [], offset = 0;
    const walk = direction => {
        const [nextG, backG] = polygon.getNeighborAndDir(global, direction, true);
        const [nextL, backL] = polygon.getNeighborAndDir(local, mod(direction - offset), true);
        global = nextG; local = nextL; offset = mod(backG - backL);
    };
    const parents = global.length;
    for (let i = 0; i < parents; i++) walk(0);
    for (const direction of canonicalPath(path, polygon)) walk(direction);
    return local;
}
function moduleValue(input, polygon) {
    if (!object(input) || input.format !== 'deductrium-map-module-v1' || input.tiling?.p !== 6 || input.tiling?.q !== 4 || !Array.isArray(input.tiles) || input.tiles.length > MAX_TILES) throw Error('请选择有效的 (6,4) 地图模块');
    const result = {format:input.format, id:identifier(input.id,'模块 ID'), title:String(input.title || input.id), tiling:{p:6,q:4}, tiles:[], ports:clone(input.ports ?? {})};
    const paths = new Set(), ids = new Set(), names = new Set();
    for (const item of input.tiles) {
        const id = identifier(item.id,'砖块 ID'), at = canonicalPath(item.at, polygon), hash = key(at), value = tileValue(item);
        if (ids.has(id) || paths.has(hash) || value.name && names.has(value.name)) throw Error('模块内砖块 ID、位置或名称重复');
        ids.add(id); paths.add(hash); if (value.name) names.add(value.name);
        result.tiles.push({id,at,...value});
    }
    if (!object(result.ports)) throw Error('模块端口须为对象');
    for (const [id,port] of Object.entries(result.ports)) {
        identifier(id,'端口 ID');
        if (!object(port) || !ids.has(port.tileId) || !Number.isInteger(port.edge) || port.edge < 0 || port.edge > 5) throw Error(`端口 ${id} 的砖块或方向无效`);
    }
    json(result);
    return result;
}
function placementValue(input, polygon) {
    if (!object(input) || !Number.isInteger(input.rotation) || input.rotation < 0 || input.rotation > 5) throw Error('旋转方向须为 0～5');
    return {id:identifier(input.id,'实例 ID'),at:canonicalPath(input.at,polygon),rotation:input.rotation};
}
function encodeTile(tile) {
    const content = (tile.name ? `[[${tile.name}]]` : '') +
        (Object.keys(tile.data).length ? `[=${JSON.stringify(tile.data).slice(1,-1)}]` : '');
    const encoded = content.replaceAll('\\','\\\\').replaceAll('`','\\`').replaceAll('${','\\${') +
        writeText(typeof tile.text === 'string' ? {'':tile.text} : tile.text);
    return `${tile.hash}${'@|#$O'[tile.type]}${encoded}`;
}

export class EditorProject {
    constructor(polygon) {
        if (polygon.p !== 6 || polygon.q !== 4) throw Error('编辑器使用生存模式的 (6,4) 地图');
        this.polygon = polygon; this.id = 'my-map'; this.title = '未命名地图';
        this.tiles = new Map(); this.modules = new Map(); this.instances = [];
        this._undo = []; this._redo = []; this._nextId = 1; this._source = undefined;
    }
    static fromSource(source, polygon) {
        const parsed = new MapDocument(source, polygon), project = new EditorProject(polygon);
        for (const [hash,row] of parsed.tiles) {
            const content = row.prefix?.replace(/^[^@|#$O]*[@|#$O]/,'') ?? '';
            const value = parseTileContent(content);
            const values = row.id ? parsed.values(row.id) : {'':''};
            const text = own(values,'') ? values[''] : values;
            project.tiles.set(hash,{id:`t${project._nextId++}`,hash,...tileValue({type:row.type,name:row.name,text,data:value.data})});
        }
        if (project.tiles.size > MAX_TILES) throw Error('地图超过 20000 格');
        project._source = source;
        return project;
    }
    static fromJSON(data, polygon) {
        if (!object(data) || data.format !== 'deductrium-map-project-v1' || data.tiling?.p !== 6 || data.tiling?.q !== 4 || !Array.isArray(data.tiles) || data.tiles.length > MAX_TILES || !Array.isArray(data.modules) || !Array.isArray(data.instances) || data.modules.length > 256 || data.instances.length > 256) throw Error('请选择有效地图项目');
        const project = new EditorProject(polygon); project.id = identifier(data.id,'地图 ID'); project.title = String(data.title ?? data.id);
        const ids = new Set();
        for (const input of data.tiles) {
            const hash = key(canonicalPath(input.hash,polygon)), id = identifier(input.id,'砖块 ID');
            if (project.tiles.has(hash) || ids.has(id) || input.instanceId || input.localId) throw Error('项目包含重复位置或无效实例砖块');
            ids.add(id); project.tiles.set(hash,{id,hash,...tileValue(input)});
        }
        for (const input of data.modules) {
            const module = moduleValue(input,polygon);
            if (project.modules.has(module.id)) throw Error('项目包含重复模块 ID');
            project.modules.set(module.id,module);
        }
        for (const instance of data.instances) {
            const preview = project.previewMount(instance.moduleId,instance);
            if (preview.errors.length) throw Error(preview.errors.join('；'));
            for (const [hash,tile] of preview.tiles) project.tiles.set(hash,tile);
            project.instances.push({...placementValue(instance,polygon),moduleId:instance.moduleId});
        }
        project._nextId = 1;
        while ([...project.tiles.values()].some(t=>t.id === `t${project._nextId}`)) project._nextId++;
        return project;
    }
    toJSON() {
        return {format:'deductrium-map-project-v1',id:this.id,title:this.title,tiling:{p:6,q:4},
            tiles:clone([...this.tiles.values()].filter(tile=>!tile.instanceId)),modules:clone([...this.modules.values()]),instances:clone(this.instances)};
    }
    _snapshot() { return {...this.toJSON(),source:this._source,nextId:this._nextId}; }
    _restore(snapshot) {
        const next = EditorProject.fromJSON(snapshot,this.polygon);
        this.id=next.id; this.title=next.title; this.tiles=next.tiles; this.modules=next.modules; this.instances=next.instances;
        this._source=snapshot.source; this._nextId=snapshot.nextId;
    }
    _change(action) {
        const before = this._snapshot();
        try { action(); if (this.tiles.size > MAX_TILES) throw Error('地图超过 20000 格'); }
        catch (error) { this._restore(before); throw error; }
        this._undo.push(before); if (this._undo.length > 50) this._undo.shift(); this._redo = []; this._source = undefined;
    }
    get canUndo() { return this._undo.length > 0; }
    get canRedo() { return this._redo.length > 0; }
    undo() { if (!this.canUndo) return; const before=this._snapshot(); this._restore(this._undo.pop()); this._redo.push(before); }
    redo() { if (!this.canRedo) return; const before=this._snapshot(); this._restore(this._redo.pop()); this._undo.push(before); }
    setInfo(id, title) {
        identifier(id,'地图 ID'); if (typeof title !== 'string' || title.length > 240) throw Error('地图标题最多 240 字');
        this._change(()=>{ this.id=id; this.title=title; });
    }
    put(path, input) {
        const hash = key(canonicalPath(path,this.polygon)), value = tileValue(input), old = this.tiles.get(hash);
        if (old?.instanceId) throw Error('请先分离模块实例再编辑砖块');
        if (value.name && [...this.tiles.values()].some(t=>t.hash !== hash && t.name === value.name)) throw Error('砖块名称已存在');
        this._change(()=>{ let id=old?.id; if (!id) { do { id=`t${this._nextId++}`; } while ([...this.tiles.values()].some(t=>t.id===id)); } this.tiles.set(hash,{id,hash,...value}); });
        return this.tiles.get(hash);
    }
    remove(path) {
        const hash=key(canonicalPath(path,this.polygon));
        if (this.tiles.get(hash)?.instanceId) throw Error('请先分离模块实例再删除砖块');
        if (!this.tiles.has(hash)) return;
        this._change(()=>this.tiles.delete(hash));
    }
    exportSource() {
        if (this._source !== undefined) return this._source;
        return `export const mapData = \`\n${[...this.tiles.values()].map(encodeTile).join('\n')}\n\`;\n`;
    }
    exportModule(hashes, originHash, options) {
        const origin=canonicalPath(originHash,this.polygon), unique=[...new Set(hashes.map(h=>key(canonicalPath(h,this.polygon))))];
        if (!unique.length) throw Error('请先选择需要导出的砖块');
        const tiles=unique.map((hash,i)=>{
            const tile=this.tiles.get(hash); if (!tile) throw Error('选区包含空格');
            return {id:`t${i+1}`,at:relativePath(hash,origin,this.polygon),...tileValue(tile)};
        });
        return moduleValue({format:'deductrium-map-module-v1',id:options.id,title:options.title,tiling:{p:6,q:4},tiles,ports:options.ports ?? {}},this.polygon);
    }
    registerModule(input) {
        const module=moduleValue(input,this.polygon), previous=this.modules.get(module.id);
        if (previous && JSON.stringify(previous)!==JSON.stringify(module)) throw Error('同名模块已存在，请更换模块 ID');
        if (!previous) this._change(()=>this.modules.set(module.id,module));
        return module.id;
    }
    previewMount(moduleId, input, ignoreInstanceId) {
        const tiles=new Map(), errors=[];
        try {
            const module=this.modules.get(moduleId); if (!module) throw Error('模块不存在');
            const placement=placementValue(input,this.polygon);
            if (this.instances.some(i=>i.id===placement.id && i.id!==ignoreInstanceId)) throw Error('实例 ID 已存在');
            const ignored = tile => ignoreInstanceId !== undefined && tile.instanceId===ignoreInstanceId;
            const names=new Set([...this.tiles.values()].filter(t=>!ignored(t)).map(t=>t.name).filter(Boolean));
            const localNames=new Map(module.tiles.filter(t=>t.name).map(t=>[t.name,`${placement.id}::${t.name}`]));
            for (const item of module.tiles) {
                const hash=key(transport(item.at,placement.at,placement.rotation,this.polygon).at), value=tileValue(item);
                if (value.name) value.name=localNames.get(value.name);
                for (const field of ['dstrTarget','requiresReward']) if (localNames.has(value.data[field])) value.data[field]=localNames.get(value.data[field]);
                if (value.data.script) value.data.script=rewriteMapScript(value.data.script, id=>`${placement.id}::${id}`);
                const existing=this.tiles.get(hash);
                if (existing && !ignored(existing)) errors.push(`位置 ${hash || '原点'} 已有砖块`);
                if (value.name && names.has(value.name)) errors.push(`名称 ${value.name} 已存在`);
                if (tiles.has(hash)) errors.push('模块几何位置重叠');
                tiles.set(hash,{id:`${placement.id}::${item.id}`,hash,...value,instanceId:placement.id,localId:item.id});
            }
            if (this.tiles.size - [...this.tiles.values()].filter(ignored).length + tiles.size > MAX_TILES) errors.push('地图超过 20000 格');
        } catch(error) { errors.push(error.message); }
        return {tiles,errors:[...new Set(errors)]};
    }
    mount(moduleId,input) {
        const placement=placementValue(input,this.polygon), preview=this.previewMount(moduleId,placement);
        if (preview.errors.length) throw Error(preview.errors.join('；'));
        this._change(()=>{ for (const [hash,tile] of preview.tiles) this.tiles.set(hash,tile); this.instances.push({...placement,moduleId}); });
    }
    moveInstance(id,input) {
        const instance=this.instances.find(i=>i.id===id); if (!instance) throw Error('实例不存在');
        const placement={...placementValue({...input,id},this.polygon),moduleId:instance.moduleId}, preview=this.previewMount(instance.moduleId,placement,id);
        if (preview.errors.length) throw Error(preview.errors.join('；'));
        this._change(()=>{ for (const [hash,tile] of this.tiles) if (tile.instanceId===id) this.tiles.delete(hash); for (const [hash,tile] of preview.tiles) this.tiles.set(hash,tile); this.instances=this.instances.map(i=>i.id===id?placement:i); });
    }
    removeInstance(id) {
        if (!this.instances.some(i=>i.id===id)) throw Error('实例不存在');
        this._change(()=>{for (const [hash,tile] of this.tiles) if (tile.instanceId===id) this.tiles.delete(hash); this.instances=this.instances.filter(i=>i.id!==id);});
    }
    detachInstance(id) {
        if (!this.instances.some(i=>i.id===id)) throw Error('实例不存在');
        this._change(()=>{
            for (const tile of this.tiles.values()) if (tile.instanceId===id) {
                let nextId; do { nextId=`t${this._nextId++}`; } while ([...this.tiles.values()].some(t=>t.id===nextId));
                tile.id=nextId; delete tile.instanceId; delete tile.localId;
            }
            this.instances=this.instances.filter(i=>i.id!==id);
        });
    }
}
