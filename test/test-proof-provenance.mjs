// Run against the parent's compiled production modules.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ruleProvenance, stepProvenance, permitsProvenance, PROOF_TAGS} from '../js/hs/provenance.js';
import {HilbertSystem} from '../js/hs/core/core.js';
import {Deduction, Proposition} from '../js/hs/core/deduction.js';
import {AST} from '../js/hs/core/ast.js';
import {AtomSolver} from '../js/hs/core/assert.js';
import {HSParser} from '../js/hs/core/parser.js';
import {NodeType} from '../js/asttype.js';
import {initialCreativeRules, initialSurvivalRules} from '../js/hs/core/initial.js';
import {intuitionisticRules} from '../js/hs/core/intuitionistic.js';
import {HSLayer} from '../js/hs/main.js';
import {Serde} from '../js/hs/serde.js';
import {createMapScriptEngine} from '../js/hy/script-engine.js';
import {createMapScriptState} from '../js/hy/script.js';

const parser = new HSParser();
const ast = (text, kind = 'wff') => parser.parse(text, kind);
const name = text => ast(text, 'dname');
const run = (system, text) => system.fromCmd(text.split(';').filter(text => text.trim()).map(text => ast(text, 'cmd')));
function primitive(system, id, formula) {
    const parsed = ast(formula, 'rule');
    const assertions = parsed.nodes.filter(node => node.type === NodeType.ASSERT).map(node => AtomSolver.fromAST(node));
    const nodes = parsed.nodes.filter(node => node.type !== NodeType.ASSERT);
    const rule = new Deduction(new Set(), name(id), assertions, nodes.slice(0, -1), nodes.at(-1));
    system.rules.set(id, rule);
    return rule;
}
function fixture() {
    const system = new HilbertSystem();
    for (const line of `${initialCreativeRules}\n${intuitionisticRules}`.split('\n')) {
        const match = /^\s*([^:]+):ax:\s*([^;]+);/.exec(line);
        if (match) primitive(system, match[1], match[2]);
    }
    return system;
}
function builtin(system, id) {
    if (system.rules.has(id)) return system.rules.get(id);
    const line = initialCreativeRules.split('\n').map(line => line.trim()).find(line => line.startsWith(`${id}:`));
    assert.ok(line, `builtin ${id}`);
    const [formula, ...commands] = line.slice(id.length + 1).split(';');
    const rule = primitive(system, id, formula);
    // Replay only the dependencies actually named by this builtin's commands.
    for (const match of commands.join(';').matchAll(/\.[\w<>]+/g)) {
        if (match[0] !== id && !system.rules.has(match[0])) builtin(system, match[0]);
    }
    for (const assertion of rule.assertions) system.hyp(ast(AtomSolver.print(assertion)));
    for (const condition of rule.conditions) system.hyp(condition.clone());
    run(system, commands.join(';'));
    rule.step = system.props.slice();
    system.clear();
    return rule;
}
function layer(text = initialCreativeRules) {
    const hs = Object.create(HSLayer.prototype);
    hs.hilbertSystem = new HilbertSystem();
    hs.ruleList = [];
    hs.ruleListView = {refresh() {},expandedFolders:new Set(),idCounter:1};
    hs.propListView = {refresh() {},setData() {}};
    hs.refresh = () => {};
    hs.addRules(text);
    return hs;
}
const ids = value => {
    assert.equal(value.valid, true, value.error);
    return value.sources.map(source => source.id);
};
const tags = value => { ids(value); return value.tags; };

test('trusted primitives cover the shared tag directory and strict policies', () => {
    const system = fixture();
    for (const [id, tag] of Object.entries({mp:'propositional',a1:'propositional',a2:'propositional',a3:'classical',
        a3i:'intuitionistic','d/\\i':'intuitionistic',a4:'first-order',a6:'first-order',aext:'zfc',apn1:'peano',
        dN:'natural',dZ:'integer',dQ:'rational',dR:'real'})) {
        assert.deepEqual(tags(ruleProvenance(system, system.rules.get(id))), [tag], id);
    }
    const value = ruleProvenance(system, system.rules.get('a1'));
    assert.equal(permitsProvenance(value, ['propositional']), true);
    for (const allowed of [[], ['unknown'], ['propositional','propositional']]) assert.equal(permitsProvenance(value, allowed), false);
    assert.equal(permitsProvenance({...value,valid:false}, PROOF_TAGS.map(tag => tag.id)), false);
});

