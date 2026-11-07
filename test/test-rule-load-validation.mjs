import assert from 'node:assert/strict';
import {test} from 'node:test';
import {HSLayer} from '../js/hs/main.js';
import {HilbertSystem} from '../js/hs/core/core.js';
import {HSParser} from '../js/hs/core/parser.js';
import {Serde} from '../js/hs/serde.js';
import {initialCreativeRules} from '../js/hs/core/initial.js';
import {ruleProvenance} from '../js/hs/provenance.js';

const parser = new HSParser();
const parse = (text, mode = 'cmd') => parser.parse(text, mode);
const run = (system, text) => system.fromCmd(text.split(';').filter(Boolean).map(text => parse(text)));
function layer(text = '') {
    const hs = Object.create(HSLayer.prototype);
    hs.hilbertSystem = new HilbertSystem();
    hs.ruleList = [];
    hs.ruleListView = {refresh() {}, expandedFolders:new Set(), idCounter:1};
    hs.propListView = {refresh() {}, setData() {}};
    hs.refresh = () => {};
    hs.addRules(text);
    return hs;
}
function serde(hs) {
    return Object.assign(Object.create(Serde.prototype), {
        hsLayer:hs, hs:hs.hilbertSystem, ruleList:hs.ruleList,
    });
}
function failed(hs, id, commands) {
    const rule = hs.hilbertSystem.rules.get(id);
    assert.ok(rule?.error, `${id} must retain a load error`);
    assert.equal(rule.error.cmds, commands);
    assert.equal(rule.step, undefined, `${id} must not publish a proof`);
    return rule;
}
function causes(error) {
    const values = [];
    for (let value = error; value && typeof value === 'object'; value = value.cause) values.push(value);
    return values;
}
const identity = 'a1 $p $p;a1 $p $p→$p;a2 $p $p→$p $p;mp 3 2;mp 4 1';

test('an unproved macro cannot invoke itself and prove an arbitrary closed formula', () => {
    const hs = layer('loop:⊢P;loop');
    failed(hs, 'loop', 'loop');
    assert.throws(() => run(hs.hilbertSystem, 'loop'));
    assert.equal(hs.hilbertSystem.props.length, 0);
});

test('empty non-axiom bodies fail validation while explicit axioms remain usable', () => {
    const hs = layer('blank:⊢P;\nfromHyp:P⊢P;\ntrusted:ax:⊢P');
    failed(hs, 'blank', '');
    failed(hs, 'fromHyp', '');
    assert.throws(() => run(hs.hilbertSystem, 'blank'));
    assert.equal(hs.hilbertSystem.rules.get('trusted').error, undefined);
    run(hs.hilbertSystem, 'trusted');
    assert.equal(hs.hilbertSystem.props.at(-1).ast.toString(), 'P');
});

test('self references inside composition and prefix transformations remain unavailable', () => {
    for (const [header, commands] of [['⊢P','loop()'], ['P⊢P','loop(#) 1'],
        ['⊢P','cloop P'], ['⊢P','vloop x']]) {
        const hs = layer(`loop:${header};${commands}`);
        const rule = failed(hs, 'loop', commands);
        assert.ok(causes(rule.error.cause).some(value => value.type === 'errRuleUsed' && value.rule === 'loop'));
    }
});

test('replacing a same-name valid rule cannot use its previous definition as its own proof', () => {
    const hs = layer('loop:ax:⊢P');
    const previous = hs.hilbertSystem.rules.get('loop');
    hs.addRules('loop:⊢P;loop');
    assert.notEqual(failed(hs, 'loop', 'loop'), previous);
});

test('failed rules cannot be laundered through v, c, e or composition, including previews', () => {
    const hs = layer('bad:⊢P;missing\nnextProof:⊢P;bad\nquantified:⊢∀x:P;vbad x');
    const bad = failed(hs, 'bad', 'missing');
    for (const [id, commands] of [['nextProof','bad'], ['quantified','vbad x']]) {
        const rule = failed(hs, id, commands);
        const chain = causes(rule.error.cause);
        assert.ok(chain.some(value => value.type === 'errRuleUsed' && value.rule === 'bad'));
        assert.equal(chain.at(-1), bad.error.cause, 'retain the original nested cause');
    }
    for (const name of ['bad', 'vbad', 'cbad', 'ebad', 'bad()']) {
        for (const withProof of [false, true]) {
            assert.throws(() => hs.hilbertSystem.getD(parse(name, 'dname'), withProof), error =>
                causes(error).some(value => value.type === 'errRuleUsed' && value.rule === 'bad'));
        }
    }
});

test('a proof cannot hide an additional premise behind a closed header', () => {
    const hs = layer(initialCreativeRules);
    const commands = 'hyp P;a1 P P;mp 2 1;mp 3 1';
    hs.addRules(`bogus:⊢P;${commands}`);
    assert.equal(failed(hs, 'bogus', commands).error.cause.type, 'replayConclusionMismatch');
});

