import assert from 'node:assert/strict';
import { HSLayer } from '../js/hs/main.js';
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { initialCreativeRules } from '../js/hs/core/initial.js';
import { numberSetTheorems, naturalSetBridgeTheorems, integerSetTheorems } from '../js/hs/core/number-set-proofs.js';
import { generateIntegerProof } from '../js/hs/core/integer-proofs.js';

const layer = Object.create(HSLayer.prototype);
layer.hilbertSystem = new HilbertSystem();
layer.ruleList = [];
layer.ruleListView = { refresh() {} };
const system = layer.hilbertSystem;
const parser = new HSParser();
layer.addRules(initialCreativeRules);
assert.ok(numberSetTheorems.trim());
assert.equal(numberSetTheorems, [naturalSetBridgeTheorems, integerSetTheorems].join('\n'));
assert.ok(integerSetTheorems.startsWith('.setZIntro:'));
assert.ok(!naturalSetBridgeTheorems.includes('.setZIntro:'));
assert.ok(naturalSetBridgeTheorems.includes('.N@t:'));
assert.ok(!numberSetTheorems.includes(':ax:'), 'set theorems must have proofs');
layer.addRules(numberSetTheorems);
const lines = numberSetTheorems.split('\n').map(line => line.trim())
    .filter(line => line && !line.startsWith('//'));
const names = lines.map(line => line.slice(0, line.indexOf(':')));
assert.equal(new Set(names).size, names.length);
for (const name of names) {
    const rule = system.rules.get(name);
    assert.ok(rule, name);
    if (rule.error) console.error(name, JSON.stringify(rule.error));
    assert.equal(rule.error, undefined, `${name}: proof replay`);
    assert.ok(rule.step?.length, `${name}: checked proof steps`);
    console.log(`[ok] ${name}`);
}

system.fromCmd(['hyp 2∈ℕ', 'd .N@ω 1', 'd .ω@N 2'].map(cmd => parser.parse(cmd, 'cmd')));
assert.equal(system.getP('3').ast.toString(), '2∈ℕ');
const transitivity = system.rules.get('.N@t');
assert.equal(transitivity.conditions.length, 0, '.N@t retains the legacy closed interface');
assert.equal(transitivity.assertions.length, 0);
assert.ok(transitivity.conclusion.equal(parser.parse('$x∈ℕ→$y∈$x→$y∈ℕ', 'wff')),
    '.N@t retains the exact legacy implication');
// New hypotheses are inserted before deductions; 0∈2 therefore has id 2.
system.fromCmd(['hyp 0∈2', 'd .N@t 2 0', 'd mp 5 1', 'd mp 6 2']
    .map(cmd => parser.parse(cmd, 'cmd')));
assert.ok(system.getP('7').ast.equal(parser.parse('0∈ℕ', 'wff')));
console.log(`Verified ${names.length} set bridge rules through HSLayer.addRules.`);
assert.ok(system.rules.get('.Z+s').conclusion.equal(parser.parse('$x∈ℤ→$y∈ℤ→$x+$y=$y+$x', 'wff')));

// Signed literals retain their spelling, including both zero signs. The
// generator must close its own proof and preserve the caller's editing context.
for (const name of ['.+0@Z', '.-0@Z', '.+1@Z', '.-1@Z', '.+2@Z', '.-2@Z', '.+12@Z', '.-12@Z']) {
    const before = system.saveContext();
    const deduction = generateIntegerProof(system, name);
    assert.ok(deduction?.step?.length, `${name}: proof steps`);
    assert.equal(deduction.error, undefined);
    assert.equal(deduction.assertions.length, 0);
    assert.equal(deduction.conditions.length, 0);
    assert.ok(deduction.conclusion.equal(parser.parse(`${name.slice(1, -2)}∈ℤ`, 'wff')), name);
    assert.strictEqual(system.props, before.props, `${name}: caller props`);
    assert.deepEqual(system.saveContext(), before, `${name}: caller context`);
    system.d(deduction, [], {});
}
for (const name of ['.+01@Z', '.-01@Z', '.+1@Z\n', '.1+2', '.1*2', '.+01+-2', '.+1--02', '.+1/2', 'dZ1']) {
    const before = system.saveContext();
    assert.equal(generateIntegerProof(system, name), undefined, name);
    assert.deepEqual(system.saveContext(), before, `${name}: rejection preserves context`);
}
const beforeBudget = system.saveContext();
assert.throws(() => generateIntegerProof(system, '.+1001@Z'), /1000-successor budget/);
assert.deepEqual(system.saveContext(), beforeBudget, 'budget rejection preserves context');
const minimal = new HilbertSystem();
assert.equal(generateIntegerProof(minimal, '.+1@Z'), undefined, 'missing bridge is never an axiom');
console.log('Verified signed integer membership and generator context isolation.');