test('classification requires the canonical original ID and full primitive schema', () => {
    const system = fixture();
    const old = system.rules.get('a3');
    assert.deepEqual(tags(ruleProvenance(system, primitive(system, 'a3', '⊢$p'))), ['custom']);
    assert.deepEqual(tags(ruleProvenance(system, primitive(system, 'lookalike', old.toString()))), ['custom']);
    system.rules.set('a3', old);
    old.name = name('renamed');
    system.rules.delete('a3'); system.rules.set('renamed', old);
    system.renamedSysRule.set('a3', 'renamed');
    assert.deepEqual(ruleProvenance(system, old).sources, [{id:'a3',tag:'classical'}]);
    assert.deepEqual(tags(ruleProvenance(system, primitive(system, 'renamed', '⊢$p'))), ['custom']);
});

test('independent a3i and historical a30 retain different proof sources for the same formula', () => {
    const system = fixture();
    const classical = builtin(system, '.a30');
    assert.equal(classical.conclusion.equal(system.rules.get('a3i').conclusion), true);
    const constructive = ruleProvenance(system, system.rules.get('a3i'));
    assert.deepEqual(constructive.sources, [{id:'a3i',tag:'intuitionistic'}]);
    const original = ruleProvenance(system, classical);
    assert.ok(ids(original).includes('a3'));
    assert.ok(original.tags.includes('classical'));
    assert.equal(original.tags.includes('intuitionistic'), false);
});

test('recorded macros trace only the final conclusion and discard unused rows', () => {
    const system = fixture();
    run(system, 'a3 A B;a1 A B;m safe;safe;m outer');
    assert.deepEqual(ids(ruleProvenance(system, system.rules.get('safe'))), ['a1']);
    assert.deepEqual(ids(ruleProvenance(system, system.rules.get('outer'))), ['a1']);
    const safe = system.rules.get('safe');
    safe.step[0].from.data.deduction = name('unavailable');
    assert.deepEqual(ids(ruleProvenance(system, safe)), ['a1']);
});

test('only formal premises used by the final macro chain propagate external sources', () => {
    const system = fixture();
    // Build a valid macro with two unused formal premises and a standalone conclusion.
    run(system, 'hyp $1;hyp $2;a1 C D;m ignores;a3 E F;a1 G H;ignores 1 2;m result');
    assert.deepEqual(ids(ruleProvenance(system, system.rules.get('result'))), ['a1']);
});

test('the same proposition proved by a custom axiom or builtin keeps its actual source', () => {
    const system = fixture();
    primitive(system, 'localAx', '⊢A→B→A');
    run(system, 'localAx;a1 A B');
    assert.deepEqual(tags(stepProvenance(system, system.props[0])), ['custom']);
    assert.deepEqual(tags(stepProvenance(system, system.props[1])), ['propositional']);
});

test('generated prefixes and cached generated proofs include hidden dependencies', () => {
    const system = fixture();
    for (const text of ['<a3','ca3','va3','ea3','u<a3','>mp','c<a1']) {
        const rule = system.getD(name(text));
        const value = ruleProvenance(system, rule);
        ids(value);
        if (text.includes('a3')) assert.ok(value.tags.includes('classical'), text);
        if (/^[vue]/.test(text)) assert.ok(value.tags.includes('first-order'), text);
    }
    assert.ok(ids(ruleProvenance(system, system.getD(name('cmp')))).includes('a2'));
    assert.ok(ids(ruleProvenance(system, system.getD(name('vmp')))).includes('a5'));
    assert.ok(ids(ruleProvenance(system, system.getD(name('u<a3')))).includes('a6'));
});

