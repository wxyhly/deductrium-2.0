import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Polygon} from '../js/hy/tiling.js';
import {Rotor, Hvec} from '../js/hy/algebra.js';
import {blockMap, nameMap, initMap} from '../js/hy/maploader.js';
import {validateWorldBase, worldSaveMeta, worldTileId, migrateWorldSave} from '../js/hy/world.js';
import {EditorProject} from '../tools/map-editor/model.mjs';
import {canonicalPath, transport, relocationFrame} from '../tools/map-editor/geometry.mjs';
import {buildWorld, projectFromWorld} from '../tools/map-editor/publish.mjs';

const polygon = new Polygon(6,4), clone = value=>structuredClone(value), key = path=>path.join(',');
const mod = n=>(n%6+6)%6, plain = {type:0,text:'road',data:{}};
const connection = {tileId:'t1',mainHash:'1',edge:4};
function quiet(run) {const log=console.log;console.log=()=>{};try{return run();}finally{console.log=log;}}
const official = (()=>{
    const tiles=new Map(blockMap),names=new Map(nameMap);
    try {quiet(()=>initMap(polygon));return new Map(clone([...blockMap]));}
    finally {blockMap.clear();nameMap.clear();for(const row of tiles)blockMap.set(...row);for(const row of names)nameMap.set(...row);}
})();
const officialBefore = clone([...official]);
function state(project) {
    return {json:project.toJSON(),tiles:clone([...project.tiles]),source:project.exportSource(),
        undo:clone(project._undo),redo:clone(project._redo),nextId:project._nextId,readonly:[...project._readonlyBase]};
}
function rejects(project, run, pattern) {
    const before=state(project);assert.throws(run,pattern);assert.deepEqual(state(project),before);assert.deepEqual([...official],officialBefore);
}
function pair(direction=1, at='') {
    const project=new EditorProject(polygon);project.put(at,{...plain,text:{zh:'入口',en:'Entry'},data:{script:'on touch\nadd count visits 1\nend'}});
    project.put(key(polygon.getNeighborAndDir(canonicalPath(at,polygon),direction,true)[0]),{...plain,text:'second'});
    return project;
}
const room = {format:'deductrium-map-module-v1',id:'room',tiling:{p:6,q:4},
    tiles:[{id:'a',at:[],type:0,name:'Lobby',text:{zh:'大厅',en:'Lobby'},data:{script:'on touch\ngive key red\nend'}},
        {id:'b',at:[1],type:3,name:'Gift',text:'Gift',data:{getD:2,tags:['same',7]}}],ports:{door:{tileId:'a',edge:3}}};
function assembled(at='') {
    const project=pair(1,at), anchor=canonicalPath(at,polygon), placement=transport([2],anchor,0,polygon);
    project.registerModule(room);project.mount('room',{id:'part',at:placement.at,rotation:mod(placement.rotation+1)});
    project.setInfo('attached-room','Keep title',{version:3});
    project.setRegion({hash:at,edge:0,side:1});
    project.setWorld({revision:7,mode:'standalone',spawn:{tileId:'part::a',rotation:5},banks:{},migrations:[]});
    return project;
}
function published(project) {return quiet(()=>buildWorld(project));}

test('relocation frames preserve actual adjacency, edge directions and inverses at non-origin anchors',()=>{
    const paths=['','0','1','2,1','2,3,4','4,4,3'];
    for(const source of ['', '2,1,4', '1,2,3,2']) for(const target of ['1,4','3,3,3']) for(let rotation=0;rotation<6;rotation++) {
        const root=relocationFrame(source,target,rotation,polygon), inverse=relocationFrame(target,source,mod(-rotation),polygon);
        const selected=transport(source,root.at,root.rotation,polygon);
        assert.deepEqual(selected,{at:canonicalPath(target,polygon),rotation});
        for(const path of paths) {
            const frame=transport(path,root.at,root.rotation,polygon);
            assert.deepEqual(root.transform(path),frame);
            const back=transport(frame.at,inverse.at,inverse.rotation,polygon);
            assert.deepEqual(back.at,canonicalPath(path,polygon));assert.equal(mod(back.rotation+frame.rotation),0);
            for(let edge=0;edge<6;edge++) {
                const neighbor=polygon.getNeighborAndDir(canonicalPath(path,polygon),edge,true)[0];
                const expected=polygon.getNeighborAndDir(frame.at,mod(edge+frame.rotation),true)[0];
                assert.deepEqual(transport(neighbor,root.at,root.rotation,polygon).at,expected);
            }
        }
    }
    for(const rotation of [-1,6,0.5,'0',NaN]) assert.throws(()=>relocationFrame('','1,4',rotation,polygon),/旋转/);
});

