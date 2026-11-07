import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Polygon} from '../js/hy/tiling.js';
import {Hvec} from '../js/hy/algebra.js';
import {tileVertices, regionContains, canonicalPath, transport, relativePath} from '../tools/map-editor/geometry.mjs';
import {EditorProject} from '../tools/map-editor/model.mjs';
import {buildWorld, projectFromWorld} from '../tools/map-editor/publish.mjs';
import {parseWorld,validateWorldBase,worldRuntimeTiles,worldSaveMeta,migrateWorldSave,worldTileId} from '../js/hy/world.js';
import {createMapScriptState} from '../js/hy/script.js';
const p=new Polygon(6,4),region={hash:'',edge:0,side:-1};
const neighbor=p.getNeighborAndDir([],0,true)[0].join(',');
const tile=(hash=neighbor,id='start')=>({id,hash,type:0,text:'',data:{}});
const settings={revision:1,mode:'standalone',spawn:{tileId:'start',rotation:0},banks:{},migrations:[]};
const manifest=(extra={})=>Object.fromEntries(Object.entries({format:'deductrium-world-v2',id:'plane',title:'Plane',...structuredClone(settings),tiles:[tile()],region:structuredClone(region),...extra}).filter(([,value])=>value!==undefined));
const extension=()=>manifest({mode:'extension',entry:{mainHash:'',edge:0,tileId:'start'}});
const plain={type:0,text:'',data:{}};
const snapshot=v=>structuredClone(v.toJSON());
function atomic(project,run,pattern){const before=snapshot(project),undo=structuredClone(project._undo),redo=structuredClone(project._redo);assert.throws(run,pattern);assert.deepEqual(snapshot(project),before);assert.deepEqual(project._undo,undo);assert.deepEqual(project._redo,redo);}
test('exact vertices and path transport agree with the actual tiling including long paths',()=>{
    assert.equal(regionContains('',region,p),false);assert.equal(regionContains(neighbor,region,p),true);
    for(let edge=0;edge<6;edge++) {
        const n=p.getNeighborAndDir([],edge,true)[0];
        assert.equal(regionContains(n.join(','),{hash:'',edge,side:-1},p),true);
        assert.equal(regionContains('',{hash:'',edge,side:1},p),true);
    }
    const paths=['',neighbor,'2,3,4','4,3,2,3'];
    for(const hash of paths) for(const origin of paths) assert.deepEqual(transport(relativePath(hash,origin,p),origin,0,p).at,canonicalPath(hash,p));
    const deep=Array(512).fill(3),vertices=tileVertices(deep,p);
    assert.equal(vertices.length,6);assert.ok(vertices.flat().every(v=>typeof v==='bigint'));
    assert.ok(vertices.some(v=>v.some(x=>x>BigInt(Number.MAX_SAFE_INTEGER))));
    const at=canonicalPath('2,3,3,4',p);p.generateRotors();
    // Exact homogeneous coordinates convert to the same floating hyperboloid vertices.
    const exact=tileVertices(at,p),rotor=p.rotors.get(at.join(','));
    const local=tileVertices([],p);
    for(let i=0;i<6;i++) {const [z,x,y]=exact[i].map(Number),[lz,lx,ly]=local[i].map(Number);const b=rotor.apply(new Hvec(Math.sqrt(3)*lz,lx/Math.sqrt(2),Math.sqrt(1.5)*ly));assert.ok(Math.abs(x/z/Math.sqrt(6)-b.x/b.z)<1e-10);assert.ok(Math.abs(y/z/Math.sqrt(2)-b.y/b.z)<1e-10);}
});
test('legacy raw editing remains flexible; configured projects lock missing planes and forbid exemptions',()=>{
    const raw=new EditorProject(p);raw.put('',plain);raw.remove('');raw.setRegion({...region,entrance:''});raw.put('',plain);
    atomic(raw,()=>raw.setWorld(settings),/豁免/);
    const legacy=projectFromWorld(manifest({format:'deductrium-world-v1',region:undefined,tiles:[tile('')]}),p);
    assert.equal(legacy.canEdit(''),false);assert.equal(legacy.isEditable(''),false);
    for(const op of [()=>legacy.put('',plain),()=>legacy.remove(''),()=>legacy.registerModule({format:'deductrium-map-module-v1',id:'m',tiling:{p:6,q:4},tiles:[],ports:{}})])atomic(legacy,op,/半平面/);
    legacy.setRegion({hash:'',edge:0,side:1});assert.equal(legacy.canEdit(''),true);
    atomic(legacy,()=>legacy.setRegion(null),/不能取消/);atomic(legacy,()=>legacy.setWorld(null),/不能取消/);
});
test('configured mutation/import/module paths enforce the plane with atomic rollback',()=>{
    const project=projectFromWorld(manifest(),p);assert.equal(project.isEditable(''),false);assert.equal(project.canEdit(neighbor),true);
    atomic(project,()=>project.put('',plain),/半平面/);atomic(project,()=>project.remove(''),/半平面/);
    const bad=project.toJSON();bad.tiles.push(tile('','outside'));assert.throws(()=>EditorProject.fromJSON(bad,p),/半平面/);
    const room={format:'deductrium-map-module-v1',id:'m',tiling:{p:6,q:4},tiles:[{id:'a',at:[],...plain}],ports:{}};
    project.registerModule(room);assert.ok(project.previewMount('m',{id:'one',at:[],rotation:0}).errors.length);
    atomic(project,()=>project.mount('m',{id:'one',at:[],rotation:0}),/半平面/);
    const inside='1,3,3'; // Find an unoccupied tile wholly inside using the actual predicate.
    const target=[neighbor+',3',neighbor+',2',inside].find(h=>project.canEdit(h)&&!project.tiles.has(canonicalPath(h,p).join(',')));
    assert.ok(target);project.mount('m',{id:'one',at:target.split(',').map(Number),rotation:0});
    atomic(project,()=>project.moveInstance('one',{at:[],rotation:3}),/半平面/);
    atomic(project,()=>project.updateModule({...room,revision:2,tiles:[{id:'a',at:relativePath('',target,p),...plain}]},{deletedTileIds:[]}),/半平面/);
    const saved=project.toJSON();assert.deepEqual(EditorProject.fromJSON(saved,p).toJSON(),saved);
});
test('new publications require planes and retain them across editor round trips',()=>{
    const raw=new EditorProject(p);raw.put('',plain);const config={...settings,spawn:{tileId:'t1',rotation:0}};
    assert.throws(()=>buildWorld(raw,config),/半平面/);
    raw.setRegion({hash:'',edge:0,side:1});const w=buildWorld(raw,config);assert.equal(w.format,'deductrium-world-v2');assert.deepEqual(w.region,raw.region);
    const restored=projectFromWorld(w,p);assert.deepEqual(restored.region,w.region);assert.equal(restored.canEdit(neighbor),false);assert.deepEqual(buildWorld(restored),w);
});
test('extension entry requires exact adjacency and official walkability, without mutating official tiles',()=>{
    const base=new Map([['',{type:0,text:'official',data:{original:true}}]]),before=structuredClone([...base]);
    const w=parseWorld(extension());validateWorldBase(w,base);assert.deepEqual([...base],before);
    for(const bad of [manifest({mode:'extension',region:undefined}),manifest({mode:'extension'}),extension()]) {
        if(bad.entry)bad.entry.edge=1;
        assert.throws(()=>parseWorld(bad),/requires region|requires adjacent entry|exact official neighbor/);
    }
    assert.throws(()=>validateWorldBase(w,new Map([['',{type:1}]])),/walkable/);
    assert.throws(()=>validateWorldBase(w,new Map([['',{type:0}],[neighbor,{type:1}]])),/intersects|overlaps/);
    assert.throws(()=>validateWorldBase(w,new Map()),/existing official/);
    assert.throws(()=>parseWorld(manifest({tiles:[tile('')]})),/outside mod/);
});
test('v1 standalone and extension remain compatible while v2 missing scope fails',()=>{
    const legacy=manifest({format:'deductrium-world-v1',region:undefined,tiles:[tile('')]});delete legacy.region;
    assert.equal(worldRuntimeTiles(legacy).length,1);assert.equal(parseWorld(legacy).region,undefined);
    const legacyExt={...legacy,mode:'extension'};assert.equal(parseWorld(legacyExt).mode,'extension');validateWorldBase(legacyExt,new Map([['3',{type:0}]]));assert.throws(()=>validateWorldBase(legacyExt,new Map([['',{type:0}]])),/overlaps/);
    assert.equal(projectFromWorld(legacyExt,p).canEdit(''),false);
    assert.throws(()=>parseWorld({...legacy,format:'deductrium-world-v2'}),/requires region/);
    assert.throws(()=>parseWorld({...legacyExt,format:'deductrium-world-v2',region:{hash:'',edge:0,side:1}}),/requires adjacent entry/);
    const data={world:worldSaveMeta(legacy),rw:[],dg:[]};delete data.world.mode;
    assert.equal(migrateWorldSave(data,legacy).world.mode,'standalone');
    assert.throws(()=>migrateWorldSave({world:{...worldSaveMeta(legacy),mode:'extension'}},legacy),/mode changed/);
});
test('event handlers recursively validate currencies and rewrite local tile references',()=>{
    const w=manifest();w.tiles[0].data.script='on touch\n if flag ready\n  open gate start\n end\nend';
    const script=worldRuntimeTiles(w)[0][1].data.script;assert.match(script,/open gate mod:plane::start/);assert.match(script,/flag mod:plane::ready/);
    w.tiles[0].data.script='on touch\n open gate missing\nend';assert.throws(()=>parseWorld(w),/Unknown internal/);
    w.tiles[0].data.script='on touch\n give currency mod:foreign 1\nend';assert.throws(()=>parseWorld(w),/Unregistered/);
});
test('eventDone follows remap, survives explicit resets and deletes removed identities atomically',()=>{
    const old=manifest({tiles:[tile(neighbor,'start'),tile(neighbor+',3','removed')]}),sid=id=>worldTileId('plane',id);
    const data={world:worldSaveMeta(old),rw:[],dg:[],ms:createMapScriptState({eventDone:{[sid('start')]:['touch','pass'],[sid('removed')]:['collect']},done:[sid('start')]})};
    const next=manifest({revision:2,tiles:[tile(neighbor,'renamed')],spawn:{tileId:'renamed',rotation:0},migrations:[{from:1,to:2,remap:{start:'renamed',removed:null},reset:['renamed']}]});
    const before=structuredClone(data),migrated=migrateWorldSave(data,next);assert.deepEqual(data,before);
    assert.deepEqual(migrated.ms.eventDone,{[sid('renamed')]:['touch','pass']});assert.deepEqual(migrated.ms.done,[sid('renamed')]);
    const bad=structuredClone(data);bad.ms.eventDone[sid('unknown')]=['start'];const snapshot=structuredClone(bad);assert.throws(()=>migrateWorldSave(bad,next),/unknown saved tile/);assert.deepEqual(bad,snapshot);
});

