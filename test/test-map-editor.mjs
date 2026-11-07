import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Polygon} from '../js/hy/tiling.js';
import {EditorProject, canonicalPath, relativePath, transport} from '../tools/map-editor/model.mjs';
import {parseMapScript} from '../js/hy/script.js';

const polygon=new Polygon(6,4), key=path=>path.join(','), tile=(text='',data={})=>({type:0,text,data});
let checks=0;
function check(name,run) { run(); checks++; console.log('PASS '+name); }
const source=await readFile(new URL('../src/hy/map.ts',import.meta.url),'utf8');
const loaderSource=await readFile(new URL('../js/hy/maploader.js',import.meta.url),'utf8');
function runtime(source) {
    // Only trusted test fixtures/generated output are executed, never editor imports.
    const data=new Function(source.replace('export const mapData =','return '))();
    const loader=new Function('mapData','genOrdTiles',loaderSource.replace(/^import .*$/gm,'').replace(/\bexport /g,'')+'\nreturn {initMap,blockMap,nameMap};')(data,()=>{});
    const log=console.log; console.log=()=>{};
    try {loader.initMap(new Polygon(6,4));} finally {console.log=log;}
    return loader;
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
console.log(`${checks} map editor checks passed`);
