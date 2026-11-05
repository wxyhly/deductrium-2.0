import assert from 'node:assert/strict';
import { HSLayer } from '../js/hs/main.js';
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { initialCreativeRules } from '../js/hs/core/initial.js';
import { getCommand } from '../js/hs/gui/cmdmgr.js';

const parser = new HSParser();
const layer = Object.create(HSLayer.prototype);
Object.assign(layer, {
    hilbertSystem: new HilbertSystem(), ruleList: [], activeRuleFolder: null,
    propListView: { refresh() {} }, ruleListView: { refresh() {} },
    cmdInput: { setParserArgs() {} }, cmdUIMgr: { insertText() {} },
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
console.log('PASS survival command progression, mq-only blocks, reset and creative commands');
