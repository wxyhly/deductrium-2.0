/** Data-only author tools. No DOM, storage, game singleton, or publication side effects. */
import {parseMapScript} from '../../js/hy/script.js';
import {parseWorld} from '../../js/hy/world.js';
import {canonicalPath} from './geometry.mjs';

const clone=value=>structuredClone(value);
const record=value=>value!==null && typeof value==='object' && !Array.isArray(value);
const key=path=>path.join(',');
const canonical=(project,hash)=>key(canonicalPath(hash,project.polygon));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function selectedHashes(project, hashes) {
    return hashes===undefined ? null : new Set([...hashes].map(hash=>canonical(project,hash)));
}
function fieldAllowed(field, fields) {
    if (fields===undefined) return true;
    if (!Array.isArray(fields) || fields.some(f=>typeof f!=='string')) throw Error('fields 须为字段路径数组');
    return fields.some(filter=>{
        if (filter==='script') filter='data.script';
        return field===filter || field.startsWith(filter+'.') || field.endsWith('.'+filter);
    });
}
function matcher(query, caseSensitive=false) {
    if (typeof query!=='string') throw Error('query 须为字符串');
    if (!query) return null;
    const expression=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),caseSensitive ? 'gu' : 'giu');
    return value=>[...String(value).matchAll(expression)].map(m=>({start:m.index,end:m.index+m[0].length}));
}

// Paths are also kept as arrays: a JSON key containing a dot is not a nested key.
function* leaves(value, path=[]) {
    if (value!==null && typeof value==='object') {
        for (const [name,item] of Object.entries(value)) yield* leaves(item,[...path,name]);
    } else yield {path,value};
}
function* objectKeys(value,path=[]) {
    if (value!==null && typeof value==='object') for (const [name,item] of Object.entries(value)) {
        if (!Array.isArray(value)) yield {path:[...path,name,'$key'],value:name,isKey:true};
        yield* objectKeys(item,[...path,name]);
    }
}
function* searchable(value,path=[]) { yield* leaves(value,path); yield* objectKeys(value,path); }
function* fieldsOf(project) {
    for (const [hash,tile] of project.tiles) {
        for (const {path,value,isKey} of searchable(tile)) {
            const field=path.join('.');
            yield {scope:'project',tileId:tile.id,hash,field,path,value,...(isKey ? {isKey} : {}),
                readOnly:!!isKey || !!tile.instanceId || !['name','text','data','type'].includes(path[0]) || !project.canEdit(hash)};
        }
    }
    yield {scope:'project',field:'title',path:['title'],value:project.title,readOnly:false};
    for (const name of ['id','version','world','region','instances']) {
        for (const {path,value,isKey} of searchable(project[name],[name])) yield {scope:'project',field:path.join('.'),path,value,...(isKey ? {isKey} : {}),readOnly:true};
    }
    for (const module of project.modules.values()) {
        for (const {path,value,isKey} of searchable(module)) yield {scope:`module:${module.id}`,moduleId:module.id,field:path.join('.'),path,value,...(isKey ? {isKey} : {}),readOnly:true};
    }
}

/** Literal search through every JSON value, including all translations and
 * expanded instance identities. Identity/library/world fields are searchable
 * but readonly here; their dedicated editing/migration APIs own those changes.
 */
export function searchProject(project, {query='',caseSensitive=false,fields,hashes}={}) {
    const find=matcher(query,caseSensitive), selected=selectedHashes(project,hashes);
    if (!find) return [];
    // Validate even if the project has no fields.
    fieldAllowed('',fields);
    const matches=[];
    for (const item of fieldsOf(project)) {
        if (selected && (item.hash===undefined || !selected.has(item.hash)) || !fieldAllowed(item.field,fields)) continue;
        const occurrences=find(item.value);
        if (occurrences.length) matches.push({...item,value:clone(item.value),occurrences});
    }
    return matches;
}

