import assert from 'node:assert/strict';
import { HSLayer } from '../../js/hs/main.js';
import { HilbertSystem } from '../../js/hs/core/core.js';
import { HSParser } from '../../js/hs/core/parser.js';
import { initialCreativeRules } from '../../js/hs/core/initial.js';
import { peanoTheorems } from '../../js/hs/core/number/peano.js';

// Independent transcription of all derived PA rules in official 1 initial.ts.
const expected = new Map([
    ['.=Se', '⊢S($x)=S($y)→$x=$y'],
    ['.=Si', '⊢$0=$1→S($0)=S($1)'],
    ['.=S', '⊢$0=$1↔S($0)=S($1)'],
    ['.pred', '⊢∀x:(x∈ℕ→¬x=0→∃z:(x=S(z)∧z∈ℕ))'],
    ['.0+', '⊢$0∈ℕ→0+$0=$0'],
    ['.S+', '⊢$0∈ℕ→$1∈ℕ→S($0)+$1=S($0+$1)'],
    ['.+@N', '⊢$x∈ℕ→$y∈ℕ→$x+$y∈ℕ'],
    ['.+s', '⊢$x∈ℕ→$y∈ℕ→$x+$y=$y+$x'],
    ['.+a', '⊢$x∈ℕ→$y∈ℕ→$z∈ℕ→($x+$y)+$z=$x+($y+$z)'],
    ['.+e', '⊢$a∈ℕ→$b∈ℕ→$c∈ℕ→$a+$c=$b+$c→$a=$b'],
    ['.+=0', '⊢$x∈ℕ→$y∈ℕ→$x+$y=0→($x=0∧$y=0)'],
    ['.<=i', '⊢$x∈ℕ→$x≤$x'],
    ['.<=s', '⊢$x∈ℕ→$y∈ℕ→$x≤$y→$y≤$x→$x=$y'],
    ['.<=t', '$x∈ℕ,$y∈ℕ,$z∈ℕ,$x≤$y,$y≤$z⊢$x≤$z'],
    ['.<=+', '⊢$x∈ℕ→$y∈ℕ→$x≤$x+$y'],
    ['.+n<=', '⊢$x∈ℕ→$y∈ℕ→¬($x+S($y)≤$x)'],
    ['.<=|>=', '⊢$x∈ℕ→$y∈ℕ→($x≤$y∨$y≤$x)'],
    ['.0*', '⊢$x∈ℕ→0*$x=0'],
    ['.*@N', '⊢$x∈ℕ→$y∈ℕ→$x*$y∈ℕ'],
    ['.S*', '⊢$x∈ℕ→$y∈ℕ→S($x)*$y=($x*$y)+$y'],
    ['.*s', '⊢$x∈ℕ→$y∈ℕ→$x*$y=$y*$x'],
    ['.*+d', '⊢$x∈ℕ→$y∈ℕ→$z∈ℕ→$x*($y+$z)=($x*$y)+($x*$z)'],
    ['.+*d', '⊢$x∈ℕ→$y∈ℕ→$z∈ℕ→($x+$y)*$z=($x*$z)+($y*$z)'],
    ['.*a', '⊢$x∈ℕ→$y∈ℕ→$z∈ℕ→($x*$y)*$z=$x*($y*$z)'],
    ['.*=0', '⊢$x∈ℕ→$y∈ℕ→$x*S($y)=0→$x=0'],
    ['.*n=0', '⊢$x∈ℕ→$y∈ℕ→¬($x=0)→¬($y=0)→¬(($x*$y)=0)'],
    ['.*e', '⊢$x∈ℕ→$y∈ℕ→$z∈ℕ→$x*S($z)=$y*S($z)→$x=$y'],
]);

