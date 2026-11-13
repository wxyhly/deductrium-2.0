import {MapDocument, writeText} from './source-text.mjs';
import {parseTileContent} from '../../js/hy/maploader.js';
import {parseMapScript, rewriteMapScript} from '../../js/hy/script.js';
import {validateWorldBase} from '../../js/hy/world.js';
import {halfPlaneContains, canonicalPath, transport, relativePath, regionContains, relocationFrame} from './geometry.mjs';
import {searchProject, previewReplace, applyReplace, analyzeProject, deleteImpact} from './authoring.mjs';
export {canonicalPath, transport, relativePath} from './geometry.mjs';

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
function tileIdentifier(value) {
    if (typeof value !== 'string') throw Error('砖块 ID 无效');
    for (const part of value.split('::')) identifier(part,'砖块 ID');
    return value;
}
function versionValue(value, label) {
    if (value === undefined) return 1;
    if (!Number.isSafeInteger(value) || value < 1) throw Error(`${label} 须为大于等于 1 的安全整数`);
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
function moduleValue(input, polygon) {
    if (!object(input) || input.format !== 'deductrium-map-module-v1' || input.tiling?.p !== 6 || input.tiling?.q !== 4 || !Array.isArray(input.tiles) || input.tiles.length > MAX_TILES) throw Error('请选择有效的 (6,4) 地图模块');
    const result = {format:input.format, id:identifier(input.id,'模块 ID'), title:String(input.title || input.id),
        version:versionValue(input.version,'模块 version'),revision:versionValue(input.revision,'模块 revision'),tiling:{p:6,q:4}, tiles:[], ports:clone(input.ports ?? {})};
    const paths = new Set(), ids = new Set(), names = new Set();
    for (const item of input.tiles) {
        const id = tileIdentifier(item.id), at = canonicalPath(item.at, polygon), hash = key(at), value = tileValue(item);
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
function regionValue(input, polygon) {
    if (input === null) return null;
    if (!object(input) || !Number.isInteger(input.edge) || input.edge < 0 || input.edge > 5 || ![1,-1].includes(input.side)) throw Error('半平面须包含 hash、edge (0～5) 和 side (±1)');
    return {hash:key(canonicalPath(input.hash,polygon)),edge:input.edge,side:input.side,
        ...(input.entrance !== undefined ? {entrance:key(canonicalPath(input.entrance,polygon))} : {})};
}
function worldValue(input) {
    if (input === null) return null;
    if (!object(input)) throw Error('world 须为普通 JSON 对象或 null');
    json(input);return clone(input);
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
        this.version = 1; this._region = null; this._world = null;
        this._readonlyBase = new Set();
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
        project.version=versionValue(data.version,'项目 version');
        project._region=regionValue(data.region === undefined ? null : data.region,polygon);
        project._world=worldValue(data.world === undefined ? null : data.world);
        const ids = new Set();
        for (const input of data.tiles) {
            const hash = key(canonicalPath(input.hash,polygon)), id = tileIdentifier(input.id);
            if (project.tiles.has(hash) || ids.has(id) || input.instanceId || input.localId) throw Error('项目包含重复位置或无效实例砖块');
            ids.add(id); project.tiles.set(hash,{id,hash,...tileValue(input)});
        }
        for (const input of data.modules) {
            const module = moduleValue(input,polygon);
            if (project.modules.has(module.id)) throw Error('项目包含重复模块 ID');
            project.modules.set(module.id,module);
        }
        for (const instance of data.instances) {
            const preview = project.previewMount(instance.moduleId,instance,undefined,true);
            if (preview.errors.length) throw Error(preview.errors.join('；'));
            for (const [hash,tile] of preview.tiles) project.tiles.set(hash,tile);
            project.instances.push({...placementValue(instance,polygon),moduleId:instance.moduleId});
        }
        project._validateRegion();
        project._nextId = 1;
        while ([...project.tiles.values()].some(t=>t.id === `t${project._nextId}`)) project._nextId++;
        return project;
    }
    toJSON() {
        return {format:'deductrium-map-project-v1',id:this.id,title:this.title,version:this.version,world:this.world,
            ...(this._region ? {region:this.region} : {}),tiling:{p:6,q:4},
            tiles:clone([...this.tiles.values()].filter(tile=>!tile.instanceId)),modules:clone([...this.modules.values()]),instances:clone(this.instances)};
    }
    _snapshot() { return {...this.toJSON(),source:this._source,nextId:this._nextId,tileOrder:[...this.tiles.keys()]}; }
    _restore(snapshot) {
        const next = EditorProject.fromJSON(snapshot,this.polygon);
        next.setReadonlyBase(this._readonlyBase);
        this.id=next.id; this.title=next.title; this.tiles=next.tiles; this.modules=next.modules; this.instances=next.instances;
        this.version=next.version; this._region=next._region; this._world=next._world;
        this.tiles=new Map(snapshot.tileOrder.map(hash=>[hash,next.tiles.get(hash)]));
        this._source=snapshot.source; this._nextId=snapshot.nextId;
    }
    _change(action, setup = false) {
        if (!setup && this._world && !this._region) throw Error('请先设置 mod 半平面范围再编辑');
        const before = this._snapshot();
        try {
            action();
            if (this.tiles.size > MAX_TILES) throw Error('地图超过 20000 格');
            if (this.modules.size > 256 || this.instances.length > 256) throw Error('模块库或实例超过 256 个');
            this._validateRegion();
        }
        catch (error) { this._restore(before); throw error; }
        this._undo.push(before); if (this._undo.length > 50) this._undo.shift(); this._redo = []; this._source = undefined;
    }
    get canUndo() { return this._undo.length > 0; }
    get canRedo() { return this._redo.length > 0; }
    undo() { if (!this.canUndo) return; const before=this._snapshot(); this._restore(this._undo[this._undo.length-1]); this._undo.pop(); this._redo.push(before); }
    redo() { if (!this.canRedo) return; const before=this._snapshot(); this._restore(this._redo[this._redo.length-1]); this._redo.pop(); this._undo.push(before); }
    get region() { return clone(this._region); }
    get world() { return clone(this._world); }
    setReadonlyBase(hashes) {
        const next = new Set([...hashes].map(hash=>key(canonicalPath(hash,this.polygon))));
        if (this._world?.mode === 'extension') {
            for (const hash of this.tiles.keys()) if (next.has(hash)) throw Error(`砖块 ${hash || '原点'} 与只读官方底图重叠`);
        }
        this._readonlyBase = next;
    }
    _regionError(hash) {
        if (this._world?.mode === 'extension' && this._readonlyBase.has(hash)) return `砖块 ${hash || '原点'} 属于只读官方底图`;
        const region=this._region;
        if (!region && !this._world) return;
        if (!region) return '请先设置 mod 半平面范围再编辑';
        if ((!this._world && hash===region.entrance) || halfPlaneContains(relativePath(hash,region.hash,this.polygon),region.edge,region.side,this.polygon)) return;
        return `砖块 ${hash || '原点'} 超出半平面编辑范围`;
    }
    _validateRegion() {
        if (!this._region) return; // Legacy manifests load as locked authoring projects.
        if (this._world && this._region.entrance !== undefined) throw Error('mod 半平面不允许入口豁免');
        for (const hash of this.tiles.keys()) { const error=this._regionError(hash); if (error) throw Error(error); }
    }
    // {hash: string|number[], edge: 0..5, side: 1|-1, entrance?: string|number[]}
    // +1 contains the boundary tile's center; entrance exempts one fixed hash.
    canEdit(hash) {
        try {return !this._regionError(key(canonicalPath(hash,this.polygon)));} catch {return false;}
    }
    isEditable(hash) { return this.canEdit(hash); }
    setRegion(input) {
        const region=regionValue(input,this.polygon);
        if (!region && this._world) throw Error('已配置世界不能取消半平面范围');
        this._change(()=>{this._region=region;},true);
    }
    // Authoring metadata only. The world publisher validates its manifest.
    setWorld(input) {
        const world=worldValue(input);
        if (this._world && !world) throw Error('已配置世界不能取消 mod 编辑保护');
        if (world && !this._region) throw Error('请先设置 mod 半平面范围');
        this._change(()=>{this._world=world;},true);
    }
    /** Detached, publishable candidate. input.rotation omitted tries 0..5;
     * an explicit rotation checks only that orientation. Invalid previews throw.
     */
    previewAttachment(input, officialTiles) {
        return this._attachment(input, officialTiles, this.world);
    }
    // settings.spawn uses the old tile frame, just like the existing world.
    // Recompute from live input instead of trusting a previously returned preview.
    attachToOfficial(input, officialTiles, settings = this.world) {
        const result = this._attachment(input, officialTiles, settings), next = result.project;
        const tiles = new Map(clone([...next.tiles])), instances = clone(next.instances);
        const region = next.region, world = next.world;
        this._change(()=>{this.tiles=tiles;this.instances=instances;this._region=region;this._world=world;},true);
        return result;
    }
    _attachment(input, officialTiles, settings) {
        if (!object(input)) throw Error('连接参数须包含 tileId、mainHash 和 edge');
        tileIdentifier(input.tileId);
        const source = [...this.tiles.values()].find(tile=>tile.id===input.tileId);
        if (!source || source.type !== 0 && source.type !== 3) throw Error('连接入口须为现有 mod 道路或奖励格');
        const mainHash = key(canonicalPath(input.mainHash,this.polygon)), edge = input.edge;
        if (!Number.isInteger(edge) || edge < 0 || edge > 5) throw Error('连接边须为 0～5');
        if (input.rotation !== undefined && (!Number.isInteger(input.rotation) || input.rotation < 0 || input.rotation > 5)) throw Error('旋转方向须为 0～5');
        if (!officialTiles || typeof officialTiles.get !== 'function' || typeof officialTiles.keys !== 'function' || typeof officialTiles.has !== 'function') throw Error('连接需要只读官方底图');
        const main = officialTiles.get(mainHash);
        if (!main || main.type !== 0 && main.type !== 3) throw Error('连接目标须为真实官方道路或奖励格');
        const target = this.polygon.getNeighborAndDir(canonicalPath(mainHash,this.polygon),edge,true)[0];
        const region = {hash:mainHash,edge,side:-1}, opposite = {...region,side:1};
        if (officialTiles.has(key(target))) throw Error('连接目标邻格已被官方底图占用');
        for (const hash of officialTiles.keys()) {
            if (!regionContains(hash,opposite,this.polygon)) throw Error(`官方砖块 ${hash || '原点'} 不完全位于连接半平面的另一侧`);
        }
        const entry = {mainHash,edge,tileId:source.id};
        const world = worldValue(settings ?? {revision:1,spawn:{tileId:source.id,rotation:0},banks:{},migrations:[]});
        const spawn = [...this.tiles.values()].find(tile=>tile.id===world.spawn?.tileId);
        if (!spawn || !Number.isInteger(world.spawn.rotation) || world.spawn.rotation < 0 || world.spawn.rotation > 5) throw Error('世界出生格或朝向无效');
        const rotations = input.rotation === undefined ? [0,1,2,3,4,5] : [input.rotation];
        const errors = [];
        for (const rotation of rotations) {
            try {
                const root = relocationFrame(source.hash,target,rotation,this.polygon);
                const frame = root.transform;
                const data = this.toJSON();
                data.tiles = data.tiles.map(tile=>({...tile,hash:key(frame(tile.hash).at)}));
                data.instances = data.instances.map(instance=>({...instance,...frame(instance.at,instance.rotation)}));
                data.region = clone(region);
                data.world = {...clone(world),mode:'extension',entry:clone(entry),
                    // Game applies spawn.rotation to the camera, the inverse of
                    // the tile's transported frame (instance rotations are forward).
                    spawn:{...clone(world.spawn),rotation:mod(world.spawn.rotation-frame(spawn.hash).rotation)}};
                const candidate = EditorProject.fromJSON(data,this.polygon);
                candidate.setReadonlyBase(new Set([...this._readonlyBase,...officialTiles.keys()]));
                // Preserve expanded-tile iteration order and the next loose ID.
                candidate.tiles = new Map([...this.tiles.keys()].map(hash=>{
                    const moved = key(frame(hash).at); return [moved,candidate.tiles.get(moved)];
                }));
                candidate._nextId = this._nextId;
                validateWorldBase({...candidate.world,format:'deductrium-world-v2',id:candidate.id,title:candidate.title,
                    region:candidate.region,tiles:[...candidate.tiles.values()].map(({instanceId,localId,...tile})=>tile)},officialTiles);
                return {input:{tileId:source.id,mainHash,edge,rotation},entry:clone(entry),region:clone(region),rotation,
                    tiles:candidate.tiles,project:candidate};
            } catch (error) { errors.push(`${rotation}: ${error.message}`); }
        }
        throw Error(`无法整体连接地图（${errors.join('；')}）`);
    }
    setInfo(id, title, options = {}) {
        identifier(id,'地图 ID'); if (typeof title !== 'string' || title.length > 240) throw Error('地图标题最多 240 字');
        if (!object(options)) throw Error('项目信息选项须为对象');
        const version=own(options,'version') ? versionValue(options.version,'项目 version') : this.version;
        this._change(()=>{ this.id=id; this.title=title; this.version=version; });
    }
    put(path, input) {
        const hash = key(canonicalPath(path,this.polygon)), value = tileValue(input), old = this.tiles.get(hash);
        const error=this._regionError(hash); if (error) throw Error(error);
        if (old?.instanceId) throw Error('请先分离模块实例再编辑砖块');
        if (value.name && [...this.tiles.values()].some(t=>t.hash !== hash && t.name === value.name)) throw Error('砖块名称已存在');
        this._change(()=>{ let id=old?.id; if (!id) { do { id=`t${this._nextId++}`; } while ([...this.tiles.values()].some(t=>t.id===id)); } this.tiles.set(hash,{id,hash,...value}); });
        return this.tiles.get(hash);
    }
    remove(path) {
        const hash=key(canonicalPath(path,this.polygon));
        const error=this._regionError(hash); if (error) throw Error(error);
        if (this.tiles.get(hash)?.instanceId) throw Error('请先分离模块实例再删除砖块');
        if (!this.tiles.has(hash)) return;
        this._change(()=>this.tiles.delete(hash));
    }
    /** One transaction. data/reward recursively merge objects; arrays replace.
     * removeData explicitly removes top-level data keys; script:null removes it.
     * reward is a convenience data patch, e.g. {getD:5,unl:{layer:'D-layer'}}.
     */
    batchEdit(hashes, patch) {
        if (!object(patch)) throw Error('批量修改须为对象');
        const allowed=['type','name','text','data','reward','script','removeData','delete'];
        if (Object.keys(patch).some(k=>!allowed.includes(k))) throw Error('批量修改包含不支持的字段');
        json(patch);
        if (own(patch,'delete') && typeof patch.delete!=='boolean') throw Error('delete 须为布尔值');
        if (patch.delete && Object.keys(patch).some(k=>k!=='delete')) throw Error('删除不能同时修改属性');
        for (const field of ['data','reward']) if (own(patch,field) && !object(patch[field])) throw Error(`${field} 须为 JSON 对象`);
        if (own(patch,'removeData') && (!Array.isArray(patch.removeData) || patch.removeData.some(k=>typeof k!=='string'))) throw Error('removeData 须为属性名数组');
        if (own(patch,'script') && patch.script!==null && typeof patch.script!=='string') throw Error('script 须为字符串或 null');
        const merge=(base, updates)=>{
            const result=clone(base);
            for (const [name,value] of Object.entries(updates)) result[name]=object(value) && object(result[name]) ? merge(result[name],value) : clone(value);
            return result;
        };
        const unique=[...new Set([...hashes].map(h=>key(canonicalPath(h,this.polygon))))];
        const changes=unique.map(hash=>{
            const previous=this.tiles.get(hash); if (!previous) throw Error(`选区包含空格 ${hash}`);
            if (patch.delete) return [hash,null];
            const next=clone(previous);
            for (const field of ['type','name','text']) if (own(patch,field)) next[field]=clone(patch[field]);
            for (const field of ['data','reward']) if (own(patch,field)) next.data=merge(next.data,patch[field]);
            for (const name of patch.removeData ?? []) delete next.data[name];
            if (own(patch,'script')) { if (patch.script===null) delete next.data.script; else next.data.script=patch.script; }
            return [hash,next];
        });
        return this._applyAuthoring(changes);
    }
    // Shared commit seam for batch edits and replacements. Validate the final
    // selection together so renames may exchange names without partial edits.
    _applyAuthoring(changes, metadata = {}) {
        const next=new Map(this.tiles), changed=[], tileIds=[];
        for (const [hash,input] of changes) {
            const old=this.tiles.get(hash); if (!old) throw Error('选区包含空格');
            const error=this._regionError(hash); if (error) throw Error(error);
            if (old.instanceId) throw Error('请先分离模块实例再编辑砖块');
            if (input===null) { next.delete(hash); changed.push(hash); tileIds.push(old.id); continue; }
            if (input.id!==old.id || input.hash!==old.hash || input.instanceId || input.localId) throw Error('批量修改不能改变砖块身份或位置');
            const value={id:old.id,hash,...tileValue(input)};
            if (JSON.stringify(value)!==JSON.stringify(old)) { next.set(hash,value); changed.push(hash); tileIds.push(old.id); }
        }
        const names=new Set();
        for (const tile of next.values()) if (tile.name) { if (names.has(tile.name)) throw Error('砖块名称已存在'); names.add(tile.name); }
        const title=own(metadata,'title') ? metadata.title : this.title;
        if (typeof title!=='string' || title.length>240) throw Error('地图标题最多 240 字');
        if (changed.length || title!==this.title) this._change(()=>{this.tiles=next;this.title=title;});
        return {count:changed.length,hashes:changed,tileIds};
    }
    searchProject(options) { return searchProject(this,options); }
    previewReplace(options) { return previewReplace(this,options); }
    applyReplace(options) { return applyReplace(this,options); }
    analyzeProject(options) { return analyzeProject(this,options); }
    deleteImpact(hashes, options) { return deleteImpact(this,hashes,options); }
    exportSource() {
        if (this._source !== undefined) return this._source;
        return `export const mapData = \`\n${[...this.tiles.values()].map(encodeTile).join('\n')}\n\`;\n`;
    }
    exportModule(hashes, originHash, options) {
        const origin=canonicalPath(originHash,this.polygon), unique=[...new Set(hashes.map(h=>key(canonicalPath(h,this.polygon))))];
        if (!unique.length) throw Error('请先选择需要导出的砖块');
        const tiles=unique.map(hash=>{
            const tile=this.tiles.get(hash); if (!tile) throw Error('选区包含空格');
            return {id:tile.id,at:relativePath(hash,origin,this.polygon),...tileValue(tile)};
        });
        return moduleValue({format:'deductrium-map-module-v1',id:options.id,title:options.title,version:options.version,revision:options.revision,tiling:{p:6,q:4},tiles,ports:options.ports ?? {}},this.polygon);
    }
    registerModule(input) {
        const module=moduleValue(input,this.polygon), previous=this.modules.get(module.id);
        if (previous && JSON.stringify(previous)!==JSON.stringify(module)) throw Error('同名模块已存在，请更换模块 ID');
        if (!previous) this._change(()=>this.modules.set(module.id,module));
        return module.id;
    }
    // Removed IDs are an explicit identity decision; this diff is for authoring,
    // not an implicit migration of puzzle completion or runtime save progress.
    updateModule(input, options = {}) {
        const module=moduleValue(input,this.polygon), previous=this.modules.get(module.id);
        if (!previous) throw Error('模块不存在，不能更新未知模块');
        if (module.revision <= previous.revision) throw Error('模块 revision 必须比已注册版本更新');
        if (!object(options) || !Array.isArray(options.deletedTileIds ?? [])) throw Error('deletedTileIds 须为砖块 ID 数组');
        const oldIds=new Set(previous.tiles.map(t=>t.id)), newIds=new Set(module.tiles.map(t=>t.id));
        const deletedTileIds=[...oldIds].filter(id=>!newIds.has(id)), declared=options.deletedTileIds ?? [];
        const declaredIds=new Set(declared);
        if (declared.some(id=>typeof id!=='string') || declaredIds.size!==declared.length || declared.length!==deletedTileIds.length || deletedTileIds.some(id=>!declaredIds.has(id))) throw Error('deletedTileIds 必须准确声明本次删除的砖块 ID');
        const instances=this.instances.filter(instance=>instance.moduleId===module.id);
        const instanceIds=new Set(instances.map(instance=>instance.id));
        const diff={moduleId:module.id,fromRevision:previous.revision,toRevision:module.revision,
            retainedTileIds:[...oldIds].filter(id=>newIds.has(id)),addedTileIds:[...newIds].filter(id=>!oldIds.has(id)),deletedTileIds,instanceIds:[...instanceIds]};
        this._change(()=>{
            for (const [hash,tile] of this.tiles) if (instanceIds.has(tile.instanceId)) this.tiles.delete(hash);
            this.modules.set(module.id,module);
            for (const instance of instances) {
                const preview=this.previewMount(module.id,instance,instance.id);
                if (preview.errors.length) throw Error(preview.errors.join('；'));
                for (const [hash,tile] of preview.tiles) this.tiles.set(hash,tile);
            }
        });
        return diff;
    }
    previewMount(moduleId, input, ignoreInstanceId, loading = false) {
        const tiles=new Map(), errors=[];
        try {
            const module=this.modules.get(moduleId); if (!module) throw Error('模块不存在');
            const placement=placementValue(input,this.polygon);
            if (this.instances.some(i=>i.id===placement.id && i.id!==ignoreInstanceId)) throw Error('实例 ID 已存在');
            const ignored = tile => ignoreInstanceId !== undefined && tile.instanceId===ignoreInstanceId;
            const names=new Set([...this.tiles.values()].filter(t=>!ignored(t)).map(t=>t.name).filter(Boolean));
            const ids=new Set([...this.tiles.values()].filter(t=>!ignored(t)).map(t=>t.id));
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
                if (ids.has(`${placement.id}::${item.id}`)) errors.push('砖块 ID 已存在');
                const regionError=loading && !this._region ? undefined : this._regionError(hash); if (regionError) errors.push(regionError);
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