test('composition traces only used function arguments and preserves external premise offsets', () => {
    const system = fixture();
    run(system, 'hyp $1;hyp $2;a1 $3 $4;m ignore');
    const rule = system.getD(name('ignore(a3,#)'), false);
    assert.deepEqual(ids(ruleProvenance(system, rule)), ['a1']);
});

test('fixed meta summaries never generate expanded proofs', () => {
    const system = fixture();
    const cases = ['ca3','<a3','>mp','va3','vmp','u<a3','ea3','mp(a1,#)'];
    const rules = cases.map(text => system.getD(name(text), false));
    const getD = HilbertSystem.prototype.getD;
    HilbertSystem.prototype.getD = function(ast, withProof = true, work) {
        if (ast.type === NodeType.NODE_DNAME && withProof) throw Error('Unexpected meta proof expansion');
        return getD.call(this, ast, withProof, work);
    };
    try {
        for (const rule of rules) ids(ruleProvenance(system, rule));
    } finally { HilbertSystem.prototype.getD = getD; }
});

test('universal generalization includes the quantified child construction', () => {
    const system = fixture();
    assert.deepEqual(ids(ruleProvenance(system, system.getD(name('ump'), false))), ['a5','a6','mp']);
    primitive(system, 'a5', '⊢A→B');
    const rejected = ruleProvenance(system, system.getD(name('ump'), false));
    assert.equal(rejected.valid, false);
    assert.match(rejected.error, /Invalid meta rule dependency: a5/);
    assert.deepEqual(rejected.sources, []);
    const custom = fixture();
    custom.rules.set('a5', primitive(custom, 'localDistribution', '⊢∀$x:($1→$2)→(∀$x:$1→∀$x:$2)'));
    const accepted = ruleProvenance(custom, custom.getD(name('ump'), false));
    assert.deepEqual(ids(accepted), ['a6','localDistribution','mp']);
    assert.deepEqual(accepted.tags, ['propositional','first-order','custom']);
});

test('inverse deduction and discharge preserve only the used premise indices', () => {
    const system = fixture();
    run(system, 'hyp $1;hyp $2;a1 $1 $3;mp 3 1;m keepArrow');
    primitive(system, 'localUnused', '⊢Q');
    primitive(system, 'localUsed', '⊢R');
    run(system, 'a3 A B;localUnused;localUsed;<keepArrow 1 2 3');
    const inverse = ids(stepProvenance(system, system.getP('4')));
    assert.ok(inverse.includes('a3'));
    assert.ok(inverse.includes('localUsed'), 'the new antecedent is a used premise');
    assert.equal(inverse.includes('localUnused'), false);
    run(system, '>keepArrow 1');
    assert.equal(ids(stepProvenance(system, system.getP('5'))).includes('localUnused'), false);
    const combined = system.getD(name('<keepArrow(a3,localUnused,localUsed)'), false);
    assert.deepEqual(ids(ruleProvenance(system, combined)), inverse);
});

test('discharged conditions and variable scopes do not include unrelated siblings', () => {
    const system = fixture();
    run(system, 'cond A;a3 B C;a1 D E');
    const folder = system.props[0];
    assert.ok(ids(stepProvenance(system, folder)).includes('a1'));
    assert.equal(ids(stepProvenance(system, folder)).includes('a3'), false);
    assert.ok(ids(stepProvenance(system, folder.children[0])).includes('a3'));
    system.clear();
    run(system, 'var x;a1 A B');
    assert.ok(tags(stepProvenance(system, system.props[0])).includes('first-order'));
});