// Independent trust boundary: first-order logic plus PA, without ZFC or dS.
const primitives = String.raw`
apn1:ax:⊢0∈ℕ;
apn2:ax:⊢∀x:(x∈ℕ→S(x)∈ℕ);
apn3:ax:⊢∀x:¬S(x)=0;
apn4:ax:⊢∀x:∀y:(S(x)=S(y)→x=y);
apn5:ax:⊢#sb($P,$n,0)→(∀$n:($n∈ℕ→($P→#sb($P,$n,S($n))))→∀$n:($n∈ℕ→$P));
d+1:ax:⊢$x∈ℕ→$x+0=$x;
d+2:ax:⊢$x∈ℕ→$y∈ℕ→$x+S($y)=S($x+$y);
d*1:ax:⊢$x∈ℕ→$x*0=0;
d*2:ax:⊢$x∈ℕ→$y∈ℕ→$x*S($y)=$x*$y+$x;
d<=:ax:⊢∀x:∀y:(x∈ℕ→y∈ℕ→(x≤y↔∃z:(z∈ℕ∧x+z=y)));
`;
const logic = initialCreativeRules.split('{ [zh]ZFC集合论')[0];
assert.ok(logic.includes('.=s:') && !logic.includes('aext:'), 'isolate first-order logic');
function layerFor(input) {
    const layer = Object.create(HSLayer.prototype);
    layer.hilbertSystem = new HilbertSystem();
    layer.ruleList = [];
    layer.ruleListView = { refresh() {} };
    layer.addRules(input);
    return layer;
}
const parser = new HSParser();
const lines = peanoTheorems.split('\n').filter(line => line.trim());
assert.equal(lines.length, expected.size);
assert.equal(new Set(lines.map(line => line.slice(0, line.indexOf(':')))).size, expected.size);
assert.ok(!peanoTheorems.includes(':ax:'), 'every migrated theorem carries a proof');

function verify(layer, label) {
    const system = layer.hilbertSystem;
    for (const [name, text] of expected) {
        const rule = system.rules.get(name);
        assert.ok(rule, `${label}: ${name}`);
        assert.equal(rule.error, undefined, `${label}: ${name}: ${JSON.stringify(rule.error)}`);
        assert.ok(rule.step?.length, `${label}: ${name} has checked proof steps`);
        assert.equal(rule.assertions.length, 0, `${label}: ${name} has no extra side conditions`);
        const nodes = parser.parse(text, 'rule').nodes;
        const conclusion = nodes.pop();
        assert.ok(rule.conclusion.equal(conclusion), `${label}: ${name} preserves the old conclusion: actual ${rule.conclusion}; expected ${conclusion}`);
        assert.equal(rule.conditions.length, nodes.length, `${label}: ${name} preserves premise count`);
        nodes.forEach((condition, i) => assert.ok(rule.conditions[i].equal(condition), `${label}: ${name} premise ${i + 1}`));
    }
}

const isolated = layerFor(logic + primitives + peanoTheorems);
verify(isolated, 'pure PA');
const integrated = layerFor(initialCreativeRules);
verify(integrated, 'initial creative rules');
for (const [name, rule] of integrated.hilbertSystem.rules) {
    assert.equal(rule.error, undefined, `integrated rule ${name}: ${JSON.stringify(rule.error)}`);
}

// A true script attached to a false conclusion must fail replay.
const original = lines.find(line => line.startsWith('.0+:'));
isolated.addRules('.0+:⊢$0∈ℕ→0+$0=S($0);' + original.slice(original.indexOf(';') + 1));
assert.ok(isolated.hilbertSystem.rules.get('.0+').error, 'reject tampered theorem statement');

// Check that induction is used rather than stale theorem entries or an axiom fallback.
const withoutInduction = layerFor(logic + primitives.split('\n').filter(line => !line.startsWith('apn5:')).join('\n') + '\n' + peanoTheorems);
assert.ok(withoutInduction.hilbertSystem.rules.get('.0+').error, 'induction is required');
assert.equal(withoutInduction.hilbertSystem.rules.get('.=Si').error, undefined, 'non-inductive equality still works');
console.log(`Verified ${expected.size} exact Peano rules in isolated PA and initialCreativeRules; negative replay checks passed.`);
