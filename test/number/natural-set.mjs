import assert from 'node:assert/strict';
import { HSLayer } from '../../js/hs/main.js';
import { HilbertSystem } from '../../js/hs/core/core.js';
import { HSParser } from '../../js/hs/core/parser.js';
import { initialCreativeRules } from '../../js/hs/core/initial.js';
import { naturalSetTheorems } from '../../js/hs/core/number/natural-set.js';
import { Serde } from '../../js/hs/serde.js';

const parser = new HSParser();
const relation = '{x∈ℕ×ℕ|pr1(x)≤pr2(x)}';
const expected = new Map([
    ['.pn1', '{}∈ω'],
    ['.pn2', '∀n:(n∈ω→n∪{n}∈ω)'],
    ['.pn3', '∀x:¬(x∪{x}={})'],
    ['.pn4', '∀x:∀y:(x∪{x}=y∪{y}→x=y)'],
    // Modern #sb spells the old #rp induction schema. Its own variable is
    // bound directly, avoiding the old expression-level #nf wrapper.
    ['.pn5', '#sb($P,$n,{})→(∀$n:($n∈ω→$P→#sb($P,$n,$n∪{$n}))→∀$n:($n∈ω→$P))'],
    ['.N@+', '$x∈ℕ→$y∈ℕ→$x∈($x+S($y))'],
    ['.N@<=', '$x∈ℕ→$y∈$x→$y≤$x'],
    ['.<=Rel', `((($x∈ℕ∧$y∈ℕ)∧$x≤$y)↔Rel($x,${relation},$y))`],
    ['.<=Order', `Order(ℕ,${relation})`],
]);
const lines = naturalSetTheorems.split('\n').filter(line => line.trim());
const pureLines = lines.filter(line => /^\.pn[1-5]:/.test(line));
assert.equal(lines.length, expected.size);
assert.deepEqual(new Set(lines.map(line => line.slice(0, line.indexOf(':')))), new Set(expected.keys()));
assert.ok(!naturalSetTheorems.includes(':ax:'), 'all nine entries are proofs');

function layerWith(text = '') {
    const layer = Object.create(HSLayer.prototype);
    layer.hilbertSystem = new HilbertSystem();
    layer.ruleList = [];
    layer.ruleListView = { refresh() {}, expandedFolders: new Set(), idCounter: 1 };
    layer.propListView = { refresh() {}, expandedFolders: new Set(), idCounter: 1 };
    layer.addRules(text);
    return layer;
}
function verify(system, names, label) {
    for (const name of names) {
        const rule = system.rules.get(name);
        assert.ok(rule, `${label}: ${name} exists`);
        assert.equal(rule.error, undefined, `${label}: ${name}: ${JSON.stringify(rule.error)}`);
        assert.ok(rule.step?.length, `${label}: ${name} has a checked proof`);
        assert.equal(rule.conditions.length, 0, `${label}: ${name} remains closed`);
        assert.equal(rule.assertions.length, 0, `${label}: ${name} adds no side conditions`);
        assert.ok(rule.conclusion.equal(parser.parse(expected.get(name), 'wff')),
            `${label}: ${name} conclusion ${rule.conclusion}`);
    }
}
function noErrors(system, label) {
    for (const [name, rule] of system.rules) {
        assert.equal(rule.error, undefined, `${label}: ${name}: ${JSON.stringify(rule.error)}`);
    }
}
function replay(system, commands) {
    for (const cmd of commands) system.fromCmd(parser.parse(cmd, 'cmds').nodes);
}

// The .pn family must genuinely follow from set theory, without PA, dN,
// arithmetic, NBG, or previously cached natural-set theorems.
const zfc = initialCreativeRules.split('{ [zh]NBG集合论')[0];
assert.ok(zfc.includes('areg:') && zfc.includes('d\\o:'));
assert.ok(!zfc.includes('apn1:') && !zfc.includes('dN:'));
const isolated = layerWith(zfc + '\n' + pureLines.join('\n'));
verify(isolated.hilbertSystem, [...expected.keys()].slice(0, 5), 'pure ZFC');
noErrors(isolated.hilbertSystem, 'pure ZFC');
assert.equal(isolated.hilbertSystem.rules.has('apn5'), false);

