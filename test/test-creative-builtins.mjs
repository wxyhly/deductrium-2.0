import assert from 'node:assert/strict';
import {test} from 'node:test';
import {HSLayer} from '../js/hs/main.js';
import {Serde} from '../js/hs/serde.js';
import {HilbertSystem} from '../js/hs/core/core.js';
import {HSParser} from '../js/hs/core/parser.js';
import {initialCreativeRules} from '../js/hs/core/initial.js';
import {numberRules} from '../js/hs/core/number/rules.js';
import {LangMgr} from '../js/lang.js';
import {planDeletion,deleteSelection} from '../js/hs/editing.js';

const leaves = tree => tree.flatMap(n => n.children ? leaves(n.children) : [n]);
function layerWith(text = '') {
    const layer = Object.create(HSLayer.prototype);
    const hs = layer.hilbertSystem = new HilbertSystem();
    layer.ruleList = [];
    layer.navigator = {close(){}};
    const view = tree => ({idCounter:1,expandedFolders:new Set(),refresh(){
        const visit = nodes => nodes.forEach(n => {if(!n.uuid)n.uuid=this.idCounter++;if(n.children)visit(n.children);});
        visit(tree);
    },setData(){}});
    layer.ruleListView = view(layer.ruleList);
    layer.propListView = view([]);
    const gui = layer.sheetGui = {sheets:[{name:'My proof',ctx:hs.saveContext(),pe:[]}],activeIndex:0,
        saveCurrentSheet(){this.sheets[this.activeIndex].ctx=hs.saveContext();},restoreExpanded(){},render(){}};
    layer.serde = new Serde(layer,hs,layer.ruleList,layer.propListView,layer.ruleListView);
    if(text)layer.addRules(text);
    return layer;
}
const legacy = initialCreativeRules.slice(0, -numberRules.length);
const errors = layer => [...layer.hilbertSystem.rules].filter(([,r])=>r.error).map(([n])=>n);
function userMacro(layer,name='qUserKept') {
    layer.addRules(`${name}:⊢$p→$p;.i $p;`);
    assert.equal(layer.hilbertSystem.rules.get(name).error,undefined);
    const node=layer.ruleList.pop();
    layer.ruleList[0].children.push(node);
    return node;
}
function saved(layer) {return layer.serialize();}
function load(layer,data) {layer.deserialize(data,initialCreativeRules);}
function deleteMacro(layer,name) {
    const h=layer.hilbertSystem;
    deleteSelection(h,planDeletion(h,[],[name]),[h.saveContext()]);
    const remove=nodes=>{
        for(let i=nodes.length-1;i>=0;i--){
            if(nodes[i].children)remove(nodes[i].children);
            else if(nodes[i].name===name)nodes.splice(i,1);
        }
    };
    remove(layer.ruleList);
}
function numericFolders(layer) {
    for(const name of ['皮亚诺算数','数系']) assert.ok(layer.ruleList.some(n=>n.name===name&&n.children),name);
    const numbers=layer.ruleList.find(n=>n.name==='数系');
    assert.deepEqual(numbers.children.filter(n=>n.children).map(n=>n.name),['自然数','整数','有理数','实数']);
}
LangMgr.lang='zh';
test('creative legacy save gains numeric folders and keeps user macro, folder IDs and proof sheets',()=>{
    const before=layerWith(legacy), node=userMacro(before);
    before.ruleList[0].name='My logic';
    const uuid=before.ruleList[0].uuid;
    before.ruleListView.expandedFolders.add(uuid);
    before.hilbertSystem.fromCmd([new HSParser().parse('d qUserKept $q','cmd')]);
    const data=saved(before), after=layerWith(); load(after,data);
    numericFolders(after);
    assert.deepEqual(errors(after),[]);
    assert.equal(after.ruleList[0].name,'My logic');assert.equal(after.ruleList[0].uuid,uuid);
    assert.deepEqual(after.ruleList[0].children.find(n=>n.name==='qUserKept'),node);
    assert.equal(after.hilbertSystem.props.at(-1).ast.toString(),'$q→$q');
    assert.ok(after.ruleListView.expandedFolders.has(uuid));
    const uuids=[];const visit=nodes=>nodes.forEach(n=>{uuids.push(n.uuid);if(n.children)visit(n.children);});visit(after.ruleList);
    assert.equal(new Set(uuids).size,uuids.length,'new nodes have unique UUIDs');
    const once=saved(after);load(after,once);assert.deepEqual(saved(after),once,'repeat loads do not duplicate or move folders');
});
test('every creative load replaces stale builtin bodies before replaying user dependencies',()=>{
    const before=layerWith();const data=saved(layerWith(legacy));
    data.r=data.r.replace(/^(\(\d+\))\.i:.*$/m,(_,uuid)=>`${uuid}.i:⊢$1→$1;missingOldRule;`);
    // The user entry intentionally precedes all saved builtins.
    data.r='(9000)qEarly:⊢$p→$p;.i $p;\n'+data.r;data.ri=9001;
    load(before,data);numericFolders(before);assert.deepEqual(errors(before),[]);
    assert.ok(before.hilbertSystem.rules.get('.i').step.length);
    assert.ok(before.hilbertSystem.rules.get('qEarly').step.length);
    data.r=data.r.replace(/^(\(\d+\))a1:.*$/m,'$1a1:ax:⊢$p;');
    load(before,data);
    assert.equal(before.hilbertSystem.rules.get('a1').toString(),layerWith(initialCreativeRules).hilbertSystem.rules.get('a1').toString());
    assert.deepEqual(errors(before),[]);
});
test('renamed builtin and user macro inside numeric folder survive refresh and slot switches',()=>{
    const before=layerWith(initialCreativeRules);
    const node=userMacro(before);before.ruleList[0].children.pop();
    before.ruleList.find(n=>n.name==='数系').children[0].children.push(node);
    before.hilbertSystem.renameD('.i','qIdentity');
    leaves(before.ruleList).find(n=>n.name==='.i').name='qIdentity';
    const data=saved(before);
    data.r=data.r.replace(/^(\(\d+\))qIdentity:.*$/m,(_,uuid)=>`${uuid}qIdentity:⊢$1→$1;missingOldRule;`);
    const after=layerWith();load(after,data);numericFolders(after);assert.deepEqual(errors(after),[]);
    assert.equal(after.hilbertSystem.rules.has('.i'),false);
    assert.ok(after.hilbertSystem.rules.get('qIdentity').step.length);
    assert.ok(after.ruleList.find(n=>n.name==='数系').children[0].children.some(n=>n.name==='qUserKept'));
    assert.deepEqual(after.hilbertSystem.renamedSysRule,before.hilbertSystem.renamedSysRule);
    load(after,saved(layerWith(legacy)));assert.equal(after.hilbertSystem.rules.has('qUserKept'),false);numericFolders(after);
});
test('ordinary and survival deserialization keep the saved selection without creative defaults',()=>{
    const before=layerWith(legacy),after=layerWith();userMacro(before);
    after.deserialize(saved(before));
    assert.equal(after.hilbertSystem.rules.has('apn1'),false);
    assert.equal(after.ruleList.some(n=>n.name==='数系'),false);
    assert.ok(after.hilbertSystem.rules.get('qUserKept').step.length);
});