test('all six rotations accept a 512-step source when only the generated root frame exceeds the limit',()=>{
    const source=Array(512).fill(3),project=new EditorProject(polygon);project.put(source,plain);
    const before=state(project);
    for(let rotation=0;rotation<6;rotation++) {
        const root=relocationFrame(source,'1,4',rotation,polygon);
        assert.deepEqual(root.transform(source),{at:[1,4],rotation});
        const preview=project.previewAttachment({...connection,rotation},official);
        assert.equal(preview.tiles.get('1,4').id,'t1');assert.equal(preview.project.world.spawn.rotation,mod(-rotation));
    }
    rejects(project,()=>project.previewAttachment({...connection,mainHash:Array(513).fill(3)},official),/512/);
    assert.deepEqual(state(project),before);
});

test('full 2120-tile official fixture previews overlapping root mod without changing live state',()=>{
    assert.equal(official.size,2120);assert.equal(official.get('1').type,0);
    const project=pair();project.setReadonlyBase(official.keys());project.put('2',plain);project.undo();
    const before=state(project),input=clone(connection),preview=project.previewAttachment(input,official);
    assert(preview.project instanceof EditorProject);assert(preview.tiles instanceof Map);
    assert.deepEqual(preview.input,{...connection,rotation:0});assert.deepEqual(input,connection);
    assert.deepEqual(preview.entry,{mainHash:'1',edge:4,tileId:'t1'});assert.deepEqual(preview.region,{hash:'1',edge:4,side:-1});
    assert.deepEqual([...preview.tiles.keys()],['1,4','1,4,1']);assert.deepEqual(state(project),before);
    assert.deepEqual(preview.project.world.spawn,{tileId:'t1',rotation:0});
    const world=published(preview.project);validateWorldBase(world,official);assert.equal(world.format,'deductrium-world-v2');
    assert.deepEqual([...official],officialBefore);
    preview.tiles.get('1,4').data.script='give money 99';preview.project.setInfo('detached','Detached');
    assert.deepEqual(state(project),before);
});

test('omitted rotation tries 0..5 deterministically, explicit invalid rotation never falls back',()=>{
    const project=pair(0),before=state(project);
    rejects(project,()=>project.previewAttachment({...connection,rotation:0},official),/无法整体连接/);
    const first=project.previewAttachment(connection,official),again=project.previewAttachment(connection,official);
    assert.equal(first.rotation,1);assert.deepEqual(first.project.toJSON(),again.project.toJSON());
    assert.equal(project.previewAttachment({...connection,rotation:5},official).rotation,5);
    assert.deepEqual(state(project),before);
});

test('every explicit orientation of a single-tile mod uses its requested canonical edge frame',()=>{
    const project=new EditorProject(polygon);project.put('2,1,4',plain);
    for(let rotation=0;rotation<6;rotation++) {
        const preview=project.previewAttachment({...connection,rotation},official);
        assert.deepEqual([...preview.tiles.keys()],['1,4']);assert.equal(preview.rotation,rotation);
        assert.equal(preview.project.world.spawn.rotation,mod(-rotation));
    }
});

test('non-origin relocation keeps module definitions, names, scripts, data, identities and spawn frame',()=>{
    const source='2,3,1',project=assembled(source),before=state(project);
    const preview=project.previewAttachment(connection,official),next=preview.project;
    const root=relocationFrame(source,'1,4',preview.rotation,polygon);
    assert.deepEqual(next.toJSON().modules,before.json.modules);assert.equal(next.id,project.id);assert.equal(next.title,project.title);assert.equal(next.version,project.version);
    for(const [hash,tile] of project.tiles) {
        const moved=next.tiles.get(key(transport(hash,root.at,root.rotation,polygon).at));
        const {hash:oldHash,...oldValue}=tile,{hash:newHash,...newValue}=moved;
        assert.deepEqual(newValue,oldValue);
    }
    const instance=project.instances[0],frame=transport(instance.at,root.at,root.rotation,polygon);
    assert.deepEqual(next.instances[0],{...instance,at:frame.at,rotation:mod(frame.rotation+instance.rotation)});
    const spawn=[...project.tiles.values()].find(t=>t.id==='part::a');
    assert.deepEqual(next.world.spawn,{tileId:'part::a',rotation:mod(5-transport(spawn.hash,root.at,root.rotation,polygon).rotation)});
    assert.deepEqual(next.world.banks,project.world.banks);assert.deepEqual(next.world.migrations,project.world.migrations);assert.equal(next.world.revision,7);
    assert.deepEqual(state(project),before);assert.deepEqual([...official],officialBefore);
    assert.deepEqual(EditorProject.fromJSON(next.toJSON(),polygon).toJSON(),next.toJSON());
    const exported=published(next),reimported=projectFromWorld(exported,polygon);
    assert.deepEqual(published(reimported),exported);
});