function replacementValue(value, occurrences, replacement) {
    let source=String(value);
    for (let i=occurrences.length-1;i>=0;i--) {
        const {start,end}=occurrences[i]; source=source.slice(0,start)+replacement+source.slice(end);
    }
    if (typeof value==='string') return source;
    let next;
    try { next=JSON.parse(source); } catch { throw Error('替换后不是有效 JSON 值'); }
    if (value===null ? next!==null : typeof next!==typeof value || next===null) throw Error('替换不能改变 JSON 值类型');
    return next;
}
function assignPath(target,path,value) {
    let parent=target;
    for (const name of path.slice(0,-1)) parent=parent[name];
    // Define an own data property even for suspicious imported JSON keys.
    Object.defineProperty(parent,path.at(-1),{value:clone(value),writable:true,configurable:true,enumerable:true});
}
function replacementCandidate(project,changes) {
    const tiles=new Map(), metadata={};
    for (const change of changes) {
        if (change.hash===undefined) { metadata.title=change.after; continue; }
        if (!tiles.has(change.hash)) tiles.set(change.hash,clone(project.tiles.get(change.hash)));
        assignPath(tiles.get(change.hash),change.path,change.after);
    }
    return {tiles:[...tiles],metadata};
}
function validateReplacement(project,candidate) {
    // Use the real model validators, without adding history or invoking _change.
    const input=project.toJSON(), updates=new Map(candidate.tiles);
    for (const [hash,tile] of candidate.tiles) if (tile.data?.script!==undefined) {
        try { parseMapScript(tile.data.script); }
        catch (error) { error.authoringLocation={scope:'project',hash,tileId:tile.id,field:'data.script',line:scriptErrorLine(error) ?? 1}; throw error; }
    }
    input.tiles=input.tiles.map(tile=>updates.get(tile.hash) ?? tile);
    if (Object.hasOwn(candidate.metadata,'title')) {
        if (typeof candidate.metadata.title!=='string' || candidate.metadata.title.length>240) throw Error('地图标题最多 240 字');
        input.title=candidate.metadata.title;
    }
    const checked=project.constructor.fromJSON(input,project.polygon), names=new Set();
    for (const tile of checked.tiles.values()) {
        if (tile.name && names.has(tile.name)) throw Error('砖块名称已存在');
        if (tile.name) names.add(tile.name);
    }
    checked.setReadonlyBase(project._readonlyBase);
}

/** Preview contains only effective changes; errors prevent the entire apply.
 * A preview is not an authority token: apply always recomputes against live data.
 */
export function previewReplace(project, options={}) {
    const {query,replacement}=options;
    if (typeof query!=='string' || !query.length) throw Error('替换搜索词不能为空');
    if (typeof replacement!=='string') throw Error('replacement 须为字符串');
    const matches=searchProject(project,options), changes=[], skipped=[], errors=[];
    for (const item of matches) {
        if (item.readOnly) { skipped.push(item); continue; }
        try {
            const after=replacementValue(item.value,item.occurrences,replacement);
            if (!same(after,item.value)) changes.push({...item,before:clone(item.value),after});
        } catch (error) { errors.push({scope:item.scope,tileId:item.tileId,hash:item.hash,field:item.field,message:error.message}); }
    }
    if (changes.length && !errors.length) {
        try { validateReplacement(project,replacementCandidate(project,changes)); }
        catch (error) {
            const line=scriptErrorLine(error);
            errors.push({message:error.message,...(line ? {field:'data.script',line} : {}),...error.authoringLocation});
        }
    }
    return {matches,changes,skipped,errors};
}
export function applyReplace(project, options) {
    const preview=previewReplace(project,options);
    if (preview.errors.length) throw Error(preview.errors.map(e=>e.message).join('；'));
    const candidate=replacementCandidate(project,preview.changes);
    if (preview.changes.length) project._applyAuthoring(candidate.tiles,candidate.metadata);
    return preview;
}

const scriptErrorLine=error=>Number(/^Map script line (\d+):/.exec(error.message)?.[1]) || undefined;
const symbolKey=(kind,id)=>`${kind}:${id}`;
function catalogValues(value) {
    if (value instanceof Set) return [...value];
    if (value instanceof Map) return [...value.keys()];
    if (Array.isArray(value)) return value.map(item=>typeof item==='string' ? item : item?.id ?? item?.name).filter(v=>typeof v==='string');
    return record(value) ? Object.keys(value) : [];
}
function addTo(map,name,value) {
    if (!map.has(name)) map.set(name,[]);
    map.get(name).push(value);
}

/** Walk every parsed branch/event and numerical operand; syntax and references
 * in branches which never run still matter to the runtime/publisher.
 */