test('two saved sheets keep independent scoped proofs and the active sheet after refresh',()=>{
    const before=layerWith(legacy),h=before.hilbertSystem,g=before.sheetGui;
    const parse=text=>new HSParser().parse(text,'cmd');
    h.fromCmd(['dir work','hyp $p','cond $q','d a1 $p $q','cd ..','cd ..'].map(parse));
    g.sheets[0].ctx=h.saveContext();g.sheets[0].pe=[11,12];
    h.loadContext(h.createEmptyContext());
    h.fromCmd(['d .i $r','name 1 second'].map(parse));
    g.sheets.push({name:'Second sheet',ctx:h.saveContext(),pe:[20]});g.activeIndex=1;
    const data=saved(before),after=layerWith();load(after,data);
    const result=saved(after);
    assert.deepEqual(result.s,data.s,'both command streams, sheet names, pe, activeIndex survive');
    assert.equal(after.hilbertSystem.props.at(-1).ast.toString(),'$r→$r');
    assert.deepEqual(errors(after),[]);
});
test('chained builtin aliases and a user reuse of the original name are preserved',()=>{
    const before=layerWith(initialCreativeRules),h=before.hilbertSystem;
    h.renameD('.i','qFirst');h.renameD('qFirst','qSecond');
    leaves(before.ruleList).find(n=>n.name==='.i').name='qSecond';
    before.addRules('.i:⊢$p→$q→$p;a1 $p $q;');
    const after=layerWith();load(after,saved(before));
    assert.deepEqual(errors(after),[]);
    assert.equal(after.hilbertSystem.rules.get('.i').toString(),'⊢$p→$q→$p');
    assert.equal(after.hilbertSystem.rules.get('qSecond').toString(),h.rules.get('qSecond').toString());
    assert.equal(leaves(after.ruleList).filter(n=>n.name==='.i').length,1);
});