test('nested extensionality scopes retain actual sources within the proof work budget', () => {
    const system = layer().hilbertSystem;
    // Explicitly record the iff elimination rule used by the reported command chain.
    run(system, 'hyp $1↔$2;<.<>1 1;m l');
    run(system, String.raw`var x;var y;cond x⊂y;cond y⊂x;aext;<a4 5 x;<a4 6 y;<:l(d\c) 3 z;<:l(d\c) 4 z;var z;<a4 8 z;<a4 9 z;.<> 11 12;cd 4;mp 7 13`);
    const context = system.saveContext(), commands = system.genCmd().join(';');
    const expected = ['a1','a2','a3','a4','d<>1','d\\c','mp'];
    for (const id of ['8','9','11','12']) assert.deepEqual(ids(stepProvenance(system, system.getP(id))), expected, id);
    const iff = stepProvenance(system, system.getP('13'));
    assert.deepEqual(ids(iff), [...expected.slice(0,5), 'd<>2', ...expected.slice(5)]);
    const conclusion = stepProvenance(system, system.getP('14'));
    assert.deepEqual(ids(conclusion), ['a1','a2','a3','a4','aext','d<>1','d<>2','d\\c','mp','v']);
    assert.deepEqual(conclusion.tags, ['propositional','classical','first-order','zfc']);
    assert.equal(permitsProvenance(conclusion, ['propositional','classical','first-order']), false);
    assert.equal(system.saveContext().props, context.props);
    assert.equal(system.genCmd().join(';'), commands);
    assert.deepEqual(ruleProvenance(system, system.m('qExtensionality')), conclusion);
});

test('a recorded extensionality theorem remains verifiable inside a second conditional macro', () => {
    const hs = layer(), system = hs.hilbertSystem;
    run(system, String.raw`hyp $1↔$2;<.<>1 1;m l;var x;var y;cond x⊂y;cond y⊂x;aext;<a4 5 x;<a4 6 y;<:l(d\c) 3 z;<:l(d\c) 4 z;var z;<a4 8 z;<a4 9 z;.<> 11 12;cd 4;mp 7 13;m saext2`);
    const original = ruleProvenance(system, system.rules.get('saext2'));
    ids(original);
    const commands = String.raw`cond $x⊂$y∧$y⊂$x;./\1 1;./\2 1;saext2;.\acn 4 #x;v.\acn 5 #y;<a4 6 $x;<a4 7 $y;mp 8 2;mp 9 3`;
    for (const command of commands.split(';')) {
        run(system, command);
        ids(stepProvenance(system, system.getLastChildP(null)));
        if (command === 'saext2') assert.deepEqual(stepProvenance(system, system.getP('4')), original);
    }
    const before = stepProvenance(system, system.getP('10'));
    assert.deepEqual(before.tags, ['propositional','classical','first-order','zfc']);
    for (const id of ids(original)) assert.ok(ids(before).includes(id), id);
    assert.equal(permitsProvenance(before, ['propositional','classical','first-order']), false);
    const recorded = system.m('sNew'), recordedCommands = system.genCmd(recorded.step);
    assert.deepEqual(ruleProvenance(system, recorded), before);
    run(system, 'sNew x y');
    const context = system.saveContext(), liveCommands = system.genCmd();
    assert.deepEqual(stepProvenance(system, system.getP('1')), before);
    assert.deepEqual(ruleProvenance(system, recorded), before);
    assert.equal(system.saveContext().props, context.props);
    assert.deepEqual(system.genCmd(), liveCommands);
    assert.deepEqual(system.genCmd(recorded.step), recordedCommands);
    hs.ruleList.push(...['l','saext2','sNew'].map((name,index) => ({name,uuid:1500+index})));
    const saved = new Serde(hs, system, hs.ruleList, hs.propListView, hs.ruleListView).serializeRulelist();
    const restored = layer('');
    new Serde(restored, restored.hilbertSystem, restored.ruleList, restored.propListView, restored.ruleListView).deserializeRulelist(saved);
    assert.deepEqual(ruleProvenance(restored.hilbertSystem, restored.hilbertSystem.rules.get('sNew')), before);
});

test('conditional theorem reuse checks the weakening schema and custom sources', () => {
    const broken = layer().hilbertSystem;
    run(broken, 'aext;m theorem;cond P;theorem');
    primitive(broken, 'a1', '⊢A→B');
    const rejected = stepProvenance(broken, broken.getP('2'));
    assert.equal(rejected.valid, false);
    assert.deepEqual(rejected.sources, []);
    assert.equal(permitsProvenance(rejected, PROOF_TAGS.map(tag => tag.id)), false);

    const custom = layer().hilbertSystem;
    run(custom, 'aext;m theorem;cond P;theorem');
    custom.rules.set('a1', primitive(custom, 'localWeakening', '⊢$1→$2→$1'));
    const accepted = stepProvenance(custom, custom.getP('2'));
    assert.deepEqual(ids(accepted), ['aext','localWeakening','mp']);
    assert.deepEqual(accepted.tags, ['propositional','zfc','custom']);
});