function visitScript(statements, visit) {
    const condition=(value,negative=false)=>{
        if (value.op==='predicate') visit(value.predicate,{requirement:true,conditional:true,negative});
        else if (value.op==='not') condition(value.condition,!negative);
        else { condition(value.left,negative); condition(value.right,negative); }
    };
    const walk=(values,conditional=false)=>{
        for (const command of values) {
            if (command.op==='on') walk(command.body,conditional);
            else if (command.op==='if') {
                for (const branch of command.branches) { condition(branch.condition); walk(branch.body,true); }
                walk(command.elseBody ?? [],true);
            } else visit(command,{requirement:command.op==='require',conditional});
        }
    };
    walk(statements);
}

// Iterative SCC avoids overflowing the JS stack on a 20,000-tile project.
function dependencyCycles(ids,dependencies) {
    const edges=new Map(ids.map(id=>[id,new Set()])), reverse=new Map(ids.map(id=>[id,new Set()]));
    for (const {from,to} of dependencies) if (edges.has(from) && edges.has(to)) { edges.get(from).add(to); reverse.get(to).add(from); }
    const visited=new Set(), order=[];
    for (const root of ids) {
        if (visited.has(root)) continue;
        visited.add(root); const stack=[[root,edges.get(root).values()]];
        while (stack.length) {
            const [id,iterator]=stack.at(-1), next=iterator.next();
            if (next.done) { order.push(id); stack.pop(); }
            else if (!visited.has(next.value)) { visited.add(next.value); stack.push([next.value,edges.get(next.value).values()]); }
        }
    }
    const assigned=new Set(), cycles=[];
    for (let i=order.length-1;i>=0;i--) {
        const root=order[i]; if (assigned.has(root)) continue;
        const component=[], stack=[root]; assigned.add(root);
        while (stack.length) {
            const id=stack.pop(); component.push(id);
            for (const previous of reverse.get(id)) if (!assigned.has(previous)) { assigned.add(previous); stack.push(previous); }
        }
        if (component.length>1 || edges.get(root).has(root)) cycles.push(component);
    }
    return cycles;
}

function inspectTopology(project, diagnostics, options) {
    const tiles=[...project.tiles.values()], byHash=new Map(), aliases=new Map();
    const extension=project.world?.mode==='extension';
    for (const tile of tiles) { aliases.set(tile.id,tile); if (tile.name) aliases.set(tile.name,tile); }
    for (const tile of tiles) if (tile.type!==1) byHash.set(tile.hash,tile);
    // Optional official/base tiles can establish paths leaving and re-entering
    // an extension. Without them connectivity is explicitly only local.
    const base=options.baseTiles ?? new Map();
    for (const [hash,tile] of base) if (!project.tiles.has(hash) && tile.type!==1) byHash.set(hash,{...tile,hash,external:true});
    const neighbors=new Map();
    for (const [hash,tile] of byHash) {
        const adjacent=[];
        try {
            const at=canonicalPath(hash,project.polygon);
            for (let edge=0;edge<6;edge++) {
                const target=key(project.polygon.getNeighborAndDir(at,edge,true)[0]);
                if (byHash.has(target)) adjacent.push(target);
            }
        } catch (error) { diagnostics.push({severity:'error',code:'invalid-position',message:error.message,scope:'project',tileId:tile.id,hash,field:'hash'}); }
        neighbors.set(hash,adjacent);
    }
    const components=[], seen=new Set();
    for (const hash of byHash.keys()) {
        if (seen.has(hash)) continue;
        const component=[], queue=[hash]; seen.add(hash);
        for (let cursor=0;cursor<queue.length;cursor++) {
            const at=queue[cursor]; component.push(at);
            for (const neighbor of neighbors.get(at)) if (!seen.has(neighbor)) { seen.add(neighbor); queue.push(neighbor); }
        }
        components.push(component);
    }
    const world=project.world;
    const startId=options.startTileId ?? (extension ? world?.entry?.tileId : world?.spawn?.tileId);
    const start=startId===undefined ? project.tiles.get('') ?? tiles.find(t=>t.type!==1) : aliases.get(startId);
    const reachable=new Set(components.find(component=>component.includes(start?.hash)) ?? []);
    const unreachable=tiles.filter(t=>t.type!==1 && !reachable.has(t.hash));
    const isolated=tiles.filter(t=>t.type!==1 && !(neighbors.get(t.hash)?.length));
    const suffix=extension ? '扩展可经官方地图离开并返回，此处仅检查已知局部路径。' : '仅检查现有非墙格；未推断脚本改图、序数展开或逻辑题可解性。';
    for (const tile of isolated) diagnostics.push({scope:'project',severity:'warning',code:'isolated-tile',tileId:tile.id,hash:tile.hash,field:'hash',message:`此格没有已知相邻通路。${suffix}`});
    for (const tile of unreachable) diagnostics.push({scope:'project',severity:'warning',code:'unreachable-tile',tileId:tile.id,hash:tile.hash,field:'hash',message:`从${startId===undefined ? '推定起点' : '入口/出生点'}没有已知路径到达此格。${suffix}`});
    return {startTileId:start?.id,components:components.map(hashes=>({tileIds:hashes.map(h=>byHash.get(h)).filter(t=>!t.external).map(t=>t.id),hashes})),
        isolatedTileIds:isolated.map(t=>t.id),unreachableTileIds:unreachable.map(t=>t.id),conservative:true,allowsExternalPaths:extension};
}

