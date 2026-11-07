import assert from 'node:assert/strict';
import {Polygon} from '../js/hy/tiling.js';
import {EditorProject} from '../tools/map-editor/model.mjs';

const polygon=new Polygon(6,4), tile=(id,at,text=id)=>({id,at,type:0,text,data:{}});
const room={format:'deductrium-map-module-v1',id:'room',tiling:{p:6,q:4},
    tiles:[tile('gate',[]),tile('key',[1])],ports:{entrance:{tileId:'gate',edge:0}}};
let checks=0;
function check(name,run) {run();checks++;console.log('PASS '+name);}
function state(project) {return {json:project.toJSON(),tiles:structuredClone([...project.tiles]),source:project.exportSource(),undo:structuredClone(project._undo),redo:structuredClone(project._redo),nextId:project._nextId};}
function rejectsAtomically(project,action,pattern) {const before=state(project);assert.throws(action,pattern);assert.deepEqual(state(project),before);}
function mounted() {
    const project=new EditorProject(polygon);project.registerModule(room);
    project.mount('room',{id:'one',at:[],rotation:0});project.mount('room',{id:'two',at:[3,3,3],rotation:4});return project;
}
check('module versions default to one and reject invalid revisions and versions',()=>{
    const project=new EditorProject(polygon);project.registerModule(room);
    assert.equal(project.modules.get('room').version,1);assert.equal(project.modules.get('room').revision,1);
    for(const field of ['version','revision']) for(const value of [null,0,-1,1.5,'2',Infinity,Number.MAX_SAFE_INTEGER+1])
        rejectsAtomically(project,()=>project.registerModule({...room,id:'bad',[field]:value}));
    const legacy=project.toJSON();delete legacy.version;delete legacy.modules[0].version;delete legacy.modules[0].revision;
    const restored=EditorProject.fromJSON(legacy,polygon);assert.equal(restored.version,1);assert.equal(restored.modules.get('room').revision,1);
});
check('selection exports retain tile IDs across reorderings, versions and namespace exports',()=>{
    const project=new EditorProject(polygon);project.put('4',tile('ignored',[]));project.put('',tile('ignored',[]));
    const options={id:'export',version:3,revision:7,ports:{entry:{tileId:project.tiles.get('').id,edge:2}}};
    const first=project.exportModule(['4',''],'',options),next=project.exportModule(['','4'],'',options);
    assert.deepEqual(first.tiles.map(t=>t.id),['t1','t2']);assert.deepEqual(next.tiles.map(t=>t.id),['t2','t1']);
    assert.equal(next.version,3);assert.equal(next.revision,7);assert.equal(next.ports.entry.tileId,'t2');
    const target=new EditorProject(polygon);target.registerModule(next);target.mount('export',{id:'copy',at:[],rotation:0});
    const exported=target.exportModule([...target.tiles.keys()],'',{id:'nested'});
    assert.deepEqual(exported.tiles.map(t=>t.id),[...target.tiles.values()].map(t=>t.id));
    const nested=new EditorProject(polygon);nested.registerModule(exported);nested.mount('nested',{id:'outer',at:[],rotation:0});
    assert.ok([...nested.tiles.values()].every(t=>t.id.startsWith('outer::copy::')));
    assert.deepEqual(EditorProject.fromJSON(nested.toJSON(),polygon).toJSON(),nested.toJSON());
});
check('one update rebuilds all instances and reports retained, added and deleted identities',()=>{
    const project=mounted(),before=project.toJSON(),placements=structuredClone(project.instances);
    const updated={...room,version:2,revision:4,tiles:[{...tile('gate',[2],'changed'),name:'renamed'},tile('new',[3])],ports:{entrance:{tileId:'gate',edge:5}}};
    const diff=project.updateModule(updated,{deletedTileIds:['key']});
    assert.deepEqual(diff,{moduleId:'room',fromRevision:1,toRevision:4,retainedTileIds:['gate'],addedTileIds:['new'],deletedTileIds:['key'],instanceIds:['one','two']});
    assert.deepEqual(project.instances,placements);
    for(const id of ['one','two']) {
        const gate=[...project.tiles.values()].find(t=>t.id===`${id}::gate`);assert.equal(gate.text,'changed');assert.equal(gate.name,`${id}::renamed`);
        assert.ok([...project.tiles.values()].some(t=>t.id===`${id}::new`));assert.ok(![...project.tiles.values()].some(t=>t.id===`${id}::key`));
    }
    const after=project.toJSON();assert.deepEqual(EditorProject.fromJSON(after,polygon).toJSON(),after);
    project.undo();assert.deepEqual(project.toJSON(),before);project.redo();assert.deepEqual(project.toJSON(),after);
});
check('unknown and stale revisions, ambiguous deletion and invalid ports are atomic errors',()=>{
    const project=mounted();project.undo();
    for(const input of [{...room,id:'unknown',revision:2},room,{...room,revision:0}]) rejectsAtomically(project,()=>project.updateModule(input));
    const removed={...room,revision:2,tiles:[tile('gate',[])]};
    for(const options of [undefined,{deletedTileIds:[]},{deletedTileIds:['gate']},{deletedTileIds:['key','key']},{deletedTileIds:'key'}])
        rejectsAtomically(project,()=>project.updateModule(removed,options));
    rejectsAtomically(project,()=>project.updateModule({...removed,ports:{entrance:{tileId:'key',edge:0}}},{deletedTileIds:['key']}));
    for(const edge of [-1,6,1.5,'0']) rejectsAtomically(project,()=>project.updateModule({...room,revision:2,ports:{entrance:{tileId:'gate',edge}}}));
    rejectsAtomically(project,()=>project.updateModule({...room,revision:2},{deletedTileIds:['missing']}));
});
check('collision at a later instance rolls back the module and every earlier rebuilt instance',()=>{
    const project=mounted();project.put('3,3,3,2',tile('obstacle',[]));
    rejectsAtomically(project,()=>project.updateModule({...room,revision:2,tiles:[tile('gate',[]),tile('key',[4])]}),/已有砖块/);
    assert.equal(project.modules.get('room').revision,1);
});
check('rebuilding permits exchanging space freed by other instances',()=>{
    const project=new EditorProject(polygon),single={...room,tiles:[tile('gate',[])]};project.registerModule(single);
    project.mount('room',{id:'one',at:[],rotation:0});project.mount('room',{id:'two',at:[0],rotation:0});
    project.updateModule({...single,revision:2,tiles:[tile('gate',[0])]});
    assert.equal(project.tiles.get('').id,'two::gate');assert.equal(project.tiles.get('0').id,'one::gate');
});
check('unmounted modules update and deletion can explicitly remove every tile',()=>{
    const project=new EditorProject(polygon);project.registerModule(room);
    assert.deepEqual(project.updateModule({...room,revision:2}).instanceIds,[]);
    project.mount('room',{id:'one',at:[],rotation:0});
    const diff=project.updateModule({...room,revision:3,tiles:[],ports:{}},{deletedTileIds:['gate','key']});
    assert.deepEqual(diff.deletedTileIds,['gate','key']);assert.equal(project.tiles.size,0);assert.equal(project.instances.length,1);
    project.undo();assert.equal(project.tiles.size,2);
});
check('region failures on a later instance roll back every rebuilt tile and preserve world metadata',()=>{
    const single={...room,tiles:[tile('gate',[])]},project=new EditorProject(polygon);
    project.setRegion({hash:'',edge:0,side:1});project.setWorld({revision:1,migrations:[]});project.registerModule(single);
    project.mount('room',{id:'first',at:[3],rotation:0});project.mount('room',{id:'last',at:[],rotation:0});
    rejectsAtomically(project,()=>project.updateModule({...single,revision:2,tiles:[tile('gate',[0])]}),/半平面/);
    project.updateModule({...single,revision:2,tiles:[tile('gate',[3])]});assert.deepEqual(project.world,{revision:1,migrations:[]});
    assert.equal(project.modules.get('room').revision,2);project.undo();assert.equal(project.modules.get('room').revision,1);
});
check('updates reject conflicts between rebuilt instances, not just existing standalone tiles',()=>{
    const single={...room,tiles:[tile('gate',[])]},project=new EditorProject(polygon);project.registerModule(single);
    project.mount('room',{id:'first',at:[],rotation:0});project.mount('room',{id:'last',at:[0],rotation:0});
    rejectsAtomically(project,()=>project.updateModule({...single,revision:2,tiles:[tile('gate',[]),tile('extra',[0])]}),/已有砖块/);
});
check('updates preserve internal script references and isolate new names per stable instance',()=>{
    const project=mounted();
    project.updateModule({...room,revision:2,tiles:[{...tile('gate',[]),name:'new-gate',data:{requiresReward:'new-key',script:'open gate new-gate;give key token'}},
        {...tile('key',[1]),name:'new-key',data:{dstrTarget:'new-gate'}}]});
    for(const instance of project.instances) {
        const gate=[...project.tiles.values()].find(t=>t.id===`${instance.id}::gate`),key=[...project.tiles.values()].find(t=>t.id===`${instance.id}::key`);
        assert.equal(gate.data.requiresReward,`${instance.id}::new-key`);assert.equal(key.data.dstrTarget,`${instance.id}::new-gate`);
        assert.equal(gate.data.script,`open gate ${instance.id}::new-gate\ngive key ${instance.id}::token`);
    }
});
check('standalone identities cannot alias mounted tile identities even at different locations',()=>{
    const project=new EditorProject(polygon),saved=project.toJSON();saved.tiles=[{id:'one::gate',hash:'3,3',type:0,text:'same identity',data:{}}];
    const restored=EditorProject.fromJSON(saved,polygon);restored.registerModule(room);
    rejectsAtomically(restored,()=>restored.mount('room',{id:'one',at:[],rotation:0}),/砖块 ID/);
});
console.log(`${checks} map module update checks passed`);
