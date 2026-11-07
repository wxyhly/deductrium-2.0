import assert from 'node:assert/strict';
import { HSLayer } from '../js/hs/main.js';
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { initialCreativeRules } from '../js/hs/core/initial.js';
import { getCommand } from '../js/hs/gui/cmdmgr.js';
import { SurvivalAccess } from '../js/hs/access.js';

const parser = new HSParser();
const layer = Object.create(HSLayer.prototype);
Object.assign(layer, {
    hilbertSystem: new HilbertSystem(), ruleList: [], activeRuleFolder: null,
    propListView: { refresh() {} }, ruleListView: { refresh() {} },
    cmdInput: { setParserArgs() {} }, cmdUIMgr: { insertText() {} },
    sheetGui: { sheets: [{}], activeIndex: 0 },
    cmdEngine: { run() {} }, survivalAccess: null,
});
layer.addRules(initialCreativeRules);
const system = layer.hilbertSystem;
assert.equal([...system.rules.values()].filter(rule => rule.error).length, 0);
const commandNames = ['m', 'hyp', 'mcpt', 'mcnt', 'cond', 'var', 'dir'];
const unlocked = () => commandNames.filter(name => getCommand(name));
const run = async text => {
    const cmd = parser.parse(text, 'cmd');
    await getCommand(cmd.name).execute(cmd.nodes);
};
const rejects = async (text, type) => {
    const before = system.genCmd().join(';');
    await assert.rejects(run(text), error => error?.type === type, text);
    assert.equal(system.genCmd().join(';'), before, `failed command preserved proof: ${text}`);
};

layer.configureSurvival([]);
assert.deepEqual(unlocked(), []);
layer.applyReward('macro');
assert.deepEqual(unlocked(), ['m']);
layer.applyReward('hyp');
assert.deepEqual(unlocked(), ['m', 'hyp']);
await rejects('d ca1 $p $q $r', 'lockedFeature');
layer.applyReward('1st');
assert.deepEqual(unlocked(), ['m', 'hyp', 'var']);
await run('var x');
await run('d a1 $p $q');
const varFolder = system.props[0];
assert.equal(varFolder.children.length, 1);
await rejects('d .i $p', 'quantifyAxiomOnly');
await rejects('d mp 1 1', 'quantifyAxiomOnly');
// Quantifying an axiom again still produces an axiom schema.
await run('d va1 x $p $q');
layer.applyReward('mct');
await run('cond $r');
await rejects('d .i $p', 'quantifyAxiomOnly');
assert.throws(() => getCommand('d').getNextParam([parser.parse('.i', 'dname')]),
    error => error?.type === 'quantifyAxiomOnly');
layer.applyReward('mcpt');
await rejects('mcpt $p→$p', 'quantifyAxiomOnly');
layer.applyReward('mnt');
await rejects('mcnt (∀x:P(x)) {x,y}', 'quantifyAxiomOnly');
layer.applyReward('mifft');
await rejects('d msbt> something', 'quantifyAxiomOnly');

// Granting conditional generalization lifts the restriction, including inside
// a condition nested under a variable block.
layer.applyReward('mcvt');
await run('d .i $p');
assert.equal(system.saveContext().activeProp.children.at(-1).ast.toString(), '$p→$p');
system.clear();
await run('d va1 x $p $q');
assert.match(system.props.at(-1).ast.toString(), /∀x:/);

// A saved/recorded closed theorem is still not an axiom in the mq-only stage.
layer.configureSurvival(['macro', '1st']);
system.clear();
await run('d a1 $p $q');
await run('m zSaved');
assert.ok(system.rules.get('zSaved').step.length);
system.clear();
await run('var x');
await rejects('d zSaved $p $q', 'quantifyAxiomOnly');
system.clear();
await rejects('d vzSaved x $p $q', 'quantifyAxiomOnly');

// The old mq rule also rejects a condition-bearing primitive rule without a
// proof body, even if a macro aliases it.
const mp = system.rules.get('mp');
system.rules.set('zPrimitive', new Deduction(new Set(), parser.parse('zPrimitive', 'dname'),
    [], mp.conditions, mp.conclusion));
await rejects('d vzPrimitive 1 2 x', 'quantifyAxiomOnly');