test('a user macro reusing a deleted builtin alias keeps its body and sheet on legacy loads',()=>{
    const before=layerWith(initialCreativeRules),h=before.hilbertSystem;
    const builtinSchema=h.rules.get('.Z+s').toString();
    h.renameD('.Z+s','qOld');
    const node=leaves(before.ruleList).find(n=>n.name==='.Z+s');
    node.name='qOld';
    deleteMacro(before,'qOld');
    before.addRules('qOld:⊢P→P;.i P;');
    h.fromCmd([new HSParser().parse('d qOld','cmd')]);
    const data=saved(before),userNode=leaves(before.ruleList).find(n=>n.name==='qOld');
    assert.deepEqual(data.rsr,[['.Z+s','qOld']],'production deletion leaves a stale alias');
    const after=layerWith();load(after,data);
    assert.equal(after.hilbertSystem.rules.get('qOld').toString(),'⊢P→P');
    assert.ok(after.hilbertSystem.rules.get('qOld').step.length,'user proof is replayed');
    assert.equal(after.hilbertSystem.rules.get('.Z+s').toString(),builtinSchema);
    assert.equal(after.hilbertSystem.props.at(-1).ast.toString(),'P→P');
    assert.deepEqual(leaves(after.ruleList).find(n=>n.name==='qOld'),userNode);
    assert.equal(after.hilbertSystem.renamedSysRule.has('.Z+s'),false);
    assert.deepEqual(errors(after),[]);
    const once=saved(after);load(after,once);
    assert.deepEqual(saved(after),once,'discarded stale aliases stay discarded on repeat loads');
});

test('matching legacy alias schemas still refresh after placeholder renaming and a broken body',()=>{
    const before=layerWith(initialCreativeRules),h=before.hilbertSystem;
    h.renameD('.Z+s','qSum');
    leaves(before.ruleList).find(n=>n.name==='.Z+s').name='qSum';
    const data=saved(before);
    data.r=data.r.replace(/^(\(\d+\))qSum:.*$/m,
        '$1qSum:⊢$left∈ℤ→$right∈ℤ→$left+$right=$right+$left;missingOldRule;');
    const after=layerWith();load(after,data);
    assert.equal(after.hilbertSystem.rules.has('.Z+s'),false);
    assert.equal(after.hilbertSystem.rules.get('qSum').toString(),h.rules.get('qSum').toString());
    assert.deepEqual(after.hilbertSystem.renamedSysRule,h.renamedSysRule);
    assert.deepEqual(errors(after),[]);
});

test('a stale alias never displaces a user macro that also reused the canonical name',()=>{
    const before=layerWith(initialCreativeRules),h=before.hilbertSystem;
    const builtinSchema=h.rules.get('.Z+s').toString();
    h.renameD('.Z+s','qOld');
    const node=leaves(before.ruleList).find(n=>n.name==='.Z+s');node.name='qOld';
    deleteMacro(before,'qOld');
    before.addRules('qOld:⊢P→P;.i P;\n.Z+s:⊢Q→Q;.i Q;\nqOld1:⊢R→R;.i R;');
    h.fromCmd(['d qOld','d .Z+s'].map(c=>new HSParser().parse(c,'cmd')));
    const after=layerWith();load(after,saved(before));
    assert.equal(after.hilbertSystem.rules.get('qOld').toString(),'⊢P→P');
    assert.equal(after.hilbertSystem.rules.get('.Z+s').toString(),'⊢Q→Q');
    assert.equal(after.hilbertSystem.rules.get('qOld1').toString(),'⊢R→R');
    const name=after.hilbertSystem.getSysRuleName('.Z+s');
    assert.notEqual(name,'.Z+s');assert.notEqual(name,'qOld');assert.notEqual(name,'qOld1');
    assert.equal(after.hilbertSystem.rules.get(name).toString(),builtinSchema);
    assert.deepEqual(after.hilbertSystem.props.map(p=>p.ast.toString()),['P→P','Q→Q']);
    assert.deepEqual(errors(after),[]);
    const once=saved(after);load(after,once);assert.deepEqual(saved(after),once);
});

test('recorded builtin aliases refresh across schema upgrades and override stale rsr names',()=>{
    const oldLibrary=initialCreativeRules.replace(/^\s*\.Z\+s:.*$/m,'.Z+s:⊢P→P;.i P;');
    const before=layerWith(oldLibrary),h=before.hilbertSystem;
    before.serde.captureBuiltins();
    assert.equal(h.rules.get('.Z+s').toString(),'⊢P→P');
    h.renameD('.Z+s','qUpgrade');
    leaves(before.ruleList).find(n=>n.name==='.Z+s').name='qUpgrade';
    const data=saved(before);
    assert.ok(data.rbi.some(([original,name])=>original==='.Z+s'&&name==='qUpgrade'));
    data.rsr=[['.Z+s','qStaleAlias']];
    const after=layerWith();load(after,data);
    const schema=layerWith(initialCreativeRules).hilbertSystem.rules.get('.Z+s').toString();
    assert.equal(after.hilbertSystem.rules.get('qUpgrade').toString(),schema);
    assert.equal(after.hilbertSystem.rules.has('qStaleAlias'),false);
    assert.equal(after.hilbertSystem.rules.has('.Z+s'),false);
    assert.equal(after.hilbertSystem.getSysRuleName('.Z+s'),'qUpgrade');
    assert.deepEqual(errors(after),[]);
    const once=saved(after);load(after,once);assert.deepEqual(saved(after),once);
});