/** Pure, aggregating diagnostics. options.known supplies external engine/game
 * symbols by kind (key/flag/count/reward/rule/type/layer/axiom/bank/currency).
 * Missing state producers and potential cycles are warnings, never solvability
 * claims. Hard local tile and bank references are errors. Library modules are
 * inspected in independent local namespaces as well as their expanded instances.
 */
export function analyzeProject(project, options={}) {
    const diagnostics=[], references=[], dependencies=[], cycles=[];
    const world=project.world ?? {}, known=options.known ?? {};
    const currencies=new Set(['reasoning','type',...(world.currency ? [world.currency.id] : []),...catalogValues(known.currency)]);
    const banks=new Set([...Object.keys(world.banks ?? {}),...catalogValues(known.bank)]);
    const content=world.content ?? {};
    const globalKnown={...known,rule:[...catalogValues(known.rule),...catalogValues(content.rules),...catalogValues(content.theorems),...catalogValues(content.definitions)],
        type:[...catalogValues(known.type),...catalogValues(content.types)],axiom:[...catalogValues(known.axiom),...catalogValues(content.axioms)]};
    const knownSets=new Map(Object.entries(globalKnown).map(([kind,values])=>[kind,new Set(catalogValues(values))]));
    const scopes=[{scope:'project',tiles:[...project.tiles.values()]},
        ...[...project.modules.values()].map(module=>({scope:`module:${module.id}`,tiles:module.tiles.map(tile=>({...tile,hash:key(tile.at)})),module}))];

    for (const {scope,tiles,module} of scopes) {
        const byId=new Map(), byName=new Map(), aliases=new Map(), producers=new Map(), scripts=new Map(), scopeRefs=[];
        const location=(tile,field,line)=>({scope,...(tile ? {tileId:tile.id,hash:tile.hash} : {}),...(field ? {field} : {}),...(line ? {line} : {})});
        const issue=(severity,code,message,tile,field,line)=>diagnostics.push({severity,code,message,...location(tile,field,line)});
        const produce=(kind,id,tile)=>{ if (typeof id==='string') addTo(producers,symbolKey(kind,id),tile.id); };
        const reference=(kind,target,tile,field,details={})=>{
            const ref={...location(tile,field,details.line),kind,target,requirement:false,conditional:false,negative:false,...details,
                resolved:false,external:false,targetTileIds:[],producerTileIds:[]};
            scopeRefs.push(ref); references.push(ref); return ref;
        };
        for (const tile of tiles) {
            addTo(byId,tile.id,tile); if (tile.name) addTo(byName,tile.name,tile);
            addTo(aliases,tile.id,tile); if (tile.name && tile.name!==tile.id) addTo(aliases,tile.name,tile);
            // Runtime reward ownership may use a stable ID or a local name.
            if (tile.type===3) { produce('reward',tile.id,tile); produce('reward',tile.name,tile); }
            const data=tile.data ?? {};
            if (data.unl?.layer) produce('layer',data.unl.layer,tile);
            if (data.script!==undefined) {
                try { scripts.set(tile,parseMapScript(data.script)); }
                catch (error) { issue('error','script-parse',error.message,tile,'data.script',scriptErrorLine(error) ?? 1); }
            }
        }
        for (const [id,duplicates] of byId) if (duplicates.length>1) for (const tile of duplicates) issue('error','duplicate-id',`重复砖块 ID：${id}`,tile,'id');
        for (const [name,duplicates] of byName) if (duplicates.length>1) for (const tile of duplicates) issue('error','duplicate-name',`重复砖块名称：${name}`,tile,'name');
        for (const [name,duplicates] of aliases) if (byId.has(name) && byName.has(name) && duplicates.some(t=>t.id!==name)) {
            for (const tile of duplicates) issue('error','ambiguous-alias',`名称与另一格的 ID 冲突：${name}`,tile,'name');
        }
        const numberRefs=(expression,tile,line)=>{
            if (!expression) return;
            if (expression.kind==='currency') reference('currency',expression.currency,tile,'data.script',{line});
            if (expression.kind==='count') reference('count',expression.id,tile,'data.script',{line,requirement:true});
            if (expression.kind==='binary') { numberRefs(expression.left,tile,line); numberRefs(expression.right,tile,line); }
        };
        for (const tile of tiles) {
            const data=tile.data ?? {};
            if (data.requiresReward!==undefined) reference('reward',data.requiresReward,tile,'data.requiresReward',{requirement:true});
            for (const field of ['dstrTarget','dstr']) if (data[field]!==undefined && (field!=='dstr' || data.dstrTarget===undefined)) {
                for (const target of Array.isArray(data[field]) ? data[field] : [data[field]]) if (typeof target==='string') reference('gate',target,tile,`data.${field}`);
            }
            if (data.bank!==undefined) reference('bank',data.bank,tile,'data.bank');
            if (data.exchange) {
                reference('bank',data.exchange.bank,tile,'data.exchange.bank');
                reference('currency',data.exchange.from,tile,'data.exchange.from');
                reference('currency',data.exchange.to,tile,'data.exchange.to');
            }
            for (const field of ['payD','getD']) if (data[field]!==undefined && (typeof data[field]!=='number' || !Number.isFinite(data[field]) || data[field]<0 || data[field]>1e12)) issue('error','invalid-amount',`${field} 须为 0～1e12 的有限数值`,tile,`data.${field}`);
            if (data.scriptRepeat!==undefined && typeof data.scriptRepeat!=='boolean') issue('error','invalid-script-repeat','scriptRepeat 须为布尔值',tile,'data.scriptRepeat');
            visitScript(scripts.get(tile) ?? [],(command,flags)=>{
                const {op,kind,id,line}=command;
                if (op==='give' && kind==='key' || op==='set' && kind==='flag' || ['set','add'].includes(op) && kind==='count' || op==='add' && kind==='axiom'
                    || op==='unlock' && ['reward','layer','rule','type'].includes(kind)) produce(kind,id,tile);
                numberRefs(command.expression,tile,line);
                if (command.currency) reference('currency',command.currency,tile,'data.script',{line});
                if (command.to) reference('currency',command.to,tile,'data.script',{line});
                if (op==='exchange') reference('bank',command.bankId,tile,'data.script',{line});
                if (id===undefined) return;
                if (['gate','tile','text'].includes(kind) || op==='reset' && kind==='reward') {
                    reference(op==='reset' ? 'tile' : kind,id,tile,'data.script',{line,...flags}); return;
                }
                const negative=!!flags.negative !== kind?.startsWith('not-');
                const normalized=kind?.replace(/^not-/,'').replace(/-present$/,'');
                const stateRead=flags.requirement || op==='take' && kind==='key' || ['disable','enable','remove'].includes(op) && ['axiom','type'].includes(kind);
                // Producers are not dependencies on themselves. Engine unlock
                // commands still expose a reference to the supplied catalog.
                if (stateRead || op==='unlock' && ['rule','type'].includes(kind) || ['clear','reset'].includes(op) && kind==='reward') {
                    reference(normalized,id,tile,'data.script',{line,...flags,negative,requirement:!!stateRead,
                        catalog:op==='unlock' && ['rule','type'].includes(kind)});
                }
            });
        }
        if (scope==='project') {
            if (world.spawn) reference('tile',world.spawn.tileId,null,'world.spawn.tileId');
            if (world.entry) reference('tile',world.entry.tileId,null,'world.entry.tileId');
            for (const [id,bank] of Object.entries(world.banks ?? {})) for (let i=0;i<(bank.rules?.length ?? 0);i++) {
                reference('currency',bank.rules[i].from,null,`world.banks.${id}.rules.${i}.from`);
                reference('currency',bank.rules[i].to,null,`world.banks.${id}.rules.${i}.to`);
            }
        } else for (const [name,port] of Object.entries(module.ports ?? {})) reference('tile',port.tileId,null,`ports.${name}.tileId`);

        for (const ref of scopeRefs) {
            const tile=byId.get(ref.tileId)?.[0], hard=['gate','tile','text','bank','currency'].includes(ref.kind);
            if (['gate','tile','text'].includes(ref.kind)) {
                const targets=ref.target==='@self' && tile && ref.field==='data.script' ? [tile] : aliases.get(ref.target) ?? [];
                ref.targetTileIds=[...new Set(targets.map(t=>t.id))]; ref.resolved=targets.length===1;
            } else if (ref.kind==='bank') { ref.resolved=banks.has(ref.target); ref.external=ref.resolved; }
            else if (ref.kind==='currency') { ref.resolved=currencies.has(ref.target); ref.external=ref.resolved; }
            else {
                ref.producerTileIds=[...new Set(producers.get(symbolKey(ref.kind,ref.target)) ?? [])];
                ref.targetTileIds=[...new Set((aliases.get(ref.target) ?? []).filter(t=>ref.kind==='reward' && t.type===3).map(t=>t.id))];
                ref.external=knownSets.get(ref.kind)?.has(ref.target) ?? false;
                ref.resolved=ref.external || !ref.catalog && ref.producerTileIds.length>0;
            }
            if (!ref.resolved && !ref.negative) issue(hard ? 'error' : 'warning',hard ? 'unresolved-reference' : 'missing-producer',
                hard ? `未找到 ${ref.kind} 引用：${String(ref.target)}` : `未发现 ${ref.kind} ${String(ref.target)} 的地图内提供者；可能来自引擎、存档或其他地图。`,tile,ref.field,ref.line);
            if (ref.requirement && !ref.negative && !ref.external && ref.tileId) {
                for (const to of new Set([...ref.producerTileIds,...ref.targetTileIds])) dependencies.push({scope,from:ref.tileId,to,kind:ref.kind,target:ref.target,field:ref.field,line:ref.line,conditional:ref.conditional});
            }
        }
        for (const tileIds of dependencyCycles([...new Set(tiles.map(t=>t.id))],dependencies.filter(d=>d.scope===scope))) {
            cycles.push({scope,tileIds});
            issue('warning','dependency-cycle',`可能的依赖环：${tileIds.join(' → ')}。分支、替代提供者和已有状态可能解除依赖；这不是不可解判定。`,tiles.find(t=>t.id===tileIds[0]),'data.script');
        }
    }
    // Existing publication validation remains authoritative and unchanged.
    // Aggregate its failure alongside field-level authoring diagnostics.
    if (project.world && options.validatePublication!==false) {
        try {
            parseWorld({...world,format:project.region ? 'deductrium-world-v2' : 'deductrium-world-v1',id:project.id,title:project.title,
                ...(project.region ? {region:project.region} : {}),tiles:[...project.tiles.values()].map(({instanceId,localId,...tile})=>tile)});
        } catch (error) { diagnostics.push({scope:'project',severity:'error',code:'publication-invalid',field:'world',message:error.message}); }
    }
    const topology=options.topology===false ? null : inspectTopology(project,diagnostics,options);
    return {diagnostics,references,dependencies,cycles,topology};
}