const operationCases = [
    ['.1@Z', '+1∈ℤ'], ['.0@Z', '+0∈ℤ'],
    ['.+2++3', '+2++3=+5'], ['.-2+-3', '-2+-3=-5'],
    ['.+2+-3', '+2+-3=-1'], ['.-2++3', '-2++3=+1'],
    ['.+3+-3', '+3+-3=+0'], ['.+2-+3', '+2-+3=-1'],
    ['.-2--3', '-2--3=+1'], ['.-2-+3', '-2-+3=-5'],
    ['.+2--3', '+2--3=+5'], ['.2-3', '+2-+3=-1'],
    ['.+2*-3', '+2*-3=-6'], ['.-2*-3', '-2*-3=+6'],
    ['.+0*-3', '+0*-3=+0'], ['.-0*-3', '-0*-3=+0'],
    ['.-0+-0', '-0+-0=+0'], ['.+0--0', '+0--0=+0'],
    ['.-12*+2', '-12*+2=-24'], ['.2+-3', '+2+-3=-1'],
];
const signed = ['-3', '-2', '-1', '-0', '+0', '+1', '+2', '+3'];
for (const left of signed) for (const right of signed) for (const op of ['+', '-', '*']) {
    const a = BigInt(left), b = BigInt(right);
    const value = op === '+' ? a + b : op === '-' ? a - b : a * b;
    operationCases.push([`.${left}${op}${right}`, `${left}${op}${right}=${value < 0n ? value : `+${value}`}`]);
}
// Keep an open editing folder and a colliding local name across every request.
system.fromCmd(['var #integer', 'cond #integer∈ℤ'].map(cmd => parser.parse(cmd, 'cmd')));
for (const [name, formula] of operationCases) {
    const before = system.saveContext();
    const deduction = generateIntegerProof(system, name);
    assert.ok(deduction?.step?.length, `${name}: proof steps`);
    assert.equal(deduction.assertions.length, 0);
    assert.equal(deduction.conditions.length, 0);
    assert.ok(deduction.conclusion.equal(parser.parse(formula, 'wff')), `${name}: ${deduction.conclusion}`);
    assert.deepEqual(system.saveContext(), before, `${name}: caller context`);
    // Replay the actual generated commands in a fresh context, not just the
    // stored final formula. Every inference must still check independently.
    const commands = system.genCmd(deduction.step);
    system.loadContext(system.createEmptyContext());
    system.fromCmd(commands.map(cmd => parser.parse(cmd, 'cmd')));
    const replayed = system.checkConclusionInPropList();
    assert.equal(replayed.asserts.length, 0);
    assert.equal(replayed.conditions.length, 0);
    assert.ok(replayed.conclusion.equal(parser.parse(formula, 'wff')), `${name}: command replay`);
    system.loadContext(before);
}
for (const name of ['.+1001++0', '.+500*+3', '.+1000++1']) {
    const before = system.saveContext();
    assert.throws(() => generateIntegerProof(system, name), /1000-successor budget/);
    assert.deepEqual(system.saveContext(), before, `${name}: budget preserves context`);
}
const savedShift = system.rules.get('.Zr');
const beforeMissing = system.saveContext();
system.rules.delete('.Zr');
try {
    assert.equal(generateIntegerProof(system, '.+2+-1'), undefined);
    assert.deepEqual(system.saveContext(), beforeMissing);
} finally { system.rules.set('.Zr', savedShift); }
// A dependency error after entering the isolated proof must restore the caller.
const originalGetD = system.getD;
const beforeFailure = system.saveContext();
system.getD = function (name) {
    if (name.toString() === 'dZ+2') throw new Error('injected integer dependency failure');
    return originalGetD.call(this, name);
};
try {
    assert.throws(() => generateIntegerProof(system, '.+2+-1'), /injected integer dependency failure/);
    assert.deepEqual(system.saveContext(), beforeFailure);
} finally { system.getD = originalGetD; }
console.log(`Verified ${operationCases.length} integer cases, independent command replay, and context isolation.`);
