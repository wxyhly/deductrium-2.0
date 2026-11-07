// Run after the parent build: node --test test/test-map-axiom-policy.mjs.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MapAxiomPolicy} from '../js/hs/map-policy.js';
import {HilbertSystem} from '../js/hs/core/core.js';
import {Deduction, Proposition} from '../js/hs/core/deduction.js';
import {AST} from '../js/hs/core/ast.js';
import {NodeType} from '../js/asttype.js';
import {AtomSolver} from '../js/hs/core/assert.js';
import {HSParser} from '../js/hs/core/parser.js';
import {HSLayer} from '../js/hs/main.js';
import {getCommand} from '../js/hs/gui/cmdmgr.js';
import {initialCreativeRules} from '../js/hs/core/initial.js';

const parser = new HSParser();
const ast = (text, kind = 'wff') => parser.parse(text, kind);
const name = text => ast(text, 'dname');
const run = (system, text) => system.fromCmd(text.split(';').filter(Boolean).map(text => ast(text, 'cmd')));
function fixture() {
    const system = new HilbertSystem();
    for (const [id, formula] of Object.entries({
        mp:'$1→$2,$1⊢$2', a1:'⊢$1→$2→$1',
        a2:'⊢($1→$2→$3)→($1→$2)→($1→$3)', a3:'⊢(¬$1→¬$2)→($2→$1)',
        a4:'⊢∀$x:$→#sb($,$x,$A)', a5:'⊢∀$x:($1→$2)→∀$x:$1→∀$x:$2',
        a6:'#nf($,$x)⊢$→∀$x:$',
    })) {
        const parsed = ast(formula, 'rule');
        const assertions = parsed.nodes.filter(node => node.type === NodeType.ASSERT).map(node => AtomSolver.fromAST(node));
        const nodes = parsed.nodes.filter(node => node.type !== NodeType.ASSERT);
        const conclusion = nodes.pop();
        system.rules.set(id, new Deduction(new Set(), new AST(NodeType.ATOM_DNAME, id), assertions, nodes, conclusion));
    }
    return system;
}

function builtin(system, id) {
    const source = initialCreativeRules.split('\n').map(line => line.trim()).find(line => line.startsWith(`${id}:`));
    const [formula, ...commands] = source.slice(id.length + 1).split(';');
    const parsed = ast(formula, 'rule');
    const rule = new Deduction(new Set(), name(id), [], parsed.nodes.slice(0, -1), parsed.nodes.at(-1));
    system.rules.set(id, rule);
    for (const condition of rule.conditions) system.hyp(condition.clone());
    run(system, commands.join(';'));
    rule.step = system.props.slice();
    system.clear();
    return rule;
}

test('disabled roots and renamed aliases are denied, unrelated roots remain usable', () => {
    const system = fixture(), disabled = new Set(['a3']);
    const policy = new MapAxiomPolicy(system, disabled);
    assert.throws(() => policy.checkName(name('a3')), Error);
    assert.equal(policy.allowsRule(system.getD(name('a3'))), false);
    assert.doesNotThrow(() => policy.checkName(name('a1')));
    const a3 = system.rules.get('a3');
    system.rules.delete('a3');
    a3.name = name('legacy');
    system.rules.set('legacy', a3);
    system.renamedSysRule.set('a3', 'legacy');
    assert.throws(() => policy.checkName(name('legacy')), Error);
    disabled.clear();
    assert.doesNotThrow(() => policy.checkName(name('legacy')));
    assert.equal(policy.allowsRule(a3), true);
});

test('prefixes, combinations, cached rules and nested recorded macros retain dependencies', () => {
    const system = fixture();
    run(system, 'a3 A B;m inner;inner;m outer');
    run(system, 'a1 A B;m safe');
    const derived = ['<a3', 'ca3', 'va3', 'ea3', 'mp(a3,#)', 'couter'];
    const cached = derived.map(text => system.getD(name(text)));
    const policy = new MapAxiomPolicy(system, new Set(['a3']));
    for (const text of [...derived, 'inner', 'outer']) assert.throws(() => policy.checkName(name(text)), Error, text);
    for (const rule of cached) assert.equal(policy.allowsRule(rule), false, rule.name.toString());
    assert.equal(policy.allowsRule(system.getD(name('safe'))), true);
    assert.doesNotThrow(() => policy.checkName(name('ca1')));
    const enabled = new MapAxiomPolicy(system, new Set());
    for (const rule of cached) assert.equal(enabled.allowsRule(rule), true);
});

