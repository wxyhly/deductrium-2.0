import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Polygon} from '../js/hy/tiling.js';
import {EditorProject} from '../tools/map-editor/model.mjs';
import {searchProject, previewReplace, applyReplace, analyzeProject, deleteImpact} from '../tools/map-editor/authoring.mjs';

const tile=(text='',data={},extra={})=>({type:0,text,data,...extra});
function fixture() {
    const p=new EditorProject(new Polygon(6,4));
    p.put('',tile({zh:'红钥匙 RED',en:'Red key'},{getD:1,unl:{layer:'D-layer',other:true},custom:{a:1,b:2}},{name:'root'}));
    p.put('0',tile('red door',{script:'require key red\nopen gate root'},{type:2,name:'door'}));
    return p;
}
test('batch data and reward patches preserve unrelated nested properties and one undo',()=>{
    const p=fixture(), before=p.toJSON(), depth=p._undo.length;
    const result=p.batchEdit(['','0','0'],{type:3,data:{custom:{a:7}},reward:{getD:4,unl:{layer:'T-layer'}},script:'give key red'});
    assert.equal(result.count,2); assert.equal(p._undo.length,depth+1);
    assert.deepEqual(p.tiles.get('').data.custom,{a:7,b:2});
    assert.deepEqual(p.tiles.get('').data.unl,{layer:'T-layer',other:true});
    assert.equal(p.tiles.get('').data.getD,4);
    p.undo(); assert.deepEqual(p.toJSON(),before); p.redo(); assert.equal(p.tiles.get('0').type,3);
});
test('invalid scripts, duplicate names, readonly instance and range failures are atomic',()=>{
    const p=fixture(), before=p.toJSON(), depth=p._undo.length;
    for (const patch of [{script:'not a command'},{name:'same'},{id:'changed'},{data:{script:42}}]) {
        assert.throws(()=>p.batchEdit(['','0'],patch)); assert.deepEqual(p.toJSON(),before); assert.equal(p._undo.length,depth);
    }
    p.registerModule(p.exportModule(['0'],'0',{id:'module',title:'Module'}));
    p.mount('module',{id:'instance',at:[2],rotation:0});
    const mounted=[...p.tiles.values()].find(t=>t.instanceId);
    const snapshot=p.toJSON(), history=p._undo.length;
    assert.throws(()=>p.batchEdit(['',mounted.hash],{type:1}),/分离/);
    assert.throws(()=>p.batchEdit(['',mounted.hash],{delete:true}),/分离/);
    assert.deepEqual(p.toJSON(),snapshot); assert.equal(p._undo.length,history);
    // Exercise _change's rollback after mutation, rather than only prevalidation.
    const validate=p._validateRegion;
    p._validateRegion=()=>{throw Error('forced range failure');};
    assert.throws(()=>p.batchEdit([''],{type:1}),/range failure/);
    p._validateRegion=validate;
    assert.deepEqual(p.toJSON(),snapshot); assert.equal(p._undo.length,history);
});
test('search includes translations, scripts, nested data, stable identity and instance fields',()=>{
    const p=fixture();
    assert(searchProject(p,{query:'红钥匙'}).some(m=>m.field==='text.zh'));
    assert(searchProject(p,{query:'require key red'}).some(m=>m.field==='data.script'));
    assert(searchProject(p,{query:p.tiles.get('').id,fields:['id']}).some(m=>m.readOnly));
    assert(searchProject(p,{query:'2',fields:['data.custom.b']}).length);
    p.registerModule(p.exportModule([''],'',{id:'module',title:'Module'}));
    p.mount('module',{id:'instance',at:[2],rotation:0});
    assert(searchProject(p,{query:'instance',fields:['instanceId']}).some(m=>m.readOnly));
    assert(searchProject(p,{query:'module',fields:['moduleId']}).length);
});
test('replacement previews actual fields, supports literal case and field filters, and undo',()=>{
    const p=fixture(), before=p.toJSON(), depth=p._undo.length;
    const options={query:'red',replacement:'blue',fields:['text'],caseSensitive:false};
    const preview=previewReplace(p,options);
    assert.equal(preview.changes.length,3); assert.deepEqual(p.toJSON(),before);
    const result=applyReplace(p,options); assert.equal(result.changes.length,3);
    assert.equal(p._undo.length,depth+1); assert.equal(p.tiles.get('').text.zh,'红钥匙 blue');
    assert.equal(p.tiles.get('0').data.script,'require key red\nopen gate root');
    p.undo(); assert.deepEqual(p.toJSON(),before);
    assert.equal(previewReplace(p,{...options,caseSensitive:true}).changes.length,1);
    assert.equal(previewReplace(p,{query:'red',replacement:'red',caseSensitive:true}).changes.length,0);
});
test('replacement reparses scripts and rejects all changes on invalid final values',()=>{
    const p=fixture(), before=p.toJSON(), depth=p._undo.length;
    const options={query:'red',replacement:'bad; command'};
    assert(previewReplace(p,options).errors.length);
    assert.throws(()=>applyReplace(p,options));
    assert.deepEqual(p.toJSON(),before); assert.equal(p._undo.length,depth);
    assert.throws(()=>applyReplace(p,{query:'',replacement:'x'}));
    assert.throws(()=>applyReplace(p,{query:'1',replacement:'oops',fields:['data.getD']}));
    assert.deepEqual(p.toJSON(),before);
});
test('batch delete and explicit property removal can be undone with stable IDs',()=>{
    const p=fixture(), before=p.toJSON();
    p.batchEdit([''],{removeData:['getD'],script:null});
    assert.equal(p.tiles.get('').data.getD,undefined); assert.equal(p.tiles.get('').data.custom.b,2);
    p.undo(); assert.deepEqual(p.toJSON(),before);
    const deleted=p.batchEdit(['','0'],{delete:true}); assert.equal(p.tiles.size,0);
    assert.deepEqual(deleted.tileIds,before.tiles.map(t=>t.id));
    p.undo(); assert.deepEqual(p.toJSON(),before);
});
test('replacement skips identities and mounted tiles, uses live data, and treats patterns literally',()=>{
    const p=fixture(), originalId=p.tiles.get('').id;
    p.registerModule(p.exportModule([''],'',{id:'module',title:'Module'}));
    p.mount('module',{id:'instance',at:[2],rotation:0});
    const mounted=[...p.tiles.values()].find(t=>t.instanceId), mountedBefore=structuredClone(mounted);
    const preview=p.previewReplace({query:'Red',replacement:'$&.*',fields:['text']});
    assert(preview.skipped.some(m=>m.tileId===mounted.id));
    p.applyReplace({query:'Red',replacement:'$&.*',fields:['text']});
    assert.deepEqual(p.tiles.get(mounted.hash),mountedBefore);
    assert.equal(p.tiles.get('').id,originalId); assert.equal(p.tiles.get('').text.en,'$&.* key');
    p.previewReplace({query:'$&.*',replacement:'stale',fields:['text']});
    p.put('',tile('live value'));
    const depth=p._undo.length;
    assert.equal(p.applyReplace({query:'$&.*',replacement:'stale',fields:['text'],hashes:['']}).changes.length,0);
    assert.equal(p._undo.length,depth); assert.equal(p.tiles.get('').text,'live value');
});
test('replacement filters hashes, handles dotted JSON keys and typed values',()=>{
    const p=fixture();
    p.batchEdit([''],{data:{'a.b':'needle',hidden:{'needle-key':'value'},nullable:null,enabled:true}});
    assert(p.searchProject({query:'needle-key'}).some(m=>m.isKey && m.readOnly));
    p.applyReplace({query:'needle',replacement:'thread',hashes:[''],fields:['data.a.b']});
    assert.equal(p.tiles.get('').data['a.b'],'thread');
    p.applyReplace({query:'true',replacement:'false',hashes:[''],fields:['data.enabled']});
    assert.equal(p.tiles.get('').data.enabled,false);
    const before=p.toJSON();
    assert.throws(()=>p.applyReplace({query:'null',replacement:'{}',fields:['data.nullable']}));
    assert.deepEqual(p.toJSON(),before);
});
test('diagnostics aggregate every branch, numbers, bank/currency and engine prerequisites with locations',()=>{
    const p=fixture();
    p.batchEdit([''],{script:'on start\nif not key absent\nset text missing "hello"\nelse\nrequire rule-present unknown-rule\nrequire count visits >= count(other)\nexchange unknown-bank reasoning 1 type\nend\nend'});
    const before=p.toJSON(), depth=p._undo.length;
    const result=analyzeProject(p,{topology:false});
    const missing=result.references.find(r=>r.target==='missing');
    assert.deepEqual([missing.kind,missing.line,missing.hash,missing.resolved],['text',3,'',false]);
    assert(result.references.some(r=>r.kind==='count' && r.target==='other'));
    assert(result.references.some(r=>r.kind==='rule' && r.target==='unknown-rule'));
    assert(result.diagnostics.some(d=>d.code==='unresolved-reference' && d.line===7));
    assert(result.diagnostics.some(d=>d.code==='missing-producer' && d.message.includes('unknown-rule')));
    assert(!result.diagnostics.some(d=>d.message.includes('absent')));
    assert.deepEqual(p.toJSON(),before); assert.equal(p._undo.length,depth);
    const known=analyzeProject(p,{topology:false,known:{rule:['unknown-rule'],count:['visits','other'],bank:['unknown-bank'],key:['red']}});
    assert(!known.diagnostics.some(d=>d.code==='missing-producer'));
});
test('duplicate IDs/names and alias collisions are diagnosed without needing a valid publication',()=>{
    const p=fixture();
    p.tiles.get('0').name=p.tiles.get('').name;
    p.tiles.get('0').id=p.tiles.get('').id;
    let issues=p.analyzeProject({topology:false}).diagnostics;
    assert.equal(issues.filter(d=>d.code==='duplicate-id').length,2);
    assert.equal(issues.filter(d=>d.code==='duplicate-name').length,2);
    p.tiles.get('0').id='unique'; p.tiles.get('0').name=p.tiles.get('').id;
    issues=p.analyzeProject({topology:false}).diagnostics;
    assert(issues.some(d=>d.code==='ambiguous-alias'));
});
test('unlock commands cannot prove their own engine catalog target exists',()=>{
    const p=fixture();
    p.batchEdit([''],{script:'unlock rule unknown-rule\nunlock type unknown-type'});
    const result=p.analyzeProject({topology:false});
    for (const target of ['unknown-rule','unknown-type']) {
        assert(result.references.some(r=>r.target===target && r.catalog && !r.resolved));
        assert(result.diagnostics.some(d=>d.code==='missing-producer' && d.message.includes(target)));
    }
    const known=p.analyzeProject({topology:false,known:{rule:['unknown-rule'],type:['unknown-type'],key:['red']}});
    assert(!known.diagnostics.some(d=>d.code==='missing-producer'));
});
test('syntax errors retain tile, field and real line; other tiles still report references',()=>{
    const p=fixture();
    p.tiles.get('').data.script='message "first"\ninvalid command';
    const result=p.analyzeProject({topology:false});
    const issue=result.diagnostics.find(d=>d.code==='script-parse');
    assert.deepEqual([issue.tileId,issue.hash,issue.field,issue.line],[p.tiles.get('').id,'','data.script',2]);
    assert(result.references.some(r=>r.target==='red'));
    const preview=p.previewReplace({query:'red',replacement:'bad; command',fields:['script']});
    assert(preview.errors.some(e=>e.hash==='0' && e.field==='data.script'));
});
test('key/reward dependencies yield potential cycles and deletion includes transitive dependents',()=>{
    const p=new EditorProject(new Polygon(6,4));
    p.put('',tile('',{script:'require key blue\ngive key red'},{type:3,name:'red-source'}));
    p.put('0',tile('',{script:'require key red\ngive key blue'},{type:3,name:'blue-source'}));
    p.put('1',tile('',{requiresReward:'red-source',script:'require key blue\nopen gate red-source'},{type:2}));
    const [red,blue,door]=[...p.tiles.values()].map(t=>t.id), before=p.toJSON();
    const result=p.analyzeProject({topology:false});
    assert(result.cycles.some(c=>c.tileIds.includes(red) && c.tileIds.includes(blue)));
    assert(result.diagnostics.some(d=>d.code==='dependency-cycle' && d.severity==='warning'));
    assert(!result.diagnostics.some(d=>d.code==='missing-producer'));
    const impact=deleteImpact(p,['']);
    assert(impact.references.some(r=>r.kind==='reward'));
    assert(impact.references.some(r=>r.kind==='gate'));
    assert(impact.dependentTileIds.includes(blue)); assert(impact.dependentTileIds.includes(door));
    assert.deepEqual(p.toJSON(),before);
});
test('delete impact includes world spawn/entry and recognizes @self without false unresolved refs',()=>{
    const p=fixture();
    p.batchEdit([''],{script:'open gate @self'});
    p._world={mode:'extension',spawn:{tileId:p.tiles.get('').id},entry:{tileId:p.tiles.get('').id}};
    const result=p.analyzeProject({validatePublication:false,topology:false});
    assert(!result.references.find(r=>r.target==='@self').external);
    assert(result.references.find(r=>r.target==='@self').resolved);
    const impact=p.deleteImpact([''],{validatePublication:false});
    assert(impact.references.some(r=>r.field==='world.spawn.tileId'));
    assert(impact.references.some(r=>r.field==='world.entry.tileId'));
});
test('library modules are analyzed in local scopes; mounted producers remain isolated',()=>{
    const p=new EditorProject(new Polygon(6,4));
    p.put('',tile('',{script:'give key red'},{type:3,name:'producer'}));
    p.put('0',tile('',{script:'require key red\nset text producer "hello"'},{type:2}));
    p.registerModule(p.exportModule(['','0'],'',{id:'module',title:'Module',ports:{entry:{tileId:p.tiles.get('').id,edge:0}}}));
    p.mount('module',{id:'first',at:[2,1],rotation:0});
    p.mount('module',{id:'second',at:[4,1],rotation:0});
    const result=p.analyzeProject({topology:false});
    assert(!result.diagnostics.some(d=>d.code==='missing-producer' || d.code==='unresolved-reference'));
    assert(result.references.some(r=>r.scope==='module:module' && r.field==='ports.entry.tileId'));
    const dependency=result.dependencies.find(d=>d.from.startsWith('first::') && d.kind==='key');
    assert(dependency.to.startsWith('first::'));
    assert(p.deleteImpact([[2,1]]).readOnly.length);
});
test('topology warns conservatively about isolated/unreachable tiles and can include official paths',()=>{
    const p=new EditorProject(new Polygon(6,4));
    p.put('',tile()); p.put('0,1',tile()); p.put('1',tile('',{},{type:1}));
    const before=p.toJSON(), remote=p.tiles.get('0,1').id;
    let result=p.analyzeProject();
    assert(result.topology.unreachableTileIds.includes(remote));
    assert(!result.topology.isolatedTileIds.includes(p.tiles.get('1').id));
    p._world={mode:'extension',entry:{tileId:p.tiles.get('').id}};
    result=p.analyzeProject({validatePublication:false});
    assert(result.topology.allowsExternalPaths);
    assert(result.diagnostics.some(d=>d.code==='unreachable-tile' && d.severity==='warning' && d.message.includes('官方地图')));
    result=p.analyzeProject({validatePublication:false,baseTiles:new Map([['0',tile()]])});
    assert.equal(result.topology.unreachableTileIds.length,0);
    p._world=null; assert.deepEqual(p.toJSON(),before);
});