/** Incoming references plus transitive prerequisite dependents. Does not delete
 * or rewrite anything; consumers can show the impact before batchEdit(delete).
 */
export function deleteImpact(project, hashes, options={}) {
    const selected=selectedHashes(project,hashes), tiles=[...project.tiles.values()].filter(t=>selected.has(t.hash));
    const tileIds=tiles.map(t=>t.id), ids=new Set(tileIds), result=analyzeProject(project,{...options,topology:false});
    const references=result.references.filter(ref=>ref.scope==='project' && !ids.has(ref.tileId)
        && [...ref.targetTileIds,...ref.producerTileIds].some(id=>ids.has(id)));
    const dependencies=result.dependencies.filter(d=>d.scope==='project' && ids.has(d.to) && !ids.has(d.from));
    const dependent=new Set(ids), queue=[...ids], reverse=new Map();
    for (const dependency of result.dependencies) if (dependency.scope==='project') addTo(reverse,dependency.to,dependency.from);
    for (let cursor=0;cursor<queue.length;cursor++) for (const id of reverse.get(queue[cursor]) ?? []) {
        if (!dependent.has(id)) { dependent.add(id); queue.push(id); }
    }
    return {tileIds,hashes:tiles.map(t=>t.hash),readOnly:tiles.filter(t=>t.instanceId || !project.canEdit(t.hash)).map(t=>t.id),
        references,dependencies,dependentTileIds:[...dependent].filter(id=>!ids.has(id))};
}
