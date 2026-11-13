import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateWorldContent, definitionLine, contentId} from '../js/hy/world-content.js';
import {checkWorldContent, createMapScriptEngine} from '../js/hy/script-engine.js';
import {createMapScriptState} from '../js/hy/script.js';
import {HSLayer} from '../js/hs/main.js';
import {HilbertSystem} from '../js/hs/core/core.js';
import {HSParser} from '../js/hs/core/parser.js';
import {initialSurvivalRules, initialCreativeRules} from '../js/hs/core/initial.js';
import {NodeType} from '../js/asttype.js';
import {Serde} from '../js/hs/serde.js';
import {parseWorld, worldRuntimeTiles, worldSaveMeta, migrateWorldSave} from '../js/hy/world.js';

const empty=()=>({rules:[],definitions:[],knowledge:[],achievements:[]});
const identity={id:'qIdentity',statement:'⊢$1→$1',proof:'d .i $1'};
const fresh={id:'qFresh',kind:'function',symbol:'fFresh',parameters:['$x'],body:'$x'};
function fixture(content, initial = initialSurvivalRules) {
    const hs=Object.create(HSLayer.prototype), system=new HilbertSystem();
    Object.assign(hs,{hilbertSystem:system,ruleList:[],ruleListView:{refresh(){},expandedFolders:new Set(),idCounter:1},propListView:{refresh(){},setData(){}}});
    hs.addRules(initial);
    hs.sheetGui={activeIndex:0,sheets:[{name:'Sheet',ctx:system.saveContext(),pe:[]}],saveCurrentSheet(){this.sheets[0].ctx=system.saveContext();},restoreExpanded(){},render(){}};
    hs.refresh=()=>{};
    return {hs,system,engine:createMapScriptEngine(hs,{},(Array.isArray(content) ? content : [content]).map(validateWorldContent)),state:createMapScriptState()};
}
const run=(system,text)=>system.fromCmd(text.split(';').filter(Boolean).map(c=>new HSParser().parse(c,'cmd')));
const manifest=(content)=>({format:'deductrium-world-v1',id:'content-world',title:'Content',revision:1,mode:'standalone',spawn:{tileId:'start',rotation:0},
    tiles:[{id:'start',hash:'',type:0,text:'start',data:{}},{id:'gate',hash:'0',type:2,text:'P→P',data:{p:true}},{id:'reward',hash:'1',type:3,text:'note',data:{info:'note',ac:'badge',script:'unlock info note\nunlock achievement badge'}}],banks:{},migrations:[],content});