test('readonly base coordinates cover every extension mutation and remain outside JSON/history',()=>{
    const project=new EditorProject(p);project.setRegion({hash:'',edge:0,side:1});project.setWorld({...settings,mode:'extension'});
    const before=snapshot(project),undo=structuredClone(project._undo);project.setReadonlyBase(['']);assert.deepEqual(snapshot(project),before);assert.deepEqual(project._undo,undo);
    assert.equal(project.canEdit(''),false);assert.equal(project.isEditable(''),false);
    atomic(project,()=>project.put('',plain),/只读官方/);atomic(project,()=>project.remove(''),/只读官方/);
    project.put('3',plain);const saved=snapshot(project);atomic(project,()=>project.setReadonlyBase(['3']),/重叠/);assert.equal(project.canEdit(''),false);assert.equal(project.canEdit('3'),true);
    project.undo();assert.equal(project.canEdit(''),false);project.redo();assert.deepEqual(snapshot(project),saved);assert.equal(project.canEdit(''),false);
    const room={format:'deductrium-map-module-v1',id:'readonly',tiling:{p:6,q:4},tiles:[{id:'a',at:[],...plain}],ports:{}};
    project.registerModule(room);atomic(project,()=>project.mount('readonly',{id:'one',at:[],rotation:0}),/只读官方/);
    project.mount('readonly',{id:'one',at:[2],rotation:0});atomic(project,()=>project.moveInstance('one',{at:[],rotation:0}),/只读官方/);
    atomic(project,()=>project.updateModule({...room,revision:2,tiles:[{id:'a',at:relativePath('','2',p),...plain}]},{deletedTileIds:[]}),/只读官方/);
    const conflict=EditorProject.fromJSON(project.toJSON(),p);atomic(conflict,()=>conflict.setReadonlyBase(['3']),/重叠/);
    const standalone=new EditorProject(p);standalone.setReadonlyBase(['']);assert.equal(standalone.canEdit(''),true);
    const history=new EditorProject(p);history.setRegion({hash:'',edge:0,side:1});history.setWorld({...settings,mode:'extension'});history.put('',plain);history.remove('');history.setReadonlyBase(['']);
    const oldUndo=structuredClone(history._undo),oldRedo=structuredClone(history._redo);atomic(history,()=>history.undo(),/重叠/);assert.deepEqual(history._undo,oldUndo);assert.deepEqual(history._redo,oldRedo);
});
test('@self survives world publication and module relocation only in tile-reference positions',()=>{
    const source='on touch\n demolish gate @self\n open gate @self\n set text @self "hello"\n reset reward @self\n give key @self\n set flag @self\nend';
    const w=manifest();w.tiles[0].data.script=source;const published=worldRuntimeTiles(w)[0][1].data.script;
    for(const op of ['demolish gate','open gate','set text','reset reward'])assert.ok(published.includes(op+' @self'));
    assert.match(published,/give key mod:plane::@self/);assert.match(published,/set flag mod:plane::@self/);
    const project=new EditorProject(p);project.registerModule({format:'deductrium-map-module-v1',id:'self',tiling:{p:6,q:4},tiles:[{id:'a',at:[],...plain,data:{script:source}}],ports:{}});
    project.mount('self',{id:'copy',at:[3],rotation:2});const script=[...project.tiles.values()][0].data.script;
    assert.match(script,/open gate @self/);assert.match(script,/give key copy::@self/);assert.match(script,/set flag copy::@self/);
});
test('legacy extension event and official progress survive migration and format-only v2 upgrades',()=>{
    const old=manifest({format:'deductrium-world-v1',mode:'extension'});delete old.region;
    const sid=worldTileId('plane','start'),data={world:worldSaveMeta(old),rw:['official',sid],dg:['official-hash'],ms:createMapScriptState({eventDone:{official:['touch'],[sid]:['pass']},done:['official',sid]}),worldPosition:{hash:'3',rotation:0}};
    const next=extension(),migrated=migrateWorldSave(data,next);assert.deepEqual(migrated.ms.eventDone,data.ms.eventDone);assert.deepEqual(migrated.rw,data.rw);assert.deepEqual(migrated.dg,data.dg);assert.deepEqual(migrated.worldPosition,data.worldPosition);assert.deepEqual(migrated.world.tiles,data.world.tiles);
});