test('scoped proof reuse ignores unused premises and rechecks changed implicit rules', () => {
    const system = fixture();
    run(system, 'hyp $1;hyp $2;a1 C D;m qIgnore');
    const unused = primitive(system, 'localUnused', '⊢E');
    run(system, 'localUnused;localUnused;cond A;var x;qIgnore 1 2');
    const step = system.getP('5'), before = stepProvenance(system, step);
    assert.equal(ids(before).includes('localUnused'), false);
    assert.equal(before.tags.includes('custom'), false);
    unused.error = {cause:'unreachable'};
    assert.deepEqual(stepProvenance(system, step), before);
    system.rules.get('a1').error = {cause:'changed implicit dependency'};
    const changed = stepProvenance(system, step);
    assert.equal(changed.valid, false);
    assert.deepEqual(changed.sources, []);
    assert.equal(permitsProvenance(changed, PROOF_TAGS.map(tag => tag.id)), false);
});

test('reused proof generation retains the dependency depth boundary', () => {
    const system = fixture();
    run(system, 'a1 A B;m q0');
    for (let index = 1; index <= 40; index++) run(system, `q${index - 1};m q${index}`);
    assert.deepEqual(ids(ruleProvenance(system, system.rules.get('q5'))), ['a1']);
    const value = ruleProvenance(system, system.rules.get('q40'));
    assert.equal(value.valid, false);
    assert.match(value.error, /Proof provenance exceeds dependency depth/);
    assert.deepEqual(value.sources, []);
});

test('mcpt remains classical both directly and inside recorded macros', () => {
    const system = fixture();
    run(system, 'mcpt A→A');
    assert.deepEqual(ruleProvenance(system, system.m('tautology')).sources, [{id:'mcpt',tag:'classical'}]);
    run(system, 'tautology');
    assert.deepEqual(tags(stepProvenance(system, system.props[0])), ['classical']);
});

test('unknown and cyclic proof graphs fail closed with empty results', () => {
    const system = fixture();
    run(system, 'a1 A B;m loop');
    const loop = system.rules.get('loop');
    loop.step[0].from.data.deduction = name('loop');
    const value = ruleProvenance(system, loop);
    assert.equal(value.valid, false);
    assert.deepEqual(value.sources, []);
    assert.equal(permitsProvenance(value, PROOF_TAGS.map(tag => tag.id)), false);
    loop.step[0].from.data.deduction = name('missing');
    assert.equal(ruleProvenance(system, loop).valid, false);
    const cyclic = Proposition.mkdir('f', ast('X'));
    cyclic.children.push(cyclic);
    assert.equal(stepProvenance(system, cyclic).valid, false);
});

test('analysis never mutates live rules, contexts, aliases or proof ASTs', () => {
    const system = fixture();
    run(system, 'cond A;a1 B C');
    const rules = [...system.rules], aliases = [...system.renamedSysRule], context = system.saveContext();
    const text = system.props[0].children[0].ast.toString();
    const first = stepProvenance(system, system.props[0]);
    assert.deepEqual(stepProvenance(system, system.props[0]), first);
    assert.deepEqual([...system.rules], rules);
    assert.deepEqual([...system.renamedSysRule], aliases);
    assert.equal(system.saveContext().props, context.props);
    assert.equal(system.props[0].children[0].ast.toString(), text);
});

test('fresh analyses see edits and renames instead of retaining stale provenance', () => {
    const system = fixture();
    run(system, 'a1 A B;m recorded');
    const rule = system.rules.get('recorded');
    assert.deepEqual(ids(ruleProvenance(system, rule)), ['a1']);
    rule.step[0].from.data.deduction = name('a3');
    rule.conclusion = ast('(¬A→¬B)→(B→A)');
    rule.step[0].ast = rule.conclusion;
    assert.ok(ids(ruleProvenance(system, rule)).includes('a3'));
});