test('content schema preserves localized text and requires full valid expressions and stable local IDs',()=>{
    const content=validateWorldContent({...empty(),rules:[identity],definitions:[fresh],knowledge:[{id:'note',title:{zh:'笔记',en:'Note'},body:'<b>literal</b>'}],achievements:[{id:'badge',title:'Badge',description:'Description'}]});
    assert.deepEqual(content.rules,[identity]); assert.match(definitionLine(fresh),/fFresh\(\$x\)/);
    for(const input of [{rules:[{...identity,statement:'⊢P)'}]},{rules:[{...identity,id:'cBad'}]},{rules:[identity,identity]}, {knowledge:[{id:'__proto__',title:'x',body:'x'}]}])assert.throws(()=>validateWorldContent(input));
    assert.equal(contentId('w','note',true),'mec:mod:w::note');
});
test('definitions require a fresh nonrecursive symbol, complete parameter binding and correct expression kind',()=>{
    for(const def of [{...fresh,body:'fFresh($x)'},{...fresh,body:'$y'},{...fresh,body:'y'},{...fresh,body:'#sb($x,$x,0)'},{...fresh,kind:'constant'},{...fresh,kind:'predicate',body:'$x'}])assert.throws(()=>validateWorldContent({definitions:[def]}));
    checkWorldContent(validateWorldContent({definitions:[fresh,{id:'qPred',kind:'predicate',symbol:'freshPred',parameters:['$x','$y'],body:'$x∈$y'}]}));
    assert.throws(()=>checkWorldContent(validateWorldContent({definitions:[{...fresh,symbol:'S'}]})),/already exists|已|invalid|Content/);
});
test('author preflight kernel-checks theorem bodies, forward dependencies and cycles without axiom fallback',()=>{
    checkWorldContent(validateWorldContent({rules:[{id:'qLater',statement:identity.statement,proof:'d qIdentity $1'},identity]}));
    for(const rule of [{...identity,statement:'⊢P'},{...identity,proof:'hyp $1→$1'}, {...identity,proof:'d qIdentity $1'}])assert.throws(()=>checkWorldContent(validateWorldContent({rules:[rule]})));
    assert.throws(()=>checkWorldContent(validateWorldContent({rules:[{id:'qA',statement:'⊢P',proof:'d qB'},{id:'qB',statement:'⊢P',proof:'d qA'}]})),/循环/);
    assert.throws(()=>checkWorldContent(validateWorldContent({rules:[{...identity,id:'.i'}]})),/冲突/);
});
test('earned custom proofs remain checked macros, not axioms; custom definitions and state restore are isolated',()=>{
    const f=fixture({...empty(),rules:[identity],definitions:[fresh]});
    f.engine.validate({op:'unlock-rule',id:'qIdentity'});
    f.state.engine.rules=['qIdentity','qFresh']; f.engine.validateState(f.state);
    assert.equal(f.system.rules.has('qIdentity'),false);
    f.engine.restore(f.state);
    assert(f.system.rules.get('qIdentity').step.length);
    assert.equal(f.system.rules.get('qFresh').step,undefined);
    run(f.system,'d qIdentity P'); assert.equal(f.system.props.at(-1).ast.toString(),'P→P');
    const saved=new Serde(f.hs,f.system,f.hs.ruleList,f.hs.propListView,f.hs.ruleListView).serialize();
    assert(saved.mapRules.includes('qFresh'));
    f.engine.restore(createMapScriptState()); assert.equal(f.system.rules.has('qIdentity'),false); assert.equal(f.system.rules.has('qFresh'),false);
});
test('content does not grant unearned primitive dependencies or replace occupied rules',()=>{
    const classical={id:'qClassical',statement:'⊢¬¬$1→$1',proof:'d .ne $1'};
    const f=fixture({rules:[classical]}); f.state.engine.rules=['qClassical'];
    assert.throws(()=>f.engine.validateState(f.state),/公理/); assert.equal(f.system.rules.has('a3'),false);
    f.state.rewards=['neg']; f.engine.restore(f.state); assert(f.system.rules.get('qClassical').step.length);
    const other=fixture({rules:[identity]}); other.hs.addRules('qIdentity:ax:⊢Q;');other.state.engine.rules=['qIdentity'];
    assert.throws(()=>other.engine.restore(other.state),/已被占用/);assert.equal(other.system.rules.get('qIdentity').toString(),'⊢Q');
    const same=fixture({rules:[identity]});same.hs.addRules('qIdentity:ax:⊢$1→$1;');same.state.engine.rules=['qIdentity'];
    assert.throws(()=>same.engine.restore(same.state),/已被占用/,'a matching formula cannot replace a checked theorem body');
});
test('custom notes, achievements and scripts are namespaced and logical changes require migration',()=>{
    const content=validateWorldContent({...empty(),rules:[identity],knowledge:[{id:'note',title:'Note',body:'Body'}],achievements:[{id:'badge',title:'Badge',description:'Body'}]});
    const world=parseWorld(manifest(content)), tiles=worldRuntimeTiles(world);
    const reward=[...tiles].find(([,tile])=>tile.name==='mod:content-world::reward')[1];
    assert.equal(reward.data.info,'mec:mod:content-world::note'); assert.equal(reward.data.ac,'mod:content-world::badge');
    assert.match(reward.data.script,/mec:mod:content-world::note/);assert.match(reward.data.script,/mod:content-world::badge/);
    const saved={world:worldSaveMeta(world),rw:[],dg:[]}, changed=structuredClone(world);
    changed.content.rules[0].proof='a1 $1 $1;a1 $1 ($1→$1);a2 $1 ($1→$1) $1;mp 3 2;mp 4 1';
    assert.throws(()=>migrateWorldSave(saved,changed),/Same revision/);
    const notes=structuredClone(world); notes.content.knowledge[0].body='new prose';
    assert.doesNotThrow(()=>migrateWorldSave(saved,notes));
});

test('author preflight rejects line-loader injection in a declared checked theorem',()=>{
    for (const newline of ['\n', '\r\n']) {
        const injected={id:'qInjected',statement:'⊢P',proof:`d .i $1${newline}qInjected:ax:⊢P;`};
        assert.throws(()=>checkWorldContent(validateWorldContent({rules:[injected]})));
        assert.throws(()=>checkWorldContent({...empty(),rules:[injected]}),'direct callers must also be checked');
    }
});

test('runtime rejects injected theorem without leaking axioms or changing the live proof',()=>{
    const f=fixture({rules:[]}); run(f.system,'d a1 P P');
    const before=f.system.props.at(-1).ast.toString();
    const injected={id:'qInjected',statement:'⊢P',proof:'d .i $1\nqInjected:ax:⊢P;'};
    const engine=createMapScriptEngine(f.hs,{},[{...empty(),rules:[injected]}]);
    f.state.engine.rules=['qInjected'];
    assert.throws(()=>engine.validateState(f.state)); assert.throws(()=>engine.restore(f.state));
    assert.equal(f.system.rules.has('qInjected'),false); assert.equal(f.system.rules.has('a3'),false);
    assert.equal(f.system.props.at(-1).ast.toString(),before);
});

test('ordinary multiline proofs replay every command and preserve the declared schema',()=>{
    for (const newline of ['\n','\r\n']) {
        const theorem={...identity,proof:`d .i $1${newline}d .i $1`};
        checkWorldContent(validateWorldContent({rules:[theorem]}));
        const f=fixture({rules:[theorem]}); f.state.engine.rules=['qIdentity']; f.engine.restore(f.state);
        assert.equal(f.system.rules.get('qIdentity').step.length,2);
        assert.equal(f.system.rules.get('qIdentity').toString(),'⊢$1→$1');
        run(f.system,'d qIdentity P'); assert.equal(f.system.props.at(-1).ast.toString(),'P→P');
    }
});