const integrated = layerWith(initialCreativeRules);
const present = [...expected.keys()].filter(name => integrated.hilbertSystem.rules.has(name));
if (!present.length) integrated.addRules(naturalSetTheorems);
else assert.equal(present.length, expected.size, 'initial rules integrate the whole natural-set module');
verify(integrated.hilbertSystem, expected.keys(), 'full number system');
noErrors(integrated.hilbertSystem, 'full number system');

// Replay the actual serialized proof bodies in a fresh system which has
// their dependencies but does not contain the theorem being re-proved.
for (const name of expected.keys()) {
    const rule = integrated.hilbertSystem.rules.get(name);
    const commands = integrated.hilbertSystem.genCmd(rule.step);
    const fresh = layerWith(name.startsWith('.pn') ? zfc : initialCreativeRules);
    fresh.hilbertSystem.rules.delete(name);
    for (const line of lines) {
        const dependency = line.slice(0, line.indexOf(':'));
        if (dependency === name) break;
        if (!fresh.hilbertSystem.rules.has(dependency)) fresh.addRules(line);
    }
    replay(fresh.hilbertSystem, commands);
    const result = fresh.hilbertSystem.checkConclusionInPropList();
    assert.equal(result.asserts.length, 0, `${name}: replay has no unproved side conditions`);
    assert.equal(result.conditions.length, 0, `${name}: replay is closed`);
    assert.ok(result.conclusion.equal(rule.conclusion), `${name}: independent genCmd replay`);
    assert.deepEqual(fresh.hilbertSystem.genCmd(), commands, `${name}: stable command serialization`);
}

// Check rejection paths, rather than merely observing successful registration.
const omit = name => zfc.split('\n').filter(line => !line.trimStart().startsWith(name + ':')).join('\n');
const noRegularity = layerWith(omit('areg') + '\n' + pureLines.join('\n'));
assert.ok(noRegularity.hilbertSystem.rules.get('.pn4').error, 'injectivity requires regularity');
assert.equal(noRegularity.hilbertSystem.rules.get('.pn3').error, undefined);
const noSeparation = layerWith(omit('dsep') + '\n' + pureLines.join('\n'));
assert.ok(noSeparation.hilbertSystem.rules.get('.pn5').error, 'induction uses separation');
const noOmega = layerWith(omit('d\\o') + '\n' + pureLines.join('\n'));
assert.ok(noOmega.hilbertSystem.rules.get('.pn1').error, 'omega definition is required');
const pn1 = lines.find(line => line.startsWith('.pn1:'));
isolated.addRules('.pn1:⊢{}∈{};' + pn1.slice(pn1.indexOf(';') + 1));
assert.ok(isolated.hilbertSystem.rules.get('.pn1').error, 'a false theorem header cannot reuse a true proof');

// Use the production Serde against an empty destination rule registry.
let uuid = 1;
const assignIds = nodes => nodes.forEach(node => { node.uuid = uuid++; if (node.children) assignIds(node.children); });
assignIds(integrated.ruleList);
const serde = new Serde(integrated, integrated.hilbertSystem, integrated.ruleList,
    integrated.propListView, integrated.ruleListView);
const saved = serde.serializeRulelist();
const restored = layerWith();
new Serde(restored, restored.hilbertSystem, restored.ruleList,
    restored.propListView, restored.ruleListView).deserializeRulelist(saved);
verify(restored.hilbertSystem, expected.keys(), 'fresh Serde');
noErrors(restored.hilbertSystem, 'fresh Serde');
assert.deepEqual(restored.ruleList, integrated.ruleList, 'Serde preserves the rule tree and UUIDs');
console.log('Verified all 9 natural-set theorems; pure ZFC .pn1–5, independent proof replay, negative checks and fresh Serde passed.');
