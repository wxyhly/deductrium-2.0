import assert from 'node:assert/strict';
import {test} from 'node:test';
import {serialize} from 'node:v8';
import {rerecordRule} from '../js/hs/rerecord.js';
import {HSLayer} from '../js/hs/main.js';
import {HilbertSystem} from '../js/hs/core/core.js';
import {HSParser} from '../js/hs/core/parser.js';
import {Serde} from '../js/hs/serde.js';
import {ruleProvenance} from '../js/hs/provenance.js';
import {initialCreativeRules} from '../js/hs/core/initial.js';

const parse = text => new HSParser().parse(text, 'cmd');
const run = (system, text) => system.fromCmd(text.split(';').filter(Boolean).map(parse));
const identity = 'a1 $p $p;a1 $p $p→$p;a2 $p $p→$p $p;mp 3 2;mp 4 1';
function layer(extra = '') {
    const hs = Object.create(HSLayer.prototype);
    hs.hilbertSystem = new HilbertSystem();
    hs.ruleList = [];
    hs.ruleListView = {refresh() {}, expandedFolders:new Set(), idCounter:1};
    hs.propListView = {refresh() {},setData() {}};
    hs.refresh = () => {};
    hs.addRules(initialCreativeRules + '\n' + extra);
    return hs;
}
const state = system => ({rules:system.rules, aliases:system.renamedSysRule, context:system.saveContext()});
function rejectsUnchanged(system, target, pattern) {
    const context = system.saveContext(), rules = [...system.rules], before = serialize(state(system));
    assert.throws(() => rerecordRule(system, target), pattern);
    assert.ok(serialize(state(system)).equals(before), 'all live values and references must remain unchanged');
    for (const key of Object.keys(context)) assert.equal(system.saveContext()[key], context[key], key);
    for (const [id, rule] of rules) assert.equal(system.rules.get(id), rule, id);
}

test('rerecord repairs an old failed identity with its actual constructive proof', () => {
    const hs = layer('broken:⊢$p→$p;broken $p'), system = hs.hilbertSystem;
    const target = system.rules.get('broken'), original = structuredClone(target);
    assert.ok(target.error);
    run(system, identity);
    const context = system.saveContext(), commands = system.genCmd(), rules = [...system.rules];
    const result = rerecordRule(system, target);
    assert.equal(system.rules.get('broken'), result);
    assert.notEqual(result, target);
    assert.equal(result.error, undefined);
    assert.deepEqual(structuredClone(target), original, 'keep the old failed object intact');
    assert.deepEqual(system.genCmd(), commands);
    for (const key of Object.keys(context)) assert.equal(system.saveContext()[key], context[key], key);
    for (const [id, rule] of rules) if (id !== 'broken') assert.equal(system.rules.get(id), rule, id);
    assert.notEqual(result.step[0], system.props[0]);
    assert.deepEqual(ruleProvenance(system, result).tags, ['propositional']);
    assert.equal(ruleProvenance(system, result).valid, true);
    result.step[0].ast.name = 'scratch-only';
    assert.deepEqual(system.genCmd(), commands, 'published proof owns its ASTs');
});

test('wrong conclusions, additional hypotheses and assertions are rejected atomically', () => {
    for (const proof of ['a1 $p $p', 'hyp Q;.i $p', 'hyp #nf($p,x);.i $p']) {
        const system = layer('broken:⊢$p→$p;broken $p').hilbertSystem;
        run(system, proof);
        rejectsUnchanged(system, system.rules.get('broken'), /complete rule schema/);
    }
});

test('exact real assertion/hypothesis proofs, their order and parameter types are preserved', () => {
    const hs = layer('broken:#nf($p,x),$p⊢∀x:$p;missing'), system = hs.hilbertSystem;
    run(system, 'hyp #nf($p,x);hyp $p;<a6 2 x');
    const result = rerecordRule(system, system.rules.get('broken'));
    assert.equal(result.toString(), '#nf($p,x),$p⊢∀x:$p');
    assert.equal(result.error, undefined);
    for (const [header, proof] of [
        ['$p,$q⊢$p→$q→$p', 'hyp $q;hyp $p;a1 $p $q'],
        ['#nf($p,x),#nf($q,y)⊢$p→$q→$p', 'hyp #nf($q,y);hyp #nf($p,x);a1 $p $q'],
    ]) {
        const other = layer(`broken:${header};missing`).hilbertSystem;
        run(other, proof);
        rejectsUnchanged(other, other.rules.get('broken'), /complete rule schema/);
    }
});

test('replaceNames order is exact and never silently normalized', () => {
    const system = layer('broken:⊢$b→$a→$b;missing').hilbertSystem;
    run(system, 'a1 $b $a');
    const target = system.rules.get('broken');
    assert.deepEqual(target.replaceNames, [['$b',false],['$a',false]]);
    target.replaceNames.reverse();
    rejectsUnchanged(system, target, /complete rule schema/);
    target.replaceNames.reverse();
    assert.deepEqual(rerecordRule(system, target).replaceNames, [['$b',false],['$a',false]]);
});