test('constant definitions are nullary functions and cannot make arbitrary variables equal to their body',()=>{
    const constant={id:'qConst',kind:'constant',symbol:'freshc',parameters:[],body:'0'};
    const call=new HSParser().parse('freshc()','item'); call.checkITEM();
    assert.equal(call.type,NodeType.FN); assert.equal(call.nodes.length,0);
    const content=validateWorldContent({definitions:[constant]}); checkWorldContent(content);
    const f=fixture(content,initialCreativeRules); f.state.engine.rules=['qConst']; f.engine.restore(f.state);
    const lhs=f.system.rules.get('qConst').conclusion.nodes[0];
    assert.equal(lhs.type,NodeType.FN); assert.equal(lhs.nodes.length,0);
    run(f.system,'d v:qConst freshc;d <a4 1 y');
    assert.equal(f.system.props.at(-1).ast.toString(),'freshc()=0');
    assert.throws(()=>run(f.system,'d v:qConst freshc()'),'a function cannot be a quantifier variable');
});

test('checked proof serialization preserves signed replacement arguments',()=>{
    for (const value of ['-2','+2','-2q','-2r']) {
        const theorem={id:'qSigned',statement:`⊢${value}=${value}`,proof:`d v:a7 x x;d <a4 1 (${value})`};
        const content=validateWorldContent({rules:[theorem]});
        checkWorldContent(content);
        const f=fixture(content,initialCreativeRules);f.state.engine.rules=['qSigned'];f.engine.restore(f.state);
        assert.equal(f.system.rules.get('qSigned').toString(),theorem.statement);
    }
});

test('ambiguous world rule IDs fail closed only when used and leave unrelated queries operational',()=>{
    const other={...identity,id:'qOther'}, dependent={...identity,id:'qDependent',proof:'d qIdentity $1'};
    const f=fixture([{rules:[identity,other,dependent]},{rules:[identity]}]);
    assert.equal(f.engine.query({kind:'rule-present',id:'a1'},f.state),true);
    f.engine.validate({op:'unlock-rule',id:'qOther'});
    assert.throws(()=>f.engine.validate({op:'unlock-rule',id:'qIdentity'}),/冲突/);
    assert.throws(()=>f.engine.query({kind:'rule-present',id:'qIdentity'},f.state),/冲突/);
    f.state.engine.rules=['qOther']; f.engine.restore(f.state);
    assert(f.system.rules.get('qOther').step.length);
    for (const id of ['qIdentity','qDependent']) {
        f.state.engine.rules=[id]; assert.throws(()=>f.engine.restore(f.state),/冲突/);
        assert.equal(f.system.rules.has('qIdentity'),false); assert.equal(f.system.rules.has('qDependent'),false);
        assert(f.system.rules.get('qOther').step.length,'failed restore preserves installed rules');
    }
});

test('explicit definitions accept closed binders and keep their domains outside the bound scope',()=>{
    const definitions=[
        {id:'qAll',kind:'predicate',symbol:'closedAll',parameters:[],body:'∀x:x=x'},
        {id:'qBounded',kind:'predicate',symbol:'closedBounded',parameters:[],body:'∀x∈0:x=x'},
        {id:'qSep',kind:'constant',symbol:'closedSep',parameters:[],body:'{x∈0|x=x}'},
        {id:'qRpl',kind:'constant',symbol:'closedRpl',parameters:[],body:'{S(x)|x∈0}'},
        {id:'qClass',kind:'constant',symbol:'closedClass',parameters:[],body:'{x|x=x}'},
        {id:'qNested',kind:'predicate',symbol:'closedNested',parameters:[],body:'∀x:∀y∈x:y=y'},
        {...fresh,body:'{x∈$x|x=x}'},
    ];
    for (const definition of definitions) {
        assert.doesNotThrow(()=>definitionLine(definition));
        const content=validateWorldContent({definitions:[definition]}); checkWorldContent(content);
        const f=fixture(content,initialCreativeRules); f.state.engine.rules=[definition.id]; f.engine.restore(f.state);
        assert.equal(f.system.rules.get(definition.id).toString(),definitionLine(definition).split(':ax:')[1]);
    }
    for (const [kind,body] of [
        ['predicate','∀x:x=y'], ['predicate','∀x∈x:x=x'],
        ['constant','{x∈x|x=x}'], ['constant','{S(x)|x∈x}'],
        ['constant','{S(y)|x∈0}'], ['constant','{x|x=y}'],
        ['predicate','(∀x:x=x)∧x=x'], ['predicate','P'],
    ]) assert.throws(()=>validateWorldContent({definitions:[{id:'qFree',kind,symbol:'freeBody',parameters:[],body}]}),/unbound/);
});
