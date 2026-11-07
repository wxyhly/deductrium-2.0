import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseMapScript, formatMapScript, rewriteMapScript, planMapScript, createMapScriptState} from '../js/hy/script.js';
import {createMapScriptEngine} from '../js/hy/script-engine.js';
import {HSLayer} from '../js/hs/main.js';
import {HilbertSystem} from '../js/hs/core/core.js';
import {HSParser} from '../js/hs/core/parser.js';
import {initialSurvivalRules, initialCreativeRules} from '../js/hs/core/initial.js';
import {intuitionisticRules} from '../js/hs/core/intuitionistic.js';
import {tileDisplayText} from '../js/hy/appearance.js';
import {worldSaveMeta, migrateWorldSave} from '../js/hy/world.js';
import {LangMgr} from '../js/lang.js';

const ipc = ['propositional', 'intuitionistic'];
function fixture(rules = initialSurvivalRules) {
    const hs = Object.create(HSLayer.prototype);
    hs.hilbertSystem = new HilbertSystem(); hs.ruleList = [];
    hs.ruleListView = {refresh(){}, idCounter:1}; hs.propListView = {refresh(){}};
    hs.addRules(rules);
    hs.sheetGui = {sheets:[{ctx:hs.hilbertSystem.saveContext()}], activeIndex:0,
        saveCurrentSheet(){this.sheets[0].ctx=hs.hilbertSystem.saveContext();}};
    const run = commands => hs.hilbertSystem.fromCmd(commands.split(';').filter(Boolean).map(command => new HSParser().parse(command, 'cmd')));
    return {hs, run, engine:createMapScriptEngine(hs, {})};
}

test('source allowlists parse, format, rewrite, and survive nested logical predicates', () => {
    const source = 'if (proof "$p→$p" using propositional intuitionistic and not flag failed) or rule "⊢$q→$q" using propositional\nrequire proof "$p→$p" using propositional intuitionistic\nend';
    const parsed = parseMapScript(source);
    const normalized = formatMapScript(parsed);
    assert.equal(formatMapScript(parseMapScript(normalized)), normalized);
    const rewritten = rewriteMapScript(source, id => 'mod:ipc::' + id);
    assert.match(rewritten, /using propositional intuitionistic/);
    assert.match(rewritten, /flag mod:ipc::failed/);
    assert.match(rewritten, /\$p→\$p/);
    for (const bad of [
        'require proof "$p" using', 'require proof "$p" using unknown',
        'require proof "$p" using propositional propositional',
        'require proof "$p" using "classical"', 'require type "True" using intuitionistic',
        'if proof "$p" using and flag ready\nallow\nend',
    ]) assert.throws(() => parseMapScript(bad), undefined, bad);
});

test('planner passes tags intact and validates unreachable branches', () => {
    const requests=[];
    const env={money:0,rewards:new Set(),hasTile:()=>true,hasAxiom:()=>true,
        engine:{validate:q=>requests.push(q),query:q=>q.allowedTags?.join(',')===ipc.join(',')}};
    assert.equal(planMapScript('require proof "$p→$p" using propositional intuitionistic',createMapScriptState(),env).status,'pass');
    assert.deepEqual(requests[0],{kind:'proof',text:'$p→$p',allowedTags:ipc});
    assert.throws(()=>planMapScript('if key missing\nrequire proof "$p" using unknown\nend',createMapScriptState(),env));
});

test('new IPC rules are opt-in and a3i has exactly the .a30 schema', () => {
    const {hs,engine}=fixture(initialCreativeRules);
    assert.equal(hs.hilbertSystem.rules.has('a3i'),false);
    const state=createMapScriptState({engine:{rules:['a3i','d/\\i']}});
    engine.validateState(state); engine.restore(state);
    assert.equal(hs.hilbertSystem.rules.get('a3i').step,undefined);
    assert.equal(hs.hilbertSystem.rules.get('a3i').toString(),hs.hilbertSystem.rules.get('.a30').toString());
    assert.equal(hs.hilbertSystem.rules.get('d/\\i').error,undefined);
    assert.equal(hs.hilbertSystem.rules.get('a3').error,undefined);
    assert.equal((intuitionisticRules.match(/:ax:/g)||[]).length,12);
});

test('symbolic IPC axiom names survive script unlocks and ordinary proof commands', () => {
    const {hs,run,engine}=fixture();
    const names=['a3i','d/\\i','d/\\i1','d/\\i2','d\\/i','d\\/i1','d\\/i2',
        'd~i','d~i1','d<>i','d<>i1','d<>i2'];
    const script=names.map(name=>'unlock rule '+name).join('\n');
    const normalized=formatMapScript(parseMapScript(script));
    const planned=planMapScript(normalized,createMapScriptState(),{
        money:0,rewards:new Set(),hasTile:()=>true,hasAxiom:()=>true,engine,
    });
    assert.equal(planned.status,'pass');
    engine.restore(planned.state);
    for (const name of names) {
        assert.equal(new HSParser().parse(name,'dname').toString(),name);
        const rule=hs.hilbertSystem.rules.get(name);
        assert.ok(rule,name);assert.equal(rule.error,undefined,name);
        const values=rule.replaceNames.map((_,index)=>['P','Q','R'][index]);
        run(name+' '+values.join(' '));
        assert.equal(hs.hilbertSystem.props.at(-1).from.data.deduction.toString(),name);
    }
});

test('tagged proof and rule queries reject classical/custom proofs and accept a separate IPC proof', () => {
    const {hs,run,engine}=fixture(initialCreativeRules+'\n'+intuitionisticRules);
    const state=createMapScriptState();
    run('d .a30 $p $q');
    const text=hs.hilbertSystem.props.at(-1).ast.toString();
    assert.equal(engine.query({kind:'proof',text},state),true);
    assert.equal(engine.query({kind:'proof',text,allowedTags:ipc},state),false);
    run('d a3i $p $q');
    assert.equal(engine.query({kind:'proof',text,allowedTags:ipc},state),true);
    hs.addRules('zFalse:ax:⊢$p;'); run('d zFalse $p');
    assert.equal(engine.query({kind:'proof',text:'$p',allowedTags:ipc},state),false);
    assert.equal(engine.query({kind:'rule',text:'⊢$p',allowedTags:ipc},state),false);
    assert.throws(()=>engine.validate({kind:'proof',text:'$p',allowedTags:[]}));
    assert.throws(()=>engine.validate({kind:'rule',text:'⊢$p',allowedTags:['unknown']}));
});

test('#pi/#di labels leave formulas intact and their goals participate in save compatibility', () => {
    LangMgr.lang = 'zh';
    for (const flag of ['pi','di']) {
        const text=flag==='pi'?'$p→$p':'⊢$p→$p';
        assert.equal(tileDisplayText({type:2,text,data:{[flag]:true}}),text+'\n#'+flag);
        const world={format:'deductrium-world-v1',id:'tagged',title:'Tagged',revision:1,mode:'standalone',
            spawn:{tileId:'start',rotation:0},banks:{},migrations:[],
            tiles:[{id:'start',hash:'',type:0,text:''},{id:'door',hash:'1',type:2,text,data:{[flag]:true}}]};
        const changed=structuredClone(world); changed.tiles[1].text=text+'→$q';
        assert.notDeepEqual(worldSaveMeta(world),worldSaveMeta(changed));
        assert.throws(()=>migrateWorldSave({world:worldSaveMeta(world)},changed),/changed|goal|revision/i);
    }
});