test('transported spawn camera preserves the real screen direction of all six neighbor centers',()=>{
    const source='2,1,4',project=new EditorProject(polygon);project.put(source,plain);
    project.setRegion({hash:source,edge:0,side:1});
    project.setWorld({revision:1,mode:'standalone',spawn:{tileId:'t1',rotation:2},banks:{},migrations:[]});
    for(let rotation=0;rotation<6;rotation++) {
        const next=project.previewAttachment({...connection,rotation},official).project;
        const root=relocationFrame(source,'1,4',rotation,polygon),at=canonicalPath('1,4',polygon);
        for(let edge=0;edge<6;edge++) {
            const neighbor=polygon.getNeighborAndDir(canonicalPath(source,polygon),edge,true)[0];
            const moved=key(transport(neighbor,root.at,root.rotation,polygon).at);
            const targetEdge=[0,1,2,3,4,5].find(e=>key(polygon.getNeighborAndDir(at,e,true)[0])===moved);
            assert.notEqual(targetEdge,undefined);
            const before=Rotor.rotate(2*Math.PI/3).mul(polygon.neighborMatrix[edge]).apply(new Hvec());
            const after=Rotor.rotate(next.world.spawn.rotation*Math.PI/3).mul(polygon.neighborMatrix[targetEdge]).apply(new Hvec());
            for(const axis of ['x','y']) assert(Math.abs(before[axis]/(before.z+1)-after[axis]/(after.z+1))<1e-12);
        }
    }
});

test('source may itself be an instantiated module tile; instances remain editable as instances',()=>{
    const project=assembled(),input={...connection,tileId:'part::a'},before=state(project);
    const preview=project.previewAttachment(input,official);
    assert.equal(preview.tiles.get('1,4').id,'part::a');assert.equal(preview.project.instances.length,1);
    project.attachToOfficial(preview.input,official);assert.equal(project.tiles.get('1,4').instanceId,'part');
    const placements=clone(project.instances),ids=[...project.tiles.values()].map(t=>t.id);
    project.updateModule({...room,revision:2,tiles:room.tiles.map(t=>({...t,text:'updated '+t.id}))});
    assert.deepEqual(project.instances,placements);assert.deepEqual([...project.tiles.values()].map(t=>t.id).sort(),ids.sort());
    assert.equal([...project.tiles.values()].find(t=>t.id==='part::a').text,'updated a');
    project.undo();project.undo();assert.deepEqual(project.toJSON(),before.json);
});

test('attachment commits exactly one undo step, preserves next loose ID and supports redo/source export',()=>{
    const project=assembled();project.setReadonlyBase(official.keys());
    project.put('3',plain);project.remove('3');project.undo();project.undo();
    const before=state(project),preview=project.previewAttachment(connection,official);
    const result=project.attachToOfficial(preview.input,official),after=state(project);
    assert.equal(after.undo.length,before.undo.length+1);assert.deepEqual(after.redo,[]);assert.equal(after.nextId,before.nextId);
    assert.deepEqual(after.json,result.project.toJSON());assert.deepEqual(after.readonly,before.readonly);
    assert(project.exportSource().includes('1,4'));assert.equal(project._source,undefined);
    project.undo();assert.deepEqual(project.toJSON(),before.json);assert.deepEqual([...project.tiles],before.tiles);assert.equal(project._nextId,before.nextId);
    project.redo();assert.deepEqual(project.toJSON(),after.json);assert.deepEqual([...project.tiles],after.tiles);
    result.tiles.get('1,4').text='detached result';assert.notEqual(project.tiles.get('1,4').text,'detached result');
});