test('real serde replay and original aliases preserve classical, IPC and custom sources', () => {
    const selected = new Set(['mp','a1','a2','a3','.t','.ne','.ni','.a30']);
    const text = initialCreativeRules.split('\n').filter(line => selected.has(line.trim().split(':')[0])).join('\n');
    const first = layer(`${text}\n${intuitionisticRules}\nlocalAx:ax:⊢A;`);
    const system = first.hilbertSystem;
    system.renameD('.a30', 'legacy');
    run(system, 'a3i A B;m independent;legacy A B;m historical;localAx;m localProof');
    const add = ['independent','historical','localProof'];
    // UI rule names are updated by the rename action, outside the core command.
    const visit = list => list.forEach(row => row.children ? visit(row.children) : row.name === '.a30' && (row.name = 'legacy'));
    visit(first.ruleList);
    first.ruleList.push(...add.map((name,index) => ({name,uuid:1000+index})));
    const serde = new Serde(first, system, first.ruleList, first.propListView, first.ruleListView);
    const saved = serde.serializeRulelist(), aliases = [...system.renamedSysRule];
    const restored = layer('');
    restored.hilbertSystem.renamedSysRule = new Map(aliases);
    new Serde(restored, restored.hilbertSystem, restored.ruleList, restored.propListView, restored.ruleListView).deserializeRulelist(saved);
    for (const id of [...add, 'a3','a3i','legacy']) {
        const before = ruleProvenance(system, system.rules.get(id));
        const after = ruleProvenance(restored.hilbertSystem, restored.hilbertSystem.rules.get(id));
        assert.equal(before.valid, true, `${id} before: ${before.error}`);
        assert.equal(after.valid, true, `${id} after: ${after.error}; ${JSON.stringify(restored.hilbertSystem.rules.get(id)?.error)}`);
        assert.deepEqual(after, before, id);
    }
});

test('full serde restores map dependencies before replaying recorded user macros', () => {
    const setup = () => {
        const hs = layer(initialSurvivalRules);
        hs.sheetGui = {
            activeIndex:0, sheets:[{name:'Proof',pe:[],ctx:hs.hilbertSystem.saveContext()}],
            saveCurrentSheet() { this.sheets[this.activeIndex].ctx = hs.hilbertSystem.saveContext(); },
            restoreExpanded() {}, render() {},
        };
        const serde = new Serde(hs,hs.hilbertSystem,hs.ruleList,hs.propListView,hs.ruleListView);
        return {hs,serde,engine:createMapScriptEngine(hs,{})};
    };
    const first = setup(), state = createMapScriptState();
    state.engine.rules = ['a3i','d/\\i','.i','a3'];
    first.engine.restore(state);
    run(first.hs.hilbertSystem,'hyp P;hyp Q;d/\\i P Q;mp 3 1;mp 4 2;m qPair;.i ¬P;a3 P P;mp 2 1;m qClassical');
    first.hs.ruleList.push({name:'qPair',uuid:1201},{name:'qClassical',uuid:1202});
    // Older reward commits moved map rules after user macros. Preserve that saved
    // ordering explicitly now that repeated commits retain each row's position.
    first.engine.restore(state);
    const owned = new Set(first.hs.getMapScriptRuleNames());
    const tail = first.hs.ruleList.filter(row => !row.children && owned.has(row.name));
    const rest = first.hs.ruleList.filter(row => row.children || !owned.has(row.name));
    first.hs.ruleList.splice(0, first.hs.ruleList.length, ...rest, ...tail);
    const saved = first.serde.serialize(), expectedRows = structuredClone(first.hs.ruleList);
    assert.ok(saved.r.indexOf('qPair:') < saved.r.indexOf('d/\\i:'));
    assert.ok(saved.r.indexOf('qClassical:') < saved.r.indexOf('.i:'));
    assert.match(saved.r,/mp:ax:\./);
    const before = ['qPair','qClassical'].map(id => ruleProvenance(first.hs.hilbertSystem,first.hs.hilbertSystem.rules.get(id)));
    before.forEach(value => assert.equal(value.valid,true,value.error));
    const second = setup();
    second.serde.deserialize(saved);
    // This must work before Game.restoreMapScript has an opportunity to run.
    for (const [index,id] of ['qPair','qClassical'].entries()) {
        const restored = second.hs.hilbertSystem.rules.get(id);
        assert.equal(restored.error,undefined,`${id}: ${JSON.stringify(restored.error)}`);
        assert.deepEqual(ruleProvenance(second.hs.hilbertSystem,restored),before[index]);
    }
    assert.deepEqual(second.hs.ruleList,expectedRows,'folder positions, UUIDs and order survive');
    assert.deepEqual(second.hs.getMapScriptRuleNames(),saved.mapRules);
    assert.equal(second.hs.hilbertSystem.genCmd().join(';'),first.hs.hilbertSystem.genCmd().join(';'));
    second.engine.restore(state);
    assert.equal(ruleProvenance(second.hs.hilbertSystem,second.hs.hilbertSystem.rules.get('qPair')).valid,true);
    second.engine.restore(createMapScriptState());
    assert.equal(second.hs.hilbertSystem.rules.has('d/\\i'),false,'restored ownership supports removal');
});