test('recorded identities exclude same-schema replacements at both alias and canonical names',()=>{
    const before=layerWith(initialCreativeRules),h=before.hilbertSystem;
    before.serde.captureBuiltins();
    const original=h.rules.get('.Z+s');
    const definition=before.serde.serializeRulelist().split('\n')
        .find(line=>/^\(\d+\)\.Z\+s:/.test(line)).replace(/^\(\d+\)/,'');
    h.renameD('.Z+s','qSame');
    leaves(before.ruleList).find(n=>n.name==='.Z+s').name='qSame';
    deleteMacro(before,'qSame');
    before.addRules(definition.replace(/^\.Z\+s:/,'qSame:')+'\n'+definition);
    assert.notEqual(h.rules.get('qSame'),original);
    assert.equal(h.rules.get('qSame').toString(),original.toString());
    h.fromCmd(['d qSame x y','d .Z+s x y'].map(c=>new HSParser().parse(c,'cmd')));
    const data=saved(before);
    assert.equal(data.rbi.some(([name])=>name==='.Z+s'),false,'replacement objects are not builtin identities');
    assert.ok(data.rsr.some(([original,name])=>original==='.Z+s'&&name==='qSame'));
    const after=layerWith();load(after,data);
    assert.deepEqual(errors(after),[]);
    for(const name of ['qSame','.Z+s']) {
        assert.equal(after.hilbertSystem.rules.get(name).toString(),original.toString());
        assert.ok(after.hilbertSystem.rules.get(name).step.length);
        assert.deepEqual(leaves(after.ruleList).find(n=>n.name===name),leaves(before.ruleList).find(n=>n.name===name));
    }
    const newName=after.hilbertSystem.getSysRuleName('.Z+s');
    assert.notEqual(newName,'.Z+s');assert.notEqual(newName,'qSame');
    const result=saved(after);
    assert.ok(result.rbi.some(([original,name])=>original==='.Z+s'&&name===newName));
    assert.equal(result.rbi.some(([,name])=>name==='qSame'||name==='.Z+s'),false);
    assert.deepEqual(result.s,data.s);
    load(after,result);assert.deepEqual(saved(after),result);
});

test('empty rbi protects canonical user rules while absent rbi keeps legacy builtin refresh',()=>{
    const empty=layerWith();
    assert.equal('rbi' in saved(empty),false,'uncaptured saves omit the identity field');
    empty.serde.captureBuiltins();assert.deepEqual(saved(empty).rbi,[]);
    const before=layerWith(initialCreativeRules),h=before.hilbertSystem;
    deleteMacro(before,'.Z+s');
    before.addRules('.Z+s:⊢P→P;.i P;');
    h.fromCmd([new HSParser().parse('d .Z+s','cmd')]);
    const data=saved(before);
    data.r=data.r.split('\n').find(line=>/^\(\d+\)\.Z\+s:/.test(line));
    data.rbi=[];
    const after=layerWith();load(after,data);
    assert.equal(after.hilbertSystem.rules.get('.Z+s').toString(),'⊢P→P');
    assert.equal(after.hilbertSystem.props.at(-1).ast.toString(),'P→P');
    const builtinName=after.hilbertSystem.getSysRuleName('.Z+s');
    assert.notEqual(builtinName,'.Z+s');
    assert.equal(after.hilbertSystem.rules.get(builtinName).toString(),
        layerWith(initialCreativeRules).hilbertSystem.rules.get('.Z+s').toString());
    assert.deepEqual(errors(after),[]);
    const once=saved(after);load(after,once);assert.deepEqual(saved(after),once);
    delete data.rbi;
    load(after,data);
    assert.equal(after.hilbertSystem.rules.get('.Z+s').toString(),
        layerWith(initialCreativeRules).hilbertSystem.rules.get('.Z+s').toString());
    after.deserialize(saved(layerWith(legacy)));
    assert.equal('rbi' in saved(after),false,'ordinary loads clear the previous slot identity tracking');
});