test('existing proofs follow condition references without inspecting unrelated siblings', () => {
    const system = fixture();
    run(system, 'a3 A B;a1 A B;<a1 1 C;<a1 2 C');
    const policy = new MapAxiomPolicy(system, new Set(['a3']));
    for (const id of ['1', '3']) assert.equal(policy.allowsStep(system.getP(id)), false, id);
    for (const id of ['2', '4']) assert.equal(policy.allowsStep(system.getP(id)), true, id);
    run(system, 'm recorded;recorded');
    assert.equal(policy.allowsStep(system.getP('1')), false);
    assert.equal(new MapAxiomPolicy(system, new Set()).allowsStep(system.getP('1')), true);
});

test('builtins are checked through their actual proofs rather than their empty dependence sets', () => {
    const system = fixture();
    const identity = builtin(system, '.i');
    const classical = builtin(system, '.ne');
    const policy = new MapAxiomPolicy(system, new Set(['a3']));
    assert.equal(identity.dependence.size, 0);
    assert.equal(classical.dependence.size, 0);
    assert.equal(policy.allowsRule(identity), true);
    assert.equal(policy.allowsRule(classical), false);
    assert.doesNotThrow(() => policy.checkName(name('v.i')));
    assert.throws(() => policy.checkName(name('v.ne')), Error);
});

test('actual transform proofs include only the implicit axioms they use, including preview caches', () => {
    const system = fixture();
    for (const [disabled, denied, allowed] of [
        ['mp', '<a1', 'a1'], ['a1', 'ca3', 'a3'], ['a2', 'cmp', 'mp'],
        ['a5', 'vmp', 'va1'], ['a4', 'v<a1', 'vmp'], ['a6', 'ump', 'vmp'],
    ]) {
        const preview = system.getD(name(denied), false);
        assert.equal(preview.step, undefined);
        const policy = new MapAxiomPolicy(system, new Set([disabled]));
        assert.throws(() => policy.checkName(name(denied)), Error, `${disabled}: ${denied}`);
        assert.equal(policy.allowsRule(preview), false, `${disabled}: cached ${denied}`);
        assert.doesNotThrow(() => policy.checkName(name(allowed)), `${disabled}: ${allowed}`);
    }
});

test('captured conditional and variable scopes are checked without following sibling proofs', () => {
    const system = fixture();
    run(system, 'cond A;a3 X Y;a1 A B;mp 3 1;pop;var x;a1 A B;pop');
    const dependent = system.getP('4'), independent = system.getP('3'), quantified = system.getP('6');
    const classical = new MapAxiomPolicy(system, new Set(['a3']));
    assert.equal(classical.allowsStep(dependent), true);
    assert.equal(classical.allowsStep(independent), true);
    assert.equal(classical.allowsStep(quantified), true);
    assert.equal(new MapAxiomPolicy(system, new Set(['a2'])).allowsStep(dependent), false);
    assert.equal(new MapAxiomPolicy(system, new Set(['a2'])).allowsStep(independent), true);
    run(system, 'm scoped');
    assert.equal(classical.allowsRule(system.getD(name('scoped'))), false);
});

test('checks preserve the live context, existing rule proofs and all cache entries', () => {
    const system = fixture();
    builtin(system, '.i'); builtin(system, '.t');
    run(system, 'dir workspace;cond A;.i A');
    const context = system.saveContext(), commands = system.genCmd();
    const map = system.rules, entries = [...map];
    const proofs = entries.map(([, rule]) => ({rule, step:rule.step, commands:rule.step && system.genCmd(rule.step), formula:rule.toString()}));
    const policy = new MapAxiomPolicy(system, new Set(['a3']));
    for (const text of ['ca1', 'cmp', '>mp', 'vmp', 'ump', 'v.i', 'v.t', 'c.t', 'e.i', 'mp(a1,#)']) {
        assert.doesNotThrow(() => policy.checkName(name(text)), text);
    }
    assert.equal(policy.allowsStep(system.getP('3')), true);
    const after = system.saveContext();
    for (const key of Object.keys(context)) assert.strictEqual(after[key], context[key], key);
    assert.deepEqual(system.genCmd(), commands);
    assert.strictEqual(system.rules, map);
    assert.deepEqual([...map], entries);
    for (const proof of proofs) {
        assert.strictEqual(proof.rule.step, proof.step);
        assert.equal(proof.rule.toString(), proof.formula);
        if (proof.step) assert.deepEqual(system.genCmd(proof.step), proof.commands);
    }
});