test('map dependency preload resolves genuine forward references and preserves failed proofs', () => {
    const hs = layer('');
    const serde = new Serde(hs,hs.hilbertSystem,hs.ruleList,hs.propListView,hs.ruleListView);
    serde.deserializeRulelist('qForward:⊢P;qLater;\nqBroken:⊢P;notThere;\nqLater:ax:⊢P;\nqUsesBad:⊢P;qMapBad;\nqMapBad:⊢P;notThere;\nqMap:ax:⊢Q;', ['qMap','qMapBad']);
    assert.equal(hs.hilbertSystem.rules.get('qForward').error, undefined);
    assert.equal(ruleProvenance(hs.hilbertSystem,hs.hilbertSystem.rules.get('qForward')).valid, true);
    for (const id of ['qBroken','qUsesBad','qMapBad']) {
        assert.ok(hs.hilbertSystem.rules.get(id).error,id);
        assert.equal(ruleProvenance(hs.hilbertSystem,hs.hilbertSystem.rules.get(id)).valid,false);
    }
});

test('creative builtin placeholder restoration remains unchanged without map ownership', () => {
    const first = layer();
    const saved = new Serde(first,first.hilbertSystem,first.ruleList,first.propListView,first.ruleListView).serializeRulelist();
    assert.match(saved,/mp:ax:\./);
    assert.match(saved,/a3:ax:\./);
    const second = layer('');
    new Serde(second,second.hilbertSystem,second.ruleList,second.propListView,second.ruleListView).deserializeRulelist(saved);
    assert.deepEqual(second.ruleList,first.ruleList);
    for (const row of first.hilbertSystem.rules.values()) {
        if (row.error) continue;
        const restored = second.hilbertSystem.rules.get(row.name.name);
        // Generated cache entries have no serialized rule-list row.
        if (!restored) continue;
        assert.equal(restored.error,undefined,row.name.name);
        assert.equal(restored.toString(),row.toString(),row.name.name);
    }
});

test('msbt named, proof and mcpt templates preserve actual sources and external premises', () => {
    const hs = layer(), system = hs.hilbertSystem;
    primitive(system, 'localIff', '⊢$p↔¬¬$p');
    for (const command of ['msbt>(mcpt) ($↔¬¬$) (A→A) 0', 'msbt>(localIff) (A→A) 0']) {
        system.clear(); run(system, command);
        const value = stepProvenance(system, system.props.at(-1));
        ids(value);
        if (command.includes('mcpt')) assert.ok(value.tags.includes('classical'));
        else assert.ok(ids(value).includes('localIff'));
        const recorded = system.m('subIff');
        assert.deepEqual(ruleProvenance(system, recorded), value);
        run(system, 'subIff');
        assert.deepEqual(stepProvenance(system, system.props.at(-1)), value);
        system.rules.delete('subIff');
    }
    system.clear();
    primitive(system, 'localEq', '⊢x=y');
    run(system, 'localEq;hyp x=x;msbt> 1 2 0');
    const value = stepProvenance(system, system.props.at(-1));
    assert.ok(ids(value).includes('localEq'));
    assert.ok(value.tags.includes('first-order'));
    system.m('substituted');
    assert.ok(ids(ruleProvenance(system, system.rules.get('substituted'))).includes('localEq'));
});