// Numeric permissions classify names before generation, even when rules were
// cached/preloaded. Check the exact literal aliases supported by number/main.
const numberCases = [
    ['natop', ['d11', 'd123', '.0@N', '.7@N', '.2+3', '.2*3']],
    ['dZn', ['dZ0', 'dZ+0', 'dZ-0', 'dZ17', 'dZ+17', 'dZ-17']],
    ['dZop', ['.0@Z', '.+2@Z', '.-2@Z', '.+2+3', '.2+-3', '.-2*-3', '.2-3']],
];
const permits = (access, name) => access.checkRuleName(parser.parse(name, 'dname'), system);
for (const [reward, names] of numberCases) for (const name of names) {
    assert.throws(() => permits(new SurvivalAccess(), name), error => error?.type === 'lockedFeature', name);
    assert.doesNotThrow(() => permits(new SurvivalAccess(new Set([reward])), name), name);
    for (const [other] of numberCases) if (other !== reward) {
        assert.throws(() => permits(new SurvivalAccess(new Set([other])), name), error => error?.type === 'lockedFeature', name);
    }
}
for (const name of ['d1', 'd10']) {
    assert.throws(() => permits(new SurvivalAccess(), name), error => error?.type === 'lockedFeature');
    permits(new SurvivalAccess(new Set(['peano'])), name);
    permits(new SurvivalAccess(new Set(['natop'])), name);
}
for (const name of ['dQ0', 'dQ+17q', 'd-17q', 'd1.25', 'dQ-1.25q', 'dR0', 'dR+17r', 'd-17r', 'd1.25r', 'dR-1.25']) {
    assert.throws(() => permits(new SurvivalAccess(new Set(['natop', 'dZn', 'dZop'])), name),
        error => error?.type === 'lockedFeature', name);
}
const wrapped = new SurvivalAccess(new Set(['mct', 'mcmt']));
for (const name of ['cd11', 'c.2+3', 'c.+2@Z', 'a1:.2*3']) {
    assert.throws(() => permits(wrapped, name), error => error?.type === 'lockedFeature', name);
}
for (const name of ['d0', 'dZ', 'dZ+', 'dZ*', '.+s', '.Zr', 'd01', 'dZ01', '.01@N']) permits(new SurvivalAccess(), name);

if (system.rules.has('apn1')) {
    system.clear();
    layer.configureSurvival([]);
    for (const name of ['d17', 'dZ+17', '.2@N', '.2+3', '.+2@Z', '.+2+-1']) {
        const before = new Map(system.rules);
        await rejects('d ' + name, 'lockedFeature');
        assert.deepEqual(system.rules, before, 'locked generation has no cache side effect');
        assert.throws(() => getCommand('d').getNextParam([parser.parse(name, 'dname')]), error => error?.type === 'lockedFeature');
    }
    layer.configureSurvival(['natop', 'dZn', 'dZop']);
    for (const name of ['d17', 'dZ+17', '.2@N', '.2+3', '.2*3', '.+2@Z', '.+2+-1', '.-1*+2']) {
        await run('d ' + name);
        assert(system.rules.has(name), 'generated ' + name);
        if (name.startsWith('.')) assert(system.rules.get(name).step?.length, name + ' is proved');
    }
    const source = system.props.find(prop => prop.from.type === 'd' && prop.from.data.deduction.name === '.2+3');
    assert(source);
    layer.configureSurvival([]);
    for (const name of ['d17', 'dZ+17', '.2@N', '.2+3', '.+2@Z', '.+2+-1']) await rejects('d ' + name, 'lockedFeature');
    assert.throws(() => layer.survivalAccess.checkReplay([parser.parse('d .2+3', 'cmd')], system), error => error?.type === 'lockedFeature');
    assert.throws(() => layer.survivalAccess.checkMove(source, null, system), error => error?.type === 'lockedFeature');
    layer.configureSurvival(['hyp', 'mct', '1st', 'mcvt', 'mdt', 'midt', 'mcmt']);
    assert.throws(() => layer.survivalAccess.checkExpand(source, system), error => error?.type === 'lockedFeature'
        && ['natural literals', 'natural arithmetic'].includes(error.feature));
}

// Loading a less advanced save resets the shared UI command registry.
layer.configureSurvival([]);
assert.deepEqual(unlocked(), []);
assert.ok(getCommand('d'));
layer.survivalAccess = null;
layer.unlockBasicRuleCmd();
layer.unlockMetaBlock('c'); layer.unlockMetaBlock('v'); layer.unlockMetaBlock('f');
assert.deepEqual(unlocked(), commandNames);
system.clear();
await run('var x'); await run('d .i $p');
console.log('PASS survival commands, mq-only, numeric permissions, cached reset, replay, move, expansion and creative commands');