test('the independent replay rejects a forged sheet conclusion that matches only in memory', () => {
    const system = layer('broken:⊢$p→$q→$p;missing').hilbertSystem;
    const target = system.rules.get('broken');
    run(system, '.i $p');
    system.props.at(-1).ast = target.conclusion.clone();
    rejectsUnchanged(system, target, /complete rule schema/);
});

test('dependency inspection stops at its fixed work budget and leaves the live graph intact', () => {
    const system = layer('broken:⊢$p→$p;missing').hilbertSystem;
    run(system, '.i $p');
    system.rules.get('.i').dependence = new Set(Array.from({length:33000}, (_, i) => `missing${i}`));
    rejectsUnchanged(system, system.rules.get('broken'), /proof budget/);
});

test('stale targets and primitive axioms cannot be rerecorded', () => {
    const hs = layer('broken:⊢$p→$p;missing'), system = hs.hilbertSystem;
    const stale = system.rules.get('broken');
    hs.addRules('broken:⊢$p→$p;missing');
    run(system, identity);
    rejectsUnchanged(system, stale, /no longer current/);
    rejectsUnchanged(system, system.rules.get('a1'), /axiom/);
    rejectsUnchanged(system, system.rules.get('d0'), /axiom/);
});

test('a currently valid derived rule can be replaced without clearing the active proof', () => {
    const system = layer().hilbertSystem, target = system.rules.get('.i');
    run(system, identity.replaceAll('$p', '$'));
    const context = system.saveContext();
    const result = rerecordRule(system, target);
    assert.notEqual(result, target);
    assert.equal(result.name.name, '.i');
    assert.equal(system.props, context.props);
    assert.equal(ruleProvenance(system, result).valid, true);
});

test('direct use and transformed or composed uses of the target cannot certify themselves', () => {
    for (const command of ['.i $', 'c.i $ $', '.i() $']) {
        const system = layer().hilbertSystem, target = system.rules.get('.i');
        run(system, command);
        rejectsUnchanged(system, target, /unavailable rule/);
    }
});

test('transitive dependencies back to the target are rejected even when cached as valid', () => {
    const hs = layer('first:⊢$→$;.i $\nsecond:⊢$→$;first $'), system = hs.hilbertSystem;
    for (const command of ['second $', 'csecond $ $']) {
        system.loadContext(system.createEmptyContext());
        run(system, command);
        rejectsUnchanged(system, system.rules.get('.i'), /unavailable rule/);
    }
});

test('failed dependencies and cyclic dependency graphs fail without live mutations', () => {
    const hs = layer('broken:⊢$p→$p;missing\nnextProof:⊢$p→$p;.i $p'), system = hs.hilbertSystem;
    run(system, 'nextProof $p');
    const next = system.rules.get('nextProof');
    next.error = {cause:'invalid dependency',cmds:'.i $p'};
    rejectsUnchanged(system, system.rules.get('broken'), /unavailable rule/);
    delete next.error;
    next.step.at(-1).from.data.deduction.name = 'nextProof';
    rejectsUnchanged(system, system.rules.get('broken'), /Cyclic proof dependency/);
});

test('rule-changing commands cannot be smuggled into an otherwise matching proof', () => {
    const system = layer('broken:⊢$p→$p;missing').hilbertSystem;
    run(system, identity);
    const last = system.props.at(-1);
    last.getCmd = () => 'm injected';
    const context = system.saveContext(), rules = [...system.rules];
    assert.throws(() => rerecordRule(system, system.rules.get('broken')), /rule-changing commands/);
    assert.equal(system.rules.has('injected'), false);
    for (const key of Object.keys(context)) assert.equal(system.saveContext()[key], context[key]);
    for (const [id, rule] of rules) assert.equal(system.rules.get(id), rule);
});

test('malformed cyclic proof scopes are rejected before command generation', () => {
    const system = layer('broken:⊢$p→$p;missing').hilbertSystem;
    run(system, identity);
    system.props.at(-1).parent = system.props.at(-1);
    rejectsUnchanged(system, system.rules.get('broken'), /Cyclic proof scope/);
});

test('real Serde preserves a rerecorded rule and its actual new provenance', () => {
    const hs = layer('broken:⊢$p→$p;broken $p'), system = hs.hilbertSystem;
    run(system, identity);
    rerecordRule(system, system.rules.get('broken'));
    const serde = Object.assign(Object.create(Serde.prototype), {hsLayer:hs,hs:system,ruleList:hs.ruleList});
    const saved = serde.serializeRulelist();
    const restored = layer(), loader = Object.assign(Object.create(Serde.prototype), {
        hsLayer:restored,hs:restored.hilbertSystem,ruleList:restored.ruleList,
    });
    loader.deserializeRulelist(saved);
    const result = restored.hilbertSystem.rules.get('broken');
    assert.equal(result.error, undefined);
    assert.deepEqual(ruleProvenance(restored.hilbertSystem, result).tags, ['propositional']);
    assert.equal(loader.serializeRulelist(), saved);
});