test('mcnt unfolds the quantifier renaming proof and keeps sources of a step target', () => {
    const hs = layer(), system = hs.hilbertSystem;
    run(system, 'mcnt ∀x:x=y {z}');
    const value = stepProvenance(system, system.props.at(-1));
    assert.ok(tags(value).includes('first-order'));
    assert.deepEqual(ruleProvenance(system, system.m('renaming')), value);
    run(system, 'renaming');
    assert.deepEqual(stepProvenance(system, system.props.at(-1)), value);
    system.clear();
    primitive(system, 'localQuant', '⊢∀x:x=y');
    run(system, 'localQuant;mcnt 1 {z}');
    const derived = stepProvenance(system, system.props.at(-1));
    assert.ok(ids(derived).includes('localQuant'));
    assert.ok(derived.tags.includes('first-order'));
    assert.deepEqual(ruleProvenance(system, system.m('renamedTarget')), derived);
    run(system, 'renamedTarget');
    assert.deepEqual(stepProvenance(system, system.props.at(-1)), derived);
});

test('oversized formulas, cyclic scopes and cyclic unification fail closed within budget', () => {
    const system = fixture();
    let formula = ast('A');
    for (let index = 0; index < 70; index++) formula = new AST(NodeType.LOGIC, '>', ast('A'), formula);
    const rule = new Deduction(new Set(), name('large'), [], [], formula);
    assert.equal(ruleProvenance(system, rule).valid, false);
    run(system, 'a1 A B');
    const step = system.props[0]; step.parent = step;
    assert.equal(stepProvenance(system, step).valid, false);
    const cyclic = Object.assign(Object.create(Deduction.prototype), system.rules.get('a1'), {name:name('a1(a1)')});
    assert.equal(ruleProvenance(system, cyclic).valid, false);
    system.clear();
    builtin(system, '.i');
    run(system, 'hyp $1→$1;.i $1→$1;mp 2 1;m zF;a1 $1 $1;m zG');
    const combination = Object.assign(Object.create(Deduction.prototype), system.rules.get('zF'), {name:name('zF(zG)')});
    const combinationResult = ruleProvenance(system, combination);
    assert.equal(combinationResult.valid, false);
    assert.deepEqual(combinationResult.sources, []);
    const largeProof = Object.assign(Object.create(Deduction.prototype), system.rules.get('zG'), {
        step:[...Array.from({length:40000}, () => Proposition.hyp(ast('A'))), ...system.rules.get('zG').step],
    });
    const exhausted = ruleProvenance(system, largeProof);
    assert.equal(exhausted.valid, false);
    assert.match(exhausted.error, /预算/);
    assert.deepEqual(exhausted.sources, []);
    const folder = Proposition.mkdir('v', ast('x'));
    folder.children.push(folder);
    const recursive = new Deduction(new Set(), name('recursive'), [], [], ast('A'), [folder]);
    system.rules.set('recursive', recursive);
    const generatedCycle = Object.assign(Object.create(Deduction.prototype), recursive, {name:name('vrecursive')});
    assert.equal(ruleProvenance(system, generatedCycle).valid, false);
});

test('tautology verification rejects false or exponential claims within the same work budget', () => {
    const system = fixture();
    const claimed = formula => new Proposition(formula, {type:'d', data:{deduction:name('mcpt'),conditions:[],replaceValues:{$:formula}}});
    assert.equal(stepProvenance(system, claimed(ast('A'))).valid, false);
    let conjunction = ast('P0');
    for (let index = 1; index < 15; index++) conjunction = new AST(NodeType.LOGIC, '/\\', conjunction, ast(`P${index}`));
    const value = stepProvenance(system, claimed(new AST(NodeType.LOGIC, '>', conjunction, conjunction)));
    assert.equal(value.valid, false);
    assert.match(value.error, /预算/);
});