test('a proof cannot hide an additional assertion behind its header', () => {
    const hs = layer(initialCreativeRules);
    const commands = 'hyp #nf($p,x);<a6 2 x';
    hs.addRules(`bogus:$p⊢∀x:$p;${commands}`);
    assert.equal(failed(hs, 'bogus', commands).error.cause.type, 'replayConclusionMismatch');
    hs.addRules('identityProof:#nf($p,x),$p⊢∀x:$p;<a6 2 x');
    assert.equal(hs.hilbertSystem.rules.get('identityProof').error, undefined);
});

test('checked proofs, their callers, trusted axioms and valid replacements still load', () => {
    const hs = layer(initialCreativeRules);
    hs.addRules(`identityProof:⊢$p→$p;${identity}\nnextProof:⊢$p→$p;identityProof $p`);
    for (const id of ['mp', 'a1', 'a2', 'identityProof', 'nextProof']) {
        const rule = hs.hilbertSystem.rules.get(id);
        assert.equal(rule.error, undefined, id);
        assert.equal(ruleProvenance(hs.hilbertSystem, rule).valid, true, id);
    }
    hs.addRules('nextProof:⊢$p→$p;a1 $p $p;a1 $p $p→$p;a2 $p $p→$p $p;mp 3 2;mp 4 1');
    run(hs.hilbertSystem, 'nextProof P');
    assert.equal(hs.hilbertSystem.props.at(-1).ast.toString(), 'P→P');
    hs.addRules('nextProof:ax:⊢Q');
    run(hs.hilbertSystem, 'nextProof');
    assert.equal(hs.hilbertSystem.props.at(-1).ast.toString(), 'Q');
});

test('two-pass map-owned loading rejects direct and indirect self proofs and downstream uses', () => {
    const hs = layer();
    const data = '(10)loop:⊢P;loop\n(11)left:⊢P;right\n(12)right:⊢P;left\n(13)nextProof:⊢∀x:P;vloop x';
    serde(hs).deserializeRulelist(data, ['loop','left','right']);
    for (const [id, commands] of [['loop','loop'], ['left','right'], ['right','left'], ['nextProof','vloop x']]) {
        failed(hs, id, commands);
        assert.throws(() => run(hs.hilbertSystem, id));
    }
    assert.equal(serde(hs).serializeRulelist(), data);
});

test('two-pass loading keeps genuine map dependencies and their original UI order', () => {
    const hs = layer(initialCreativeRules);
    const data = serde(hs).serializeRulelist() + '\n(901)nextProof:⊢P;localAx\n(902)localAx:ax:⊢P';
    serde(hs).deserializeRulelist(data, ['localAx']);
    assert.equal(hs.hilbertSystem.rules.get('nextProof').error, undefined);
    assert.deepEqual(hs.ruleList.slice(-2).map(node => [node.name,node.uuid]), [['nextProof',901],['localAx',902]]);
    run(hs.hilbertSystem, 'nextProof');
    assert.equal(hs.hilbertSystem.props.at(-1).ast.toString(), 'P');
});

test('failed raw commands, UUIDs and folder order survive a Serde round trip', () => {
    const data = '(10){Proofs\n(11)loop:⊢P; loop ;\n(12)nextProof:⊢∀x:P;vloop x\n}\n(13)trusted:ax:⊢Q';
    const hs = layer(data);
    failed(hs, 'loop', ' loop ;');
    const first = serde(hs).serializeRulelist();
    assert.match(first, /\(11\)loop:⊢P; loop ;/);
    assert.doesNotMatch(first, /loop:ax:/);
    assert.deepEqual(hs.ruleList.map(node => [node.name,node.uuid]), [['Proofs',10],['trusted',13]]);
    assert.deepEqual(hs.ruleList[0].children.map(node => [node.name,node.uuid]), [['loop',11],['nextProof',12]]);
    const restored = layer();
    serde(restored).deserializeRulelist(first);
    assert.equal(serde(restored).serializeRulelist(), first);
    failed(restored, 'loop', ' loop ;');
    failed(restored, 'nextProof', 'vloop x');
});

test('loading successful and failed proofs restores the exact caller proof context', () => {
    const hs = layer(initialCreativeRules), system = hs.hilbertSystem;
    run(system, 'hyp $p;cond Q;a1 $p Q');
    const before = system.saveContext();
    const commands = system.genCmd(before.props);
    hs.addRules(`loop:⊢P;loop\nbogus:⊢P;hyp P;a1 P P;mp 2 1;mp 3 1\nidentityProof:⊢$p→$p;${identity}`);
    const after = system.saveContext();
    for (const key of Object.keys(before)) assert.equal(after[key], before[key], key);
    assert.deepEqual(system.genCmd(after.props), commands);
    failed(hs, 'loop', 'loop');
    assert.equal(system.rules.get('identityProof').error, undefined);
});