test('cycles, unknown dependencies and budget exhaustion fail closed, with an empty-policy fast path', () => {
    const system = fixture(), policy = new MapAxiomPolicy(system, new Set(['a3']));
    const loop = new Deduction(new Set(), name('loop'), [], [], ast('A'));
    loop.step = [new Proposition(ast('A'), {type:'d', data:{deduction:name('loop'), conditions:[], replaceValues:{}}})];
    system.rules.set('loop', loop);
    assert.equal(policy.allowsRule(loop), false);
    const bad = new Proposition(ast('A'), {type:'d', data:{deduction:name('a1'), conditions:[], replaceValues:{}}});
    bad.from.data.conditions.push(bad);
    assert.equal(policy.allowsStep(bad), false);
    const circularScope = Proposition.hyp(ast('A'));
    circularScope.parent = circularScope;
    assert.equal(policy.allowsStep(circularScope), false);
    assert.throws(() => policy.checkName(name('unknown')), Error);
    const cyclicName = name('a1');
    cyclicName.nodes.push(cyclicName);
    assert.throws(() => policy.checkName(cyclicName), Error);
    const large = new Deduction(new Set(), name('large'), [], [], ast('A'), Array.from({length:10000}, () => Proposition.hyp(ast('A'))));
    system.rules.set('large', large);
    assert.equal(policy.allowsRule(large), false);
    const enabled = new MapAxiomPolicy(system, new Set());
    assert.equal(enabled.allowsRule(loop), true);
    assert.equal(enabled.allowsRule(large), true);
    assert.equal(enabled.allowsStep(bad), true);
    assert.doesNotThrow(() => enabled.checkName(cyclicName));
});

test('cyclic combination unification is stopped by charged formula preflight before proof generation', () => {
    const system = fixture();
    const identity = builtin(system, '.i');
    system.rules.set('sni', identity);
    run(system, 'hyp $1→$1;sni $1→$1;mp 2 1;m zF;a1 $1 $1;m zG');
    const policy = new MapAxiomPolicy(system, new Set(['a3']));
    assert.throws(() => policy.checkName(name('zF(zG)')), Error);
    assert.equal(policy.allowsRule(system.getD(name('zF'))), true);
    assert.equal(policy.allowsRule(system.getD(name('zG'))), true);
    assert.doesNotThrow(() => policy.checkName(name('mp(a1,#)')));
});

test('failed implicit proof generation and oversized replay inputs are rejected', () => {
    const system = fixture();
    system.rules.delete('a2');
    const policy = new MapAxiomPolicy(system, new Set(['a3']));
    assert.throws(() => policy.checkName(name('cmp')), Error);
    assert.doesNotThrow(() => policy.checkName(name('ca1')));
    const giant = new Deduction(new Set(), name('giant'), [], [], ast('A'));
    const folder = Proposition.mkdir('v', ast('x'));
    folder.children.push(folder);
    giant.step = [folder];
    system.rules.set('giant', giant);
    assert.throws(() => policy.checkName(name('vgiant')), Error);
});

test('safe combinations keep their dependencies while unsupported quantified proof materialization fails closed', () => {
    const system = fixture(), policy = new MapAxiomPolicy(system, new Set(['a3']));
    const combined = new AST(NodeType.NODE_DNAME, '', name('<a1'), name('a1'));
    assert.equal(system.getD(combined, false).conditions.length, 0);
    assert.doesNotThrow(() => policy.checkName(combined));
    assert.doesNotThrow(() => policy.checkName(new AST(NodeType.NODE_DNAME, 'c', combined)));
    assert.throws(() => policy.checkName(new AST(NodeType.NODE_DNAME, 'v', combined)), Error);
    assert.doesNotThrow(() => new MapAxiomPolicy(system, new Set()).checkName(new AST(NodeType.NODE_DNAME, 'v', combined)));
});


test('interactive deductions reject tainted old conditions before changing the current proof', async () => {
    const system = fixture();
    run(system, 'a3 A B;a1 ((¬A→¬B)→(B→A)) C');
    const layer = Object.create(HSLayer.prototype);
    Object.assign(layer, {
        hilbertSystem: system, survivalAccess: null,
        propListView: {refresh() {}}, ruleListView: {refresh() {}},
        cmdInput: {setParserArgs() {}},
    });
    layer.unlockBasicPropCmd();
    layer.setMapDisabledAxioms(['a3']);
    const before = system.props.slice();
    for (const text of ['d mp 2 1', 'd <a1 1 C']) {
        await assert.rejects(getCommand('d').execute(ast(text, 'cmd').nodes), /禁用/);
        assert.deepEqual(system.props, before);
        before.forEach((step, index) => assert.equal(system.props[index], step));
    }
    await getCommand('d').execute(ast('d <a1 2 C', 'cmd').nodes);
    assert.equal(system.props.length, 3);
    layer.setMapDisabledAxioms([]);
    await getCommand('d').execute(ast('d mp 2 1', 'cmd').nodes);
    assert.equal(system.props.length, 4);
});