test('invalid source, target, occupied neighbor and plane intersecting any official tile reject atomically',()=>{
    const project=pair();project.put('2',{type:1});project.undo();const before=state(project);
    for(const input of [null,{}, {...connection,tileId:'missing'}, {...connection,mainHash:'5,5,5,5'},
        {...connection,mainHash:'0'}, {...connection,edge:0}, {...connection,edge:6}, {...connection,edge:'4'},
        {...connection,rotation:6}, {...connection,rotation:0.5}, {...connection,rotation:null}, {...connection,mainHash:'1,no'}]) {
        rejects(project,()=>project.previewAttachment(input,official));rejects(project,()=>project.attachToOfficial(input,official));
    }
    const wall=EditorProject.fromJSON(before.json,polygon);wall.tiles.get('').type=1;
    rejects(wall,()=>wall.previewAttachment(connection,official),/mod 道路/);
    const outsideOfficial=new Map(official);outsideOfficial.set('1,4,3,3,3',plain);
    rejects(project,()=>project.previewAttachment(connection,outsideOfficial),/官方砖块/);
    assert.deepEqual([...outsideOfficial].slice(0,official.size),officialBefore);assert.deepEqual(state(project),before);
});

test('no fitting whole-project orientation rejects every tile and every module without partial moves',()=>{
    const project=new EditorProject(polygon);project.put('',plain);
    for(let edge=0;edge<6;edge++) project.put(String(edge),plain);
    project.registerModule(room);project.mount('room',{id:'far',at:[3,3,3],rotation:2});
    rejects(project,()=>project.previewAttachment(connection,official),/无法整体连接/);
    rejects(project,()=>project.attachToOfficial(connection,official),/无法整体连接/);
});

test('invalid pending world settings fail before live geometry, history or official map changes',()=>{
    const project=assembled(),settings=project.world;
    for(const changed of [{...settings,revision:0},{...settings,spawn:{tileId:'missing',rotation:0}},
        {...settings,spawn:{tileId:'t1',rotation:'0'}},{...settings,banks:{bad:{}}},{...settings,unexpected:true}])
        rejects(project,()=>project.attachToOfficial(connection,official,changed));
    const pending={...settings,revision:8,spawn:{tileId:'t2',rotation:3},migrations:[{from:7,to:8,remap:{},reset:[]}]};
    const savedSettings=clone(pending),preview=project.previewAttachment(connection,official);
    project.attachToOfficial(preview.input,official,pending);assert.deepEqual(pending,savedSettings);
    assert.equal(project.world.revision,8);assert.equal(project.world.spawn.tileId,'t2');assert.deepEqual(project.world.migrations,pending.migrations);
});

test('applying recomputes from live tiles and the current official base instead of trusting an old preview',()=>{
    const project=pair(),preview=project.previewAttachment(connection,official);
    // A surrounding mod cannot fit into any orientation of the selected half-plane.
    for(let edge=0;edge<6;edge++) if(!project.tiles.has(String(edge)))project.put(String(edge),plain);
    rejects(project,()=>project.attachToOfficial(preview.input,official),/无法整体连接/);
    const clean=pair(),stale=clean.previewAttachment(connection,official),occupied=new Map(official);
    occupied.set('1,4',plain);rejects(clean,()=>clean.attachToOfficial(stale.input,occupied),/官方底图占用/);
});

test('reattaching an extension keeps puzzle identities, event once guards and versioned save progress',()=>{
    const project=pair();project.attachToOfficial(connection,official);const old=published(project),id=worldTileId(old.id,'t1');
    const save={world:worldSaveMeta(old),rw:['highlightd'],dg:[],ms:{done:[id],eventDone:{[id]:['touch']},counts:{visits:1}},
        worldPosition:{tileId:'t1',hash:'1,4'},D:19};
    const settings={...project.world,revision:2,migrations:[{from:1,to:2,remap:{},reset:[]}]};
    project.attachToOfficial({...connection,tileId:'t2'},official,settings);const next=published(project);
    const newSave=migrateWorldSave(save,next);
    assert.deepEqual(worldSaveMeta(next).tiles,worldSaveMeta(old).tiles);assert.deepEqual(newSave.ms.done,[id]);
    assert.deepEqual(newSave.ms.eventDone,{[id]:['touch']});assert.deepEqual(newSave.rw,['highlightd']);assert.equal(newSave.D,19);
    assert.equal(newSave.worldPosition.tileId,'t1');assert.notEqual(next.tiles.find(t=>t.id==='t1').hash,save.worldPosition.hash);
    assert.deepEqual([...official],officialBefore);
});
