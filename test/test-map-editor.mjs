import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Polygon} from '../js/hy/tiling.js';
import {EditorProject, canonicalPath, relativePath, transport} from '../tools/map-editor/model.mjs';
import {parseMapScript} from '../js/hy/script.js';
import {parseMapData} from '../js/hy/map-source.js';
import {Hvec,Rotor} from '../js/hy/algebra.js';
import {tileVertices,halfPlaneContains} from '../tools/map-editor/geometry.mjs';

const polygon=new Polygon(6,4), key=path=>path.join(','), tile=(text='',data={})=>({type:0,text,data});
let checks=0;
function check(name,run) { run(); checks++; console.log('PASS '+name); }
const source=await readFile(new URL('../src/hy/map.ts',import.meta.url),'utf8');
function runtime(source) {
    // Only trusted test fixtures/generated output are executed, never editor imports.
    const data=new Function(source.replace('export const mapData =','return '))();
    const parsed = parseMapData(data, new Polygon(6,4));
    return {blockMap: parsed.tiles, nameMap: parsed.names};
}
const official=EditorProject.fromSource(source,polygon);
check('official source and all static metadata agree with the actual loader',()=>{
    assert.equal(official.exportSource(),source);
    const actual=runtime(source);
    assert.equal(official.tiles.size,actual.blockMap.size);
    for(const [hash,row] of official.tiles) {
        const block=actual.blockMap.get(hash); assert.equal(row.type,block.type,hash);
        assert.deepEqual(row.text,block.text,hash); assert.deepEqual(row.data,block.data??{},hash); assert.equal(row.name,block.name,hash);
    }
});
check('structural export round-trips all official tiles, names, text and metadata',()=>{
    const next=EditorProject.fromSource(source,polygon), first=next.tiles.get('');
    next.put('',{...first,text:{zh:'本格编辑\n[en] 字面符号 ` ${literal}',en:'Edited tile'}});
    const output=next.exportSource(), actual=runtime(output);
    assert.equal(actual.blockMap.size,next.tiles.size);
    for(const [hash,row] of next.tiles) {
        const block=actual.blockMap.get(hash); assert.deepEqual({type:block.type,name:block.name,text:block.text,data:block.data??{}},{type:row.type,name:row.name,text:row.text,data:row.data},hash);
    }
});
check('put, erase, undo and redo preserve stable tile identities and data',()=>{
    const next=new EditorProject(polygon); next.put('',{...tile('root',{p:true,getD:1}),name:'gate'});
    const id=next.tiles.get('').id; next.put('',{...tile('updated',{d:true}),name:'gate'});
    assert.equal(next.tiles.get('').id,id); next.remove(''); assert.equal(next.tiles.size,0);
    next.undo(); assert.equal(next.tiles.get('').text,'updated'); next.undo(); assert.equal(next.tiles.get('').text,'root');
    next.redo(); assert.equal(next.tiles.get('').text,'updated'); next.put('1',tile()); assert.equal(next.canRedo,false);
    const before=next.toJSON(); assert.throws(()=>next.put('2',{...tile(),name:'gate'})); assert.deepEqual(next.toJSON(),before);
});
check('all six rotations preserve real adjacency at distant anchors',()=>{
    const paths=[[]], seen=new Set(['']);
    for(let cursor=0;cursor<paths.length;cursor++) {
        const path=paths[cursor]; if(path.length>=3)continue;
        for(let d=0;d<6;d++) {const n=polygon.getNeighborAndDir(path,d,true)[0]; if(!seen.has(key(n))) {seen.add(key(n));paths.push(n);} }
    }
    for(const at of [[],[2,1,4,3]]) for(let rotation=0;rotation<6;rotation++) for(const path of paths) {
        const frame=transport(path,at,rotation,polygon);
        for(let d=0;d<6;d++) {
            const adjacent=polygon.getNeighborAndDir(path,d,true)[0], expected=polygon.getNeighborAndDir(frame.at,(d+frame.rotation)%6,true)[0];
            assert.deepEqual(transport(adjacent,at,rotation,polygon).at,expected);
        }
    }
});
check('exported local module addresses reconstruct the exact original locations',()=>{
    const at=[2,1,4,3], project=new EditorProject(polygon);
    for(const path of [[],[0],[1],[2],[3,2]]) {
        const global=transport(path,at,0,polygon).at;
        assert.deepEqual(transport(relativePath(global,at,polygon),at,0,polygon).at,global);
        project.put(key(global),tile(key(path)));
    }
    const module=project.exportModule([...project.tiles.keys()],key(at),{id:'room',title:'房间'});
    const placed=new EditorProject(polygon); placed.registerModule(module); placed.mount('room',{id:'original',at,rotation:0});
    assert.deepEqual([...placed.tiles.keys()].sort(),[...project.tiles.keys()].sort());
});
const room={format:'deductrium-map-module-v1',id:'room',title:'测试模块',tiling:{p:6,q:4},tiles:[
    {id:'gate',at:[],name:'gate',type:2,text:{zh:'门',en:'Gate'},data:{requiresReward:'key'}},
    {id:'key',at:[1],name:'key',type:3,text:'钥匙',data:{dstrTarget:'gate',getD:5}}
],ports:{entrance:{tileId:'gate',edge:0}}};
check('mounting two copies namespaces internal references and saves module instances',()=>{
    const project=new EditorProject(polygon); project.registerModule(room);
    project.mount('room',{id:'a',at:[],rotation:0}); project.mount('room',{id:'b',at:[3,3,3],rotation:3});
    assert.equal(project.tiles.get('').name,'a::gate'); assert.equal(project.tiles.get('').data.requiresReward,'a::key');
    assert.equal(project.tiles.get('1').data.dstrTarget,'a::gate');
    const saved=project.toJSON(); assert.equal(saved.tiles.length,0);
    const next=EditorProject.fromJSON(JSON.parse(JSON.stringify(saved)),polygon);
    assert.deepEqual(next.toJSON(),saved); assert.deepEqual([...next.tiles],[...project.tiles]);
});
check('collisions reject preview and apply without changing a single existing tile',()=>{
    const project=new EditorProject(polygon); project.put('',tile('existing')); project.registerModule(room);
    const before=project.toJSON(); assert.match(project.previewMount('room',{id:'a',at:[],rotation:0}).errors.join(),/已有砖块/);
    assert.throws(()=>project.mount('room',{id:'a',at:[],rotation:0})); assert.deepEqual(project.toJSON(),before);
    assert.equal(project.canUndo,true); project.undo(); assert.equal(project.modules.size,0);
});
check('instance movement, rotation, detach and removal are reversible and atomic',()=>{
    const project=new EditorProject(polygon); project.registerModule(room); project.mount('room',{id:'a',at:[],rotation:0});
    assert.throws(()=>project.put('',tile('overwrite'))); assert.throws(()=>project.remove(''));
    project.put('3,3,3',tile('obstacle')); const before=project.toJSON();
    assert.throws(()=>project.moveInstance('a',{at:[3,3,3],rotation:2})); assert.deepEqual(project.toJSON(),before);
    project.moveInstance('a',{at:[2,2,2],rotation:5}); assert.equal(project.tiles.get('2,2,2').instanceId,'a');
    project.undo(); assert.equal(project.tiles.get('').instanceId,'a'); project.redo();
    project.detachInstance('a'); assert.equal(project.instances.length,0); assert.equal([...project.tiles.values()].some(t=>t.instanceId),false);
    project.put('2,2,2',tile('editable')); project.undo(); project.undo(); assert.equal(project.instances.length,1);
    project.removeInstance('a'); assert.equal(project.instances.length,0); assert.equal(project.tiles.size,1); project.undo(); assert.equal(project.instances.length,1);
});
check('invalid paths, metadata, modules and projects fail without partial edits',()=>{
    const project=new EditorProject(polygon); project.put('',tile()); const before=project.toJSON();
    for(const bad of ['1,,2','-1','6','x']) assert.throws(()=>canonicalPath(bad,polygon),bad);
    for(const bad of [{type:9,text:''},{...tile(),data:{n:Infinity}},{...tile(),text:[]},{...tile(),name:'bad]]name'}]) assert.throws(()=>project.put('1',bad));
    for(const bad of [{...room,tiles:[...room.tiles,room.tiles[0]]},{...room,tiling:{p:7,q:3}},{...room,ports:{x:{tileId:'bad',edge:0}}}]) assert.throws(()=>project.registerModule(bad));
    assert.deepEqual(project.toJSON(),before);
    const saved=project.toJSON(); assert.throws(()=>EditorProject.fromJSON({...saved,tiles:[saved.tiles[0],saved.tiles[0]]},polygon));
    assert.throws(()=>EditorProject.fromSource('export const mapData = `@${evil()}`;',polygon));
});
check('all language and metadata delimiters survive a game-loaded source export',()=>{
    const project=new EditorProject(polygon); project.put('',{type:3,name:'custom',text:{zh:'普通 [n] [en] 文案 ` ${x}',en:'quotes " and \\ slash'},data:{custom:{nested:['a]b','` ${x}','中文\\']},getD:2}});
    assert.deepEqual(runtime(project.exportSource()).blockMap.get(''),{type:3,name:'custom',text:project.tiles.get('').text,data:project.tiles.get('').data});
    project.put('1',{...tile(),text:{zh:'末尾\\',en:'trailing\\'}}); assert.throws(()=>project.exportSource(),/无法保留/);
    assert.deepEqual(EditorProject.fromJSON(project.toJSON(),polygon).tiles.get('1').text,{zh:'末尾\\',en:'trailing\\'});
});
check('project title edits participate in undo and redo',()=>{
    const project=new EditorProject(polygon); project.setInfo('new-map','新地图'); assert.equal(project.id,'new-map'); project.undo(); assert.equal(project.id,'my-map'); project.redo(); assert.equal(project.title,'新地图');
});
check('detaching after importing sparse tile IDs cannot create duplicate IDs',()=>{
    const project=new EditorProject(polygon); project.put('3',tile()); project.put('4',tile());
    const saved=project.toJSON(); saved.tiles[1].id='t3';
    const next=EditorProject.fromJSON(saved,polygon); next.registerModule(room); next.mount('room',{id:'room',at:[],rotation:0}); next.detachInstance('room');
    assert.equal(new Set([...next.tiles.values()].map(t=>t.id)).size,next.tiles.size);
    assert.deepEqual(EditorProject.fromJSON(next.toJSON(),polygon).toJSON(),next.toJSON());
});
check('copied modules isolate script keys and targets while preserving global axioms and rewards',()=>{
    const source=new EditorProject(polygon);
    source.put('',{type:3,name:'gift',text:'gift',data:{script:'give key red;set flag ready;add count visits 1;disable axiom a3;unlock reward macro;open gate door'}});
    source.put('1',{type:2,name:'door',text:'door',data:{script:'require key red;require flag ready;require count visits > 0;set text gift "Changed"'}});
    const module=source.exportModule(['','1'],'',{id:'script-room',title:'script room'}),project=new EditorProject(polygon);
    project.registerModule(module);project.mount(module.id,{id:'one',at:[],rotation:0});project.mount(module.id,{id:'two',at:[3,3,3],rotation:2});
    for(const instance of ['one','two']) {
        const gift=[...project.tiles.values()].find(t=>t.name===`${instance}::gift`);
        const commands=parseMapScript(gift.data.script);
        assert.equal(commands[0].id,`${instance}::red`);assert.equal(commands[1].id,`${instance}::ready`);
        assert.equal(commands[2].id,`${instance}::visits`);assert.equal(commands[3].id,'a3');assert.equal(commands[4].id,'macro');assert.equal(commands[5].id,`${instance}::door`);
        assert.deepEqual(runtime(project.exportSource()).blockMap.get(gift.hash).data,gift.data);
    }
    assert.deepEqual(EditorProject.fromJSON(project.toJSON(),polygon).toJSON(),project.toJSON());
    const before=project.toJSON();assert.throws(()=>project.put('5',tile('',{script:'eval bad'})),/line 1/i);assert.deepEqual(project.toJSON(),before);
});
function state(project) {return {json:project.toJSON(),tiles:structuredClone([...project.tiles]),source:project.exportSource(),undo:structuredClone(project._undo),redo:structuredClone(project._redo),nextId:project._nextId};}
function rejectsAtomically(project,action,pattern) {const before=state(project);assert.throws(action,pattern);assert.deepEqual(state(project),before);}
function nearby(depth) {
    const paths=[[]],seen=new Set(['']);
    for(let cursor=0;cursor<paths.length;cursor++) {
        const path=paths[cursor];if(path.length>=depth)continue;
        for(let d=0;d<6;d++) {const next=polygon.getNeighborAndDir(path,d,true)[0],hash=key(next);if(!seen.has(hash)) {seen.add(hash);paths.push(next);}}
    }
    return paths;
}
check('integer Lorentz vertices agree with actual game rotors and six polygon edges',()=>{
    polygon.generateRotors();
    for(const [hash,rotor] of polygon.rotors) {
        const vertices=tileVertices(hash?hash.split(',').map(Number):[],polygon);
        for(let i=0;i<6;i++) {
            const [z,x,y]=vertices[i].map(Number),actual=rotor.mul(Rotor.rotate(i*Math.PI/3)).apply(polygon.vertex);
            assert.ok(Math.abs(x/z/Math.sqrt(6)-actual.x/actual.z)<1e-10,hash);
            assert.ok(Math.abs(y/z/Math.sqrt(2)-actual.y/actual.z)<1e-10,hash);
        }
    }
    for(let edge=0;edge<6;edge++) {
        assert.equal(halfPlaneContains([],edge,1,polygon),true);
        assert.equal(halfPlaneContains([],edge,-1,polygon),false);
        assert.equal(halfPlaneContains([edge],edge,-1,polygon),true);
        assert.equal(halfPlaneContains([edge],edge,1,polygon),false);
    }
});
check('six-vertex membership agrees with Lorentz normals and is independent of Euclidean x',()=>{
    const paths=nearby(3);let touching=0,negativeX=0;
    for(const path of paths) for(let edge=0;edge<6;edge++) {
        const vertices=tileVertices(path,polygon),normal=Rotor.rotate(edge*Math.PI/3).apply(polygon.n3);
        const dots=vertices.map(([z,x,y])=>new Hvec(Math.sqrt(3)*Number(z),Number(x)/Math.sqrt(2),Math.sqrt(1.5)*Number(y)).dot(normal));
        const expected=dots.every(value=>value>=-1e-8);
        assert.equal(halfPlaneContains(path,edge,1,polygon),expected,`${key(path)} edge ${edge}`);
        if(expected&&dots.some(value=>Math.abs(value)<1e-8)) touching++;
        if(expected&&vertices.every(([,x])=>x<0n)) negativeX++;
    }
    assert.ok(touching>0);assert.ok(negativeX>0);
});
check('translated boundaries and rotated modules use the same half-plane membership',()=>{
    const anchors=[[],[2,1,4,3]],paths=nearby(2);
    for(const anchor of anchors) for(let rotation=0;rotation<6;rotation++) for(let edge=0;edge<6;edge++) {
        const project=new EditorProject(polygon),frame=transport([],anchor,rotation,polygon);
        project.setRegion({hash:anchor,edge:(edge+frame.rotation)%6,side:1});
        for(const path of paths) {
            const at=transport(path,anchor,rotation,polygon).at,expected=halfPlaneContains(path,edge,1,polygon);
            if(expected) {project.put(at,tile());project.remove(at);}
            else rejectsAtomically(project,()=>project.put(at,tile()),/半平面/);
        }
    }
});
check('setting, clearing, importing and undoing regions are atomic and preserve boundary tiles',()=>{
    const project=new EditorProject(polygon);project.put('',tile());
    project.setRegion({hash:[],edge:0,side:1});assert.deepEqual(project.region,{hash:'',edge:0,side:1});
    const copy=project.region;copy.edge=3;assert.equal(project.region.edge,0);
    rejectsAtomically(project,()=>project.put('0',tile()),/半平面/);
    rejectsAtomically(project,()=>project.setRegion({hash:'',edge:0,side:-1}),/半平面/);
    for(const bad of [{hash:'',edge:6,side:1},{hash:'',edge:0,side:0},{hash:'',edge:0,side:'1'},{hash:'bad',edge:0,side:1},{hash:'',edge:0,side:1,entrance:'bad'}]) {
        rejectsAtomically(project,()=>project.setRegion(bad));
    }
    const before=project.toJSON();project.setRegion(null);project.put('0',tile());
    project.undo();project.undo();assert.deepEqual(project.toJSON(),before);project.redo();assert.equal(project.region,null);
    assert.deepEqual(EditorProject.fromJSON(before,polygon).toJSON(),before);
    assert.throws(()=>EditorProject.fromJSON({...before,tiles:[...before.tiles,{...before.tiles[0],id:'outside',hash:'0'}]},polygon),/半平面/);
    const legacy={...before};delete legacy.region;delete legacy.version;delete legacy.world;
    const restored=EditorProject.fromJSON(legacy,polygon);assert.equal(restored.region,null);assert.equal(restored.version,1);assert.equal(restored.world,null);
});
check('only the explicit entrance hash bypasses the full tile constraint',()=>{
    const project=new EditorProject(polygon);project.setRegion({hash:'',edge:0,side:1,entrance:[0]});project.put('0',tile('entrance'));
    rejectsAtomically(project,()=>project.put('0,3',tile()),/半平面/);
    rejectsAtomically(project,()=>project.setRegion({hash:'',edge:0,side:1,entrance:'0,3'}),/半平面/);
    assert.equal(EditorProject.fromJSON(project.toJSON(),polygon).tiles.get('0').text,'entrance');
    project.remove('0');project.put('0',tile('replacement'));assert.equal(project.tiles.size,1);
});
check('mount preview, mounting, moving, rotating and project instance imports reject outside tiles',()=>{
    const project=new EditorProject(polygon);project.setRegion({hash:'',edge:0,side:1});project.registerModule(room);
    const bad={id:'bad',at:[0],rotation:0};assert.match(project.previewMount('room',bad).errors.join(),/半平面/);
    rejectsAtomically(project,()=>project.mount('room',bad),/半平面/);
    project.mount('room',{id:'good',at:[],rotation:0});
    rejectsAtomically(project,()=>project.moveInstance('good',{at:[0],rotation:0}),/半平面/);
    rejectsAtomically(project,()=>project.moveInstance('good',{at:[],rotation:5}),/半平面/);
    assert.throws(()=>EditorProject.fromJSON({...project.toJSON(),instances:[{...bad,moduleId:'room'}]},polygon),/半平面/);
    assert.deepEqual(EditorProject.fromJSON(project.toJSON(),polygon).toJSON(),project.toJSON());
});
check('512-step geometry retains exact boundary contact and rejects the far forbidden side',()=>{
    const anchor=[2,...Array(511).fill(3)],project=new EditorProject(polygon);
    project.setRegion({hash:anchor,edge:0,side:1});project.put(anchor,tile());
    const across=polygon.getNeighborAndDir(anchor,0,true)[0];rejectsAtomically(project,()=>project.put(across,tile()),/半平面/);
    assert.equal(halfPlaneContains([0,...Array(511).fill(3)],0,1,polygon),false);
    assert.equal(halfPlaneContains([3,...Array(511).fill(3)],0,1,polygon),true);
    // Walk a tiling wall far beyond the reliable range of floating-point
    // subtraction; the two contact vertices must remain exactly on its plane.
    let along=[];
    for(let step=0;step<80;step++) {
        const candidates=Array.from({length:6},(_,edge)=>polygon.getNeighborAndDir(along,edge,true)[0]);
        const next=candidates.find(path=>path.length>along.length&&halfPlaneContains(path,0,1,polygon)&&tileVertices(path,polygon).filter(([z,,y])=>z===y).length===2);
        assert.ok(next,`boundary walk ${step}`);along=next;
    }
    assert.equal(halfPlaneContains(along,0,1,polygon),true);assert.equal(halfPlaneContains(along,0,-1,polygon),false);
});
check('world plain JSON, empty migrations and project version survive copies and history',()=>{
    const project=new EditorProject(polygon);assert.equal(project.world,null);
    const config={revision:1,mode:'standalone',spawn:{tileId:'t1',rotation:0},banks:{},migrations:[]};
    rejectsAtomically(project,()=>project.setWorld(config),/半平面/);
    project.setRegion({hash:'',edge:0,side:1});
    project.setWorld(config);config.spawn.rotation=5;assert.equal(project.world.spawn.rotation,0);
    const copy=project.world;copy.migrations.push({});assert.deepEqual(project.world.migrations,[]);
    project.setInfo('world-map','World',{version:3});project.setInfo('world-map','Renamed');assert.equal(project.version,3);
    const saved=project.toJSON(),restored=EditorProject.fromJSON(JSON.parse(JSON.stringify(saved)),polygon);assert.deepEqual(restored.toJSON(),saved);
    rejectsAtomically(project,()=>project.setWorld(null),/不能取消/);
    rejectsAtomically(project,()=>project.setRegion(null),/不能取消/);
    project.setWorld({...project.world,revision:2});assert.equal(project.world.revision,2);project.undo();assert.deepEqual(project.toJSON(),saved);project.redo();assert.equal(project.world.revision,2);
    for(const bad of [[],1,'world',{value:undefined},{value:Infinity},{value:()=>{}},new Date(),JSON.parse('{"__proto__":1}')]) rejectsAtomically(project,()=>project.setWorld(bad));
    const cyclic={};cyclic.self=cyclic;rejectsAtomically(project,()=>project.setWorld(cyclic));
    for(const version of [0,-1,1.5,'1',null]) rejectsAtomically(project,()=>project.setInfo('ok','Title',{version}));
    assert.throws(()=>EditorProject.fromJSON({...saved,world:{value:undefined}},polygon));
    // Manifest business validation belongs to the publishing module.
    project.setWorld({migrations:null,custom:{extra:true}});assert.equal(project.world.migrations,null);
});
console.log(`${checks} map editor checks passed`);
