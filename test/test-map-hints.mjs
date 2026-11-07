// Run after the normal TypeScript build: node test/test-map-hints.mjs.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mapData} from '../js/hy/map.js';
import {initMap, blockMap, nameMap} from '../js/hy/maploader.js';
import {Polygon} from '../js/hy/tiling.js';
import {HSLayer} from '../js/hs/main.js';
import {HilbertSystem} from '../js/hs/core/core.js';
import {HSParser} from '../js/hs/core/parser.js';
import {Assertion} from '../js/hs/core/assert.js';
import {NodeType} from '../js/asttype.js';
import {initialCreativeRules} from '../js/hs/core/initial.js';

const parse = (text, type = 'wff') => {
    const ast = new HSParser().parse(text, type);
    assert.ok(ast, text);
    assert.equal(ast.end, text.length, 'parse the complete expression');
    return ast;
};
const layer = Object.create(HSLayer.prototype);
Object.assign(layer, {hilbertSystem: new HilbertSystem(), ruleList: [], ruleListView: {refresh() {}}});
layer.addRules(initialCreativeRules);
const system = layer.hilbertSystem;
assert.deepEqual([...system.rules].filter(([, rule]) => rule.error), []);
const log = console.log;
try {console.log = () => {}; initMap(new Polygon(6, 4));} finally {console.log = log;}

const cases = [
    {name: 'qMapIffSubstitution',
        gate: '∀$x:($1↔$2)⊢#sb($1,$x,$y)↔#sb($2,$x,$y)',
        proof: '<a4 1 $y', nf: null},
    {name: 'qMapQuantifiedRename',
        gate: '#nf($1,$z)⊢∀$4:∃$3:∀$2:∃$0:∀$x:$1→∀$4:∃$3:∀$2:∃$0:∀$z:#sb($1,$x,$z)',
        proof: '>veve.\\acn $4 $3 $2 $0 $x $1 $z', nf: ['$1', '$z']},
    {name: 'qMapInduction',
        gate: '#nf($0,x)⊢#sb($0,$1,{})→(∀x:(x∈ω→(#sb($0,$1,x)→#sb($0,$1,x∪{x})))→∀x:(x∈ω→#sb($0,$1,x)))',
        proof: '.pn5 #sb($0,$1,x) x', nf: ['$0', 'x']},
];
const run = commands => system.fromCmd(commands.map(text => parse(text, 'cmd')));

test('all three migrated gates have checked proofs with the original premises and freshness assertions', () => {
    assert.ok(!mapData.includes('#rp'), 'no obsolete function or label remains');
    assert.ok(nameMap.has('port-rp'), 'keep the saved-map anchor');
    const reward = blockMap.get(nameMap.get('mnt'));
    assert.equal(reward.data.dstrTarget, 'port-rp');
    assert.equal(reward.data.dstr, '#sb');
    for (const {name, gate, proof, nf} of cases) {
        const wanted = parse(gate, 'rule');
        const tiles = [...blockMap.values()].filter(tile => tile.data?.d && typeof tile.text === 'string'
            && tile.text.includes('#sb(') && parse(tile.text, 'rule').equal(wanted));
        assert.equal(tiles.length, 1, 'actual map has exactly one matching gate');
        const target = parse(tiles[0].text, 'rule');
        system.clear();
        assert.equal(layer.checkRuleGate(target), false, 'the closed induction builtin does not bypass this gate');
        run([...target.nodes.slice(0, -1).map(ast => 'hyp ' + ast), proof]);
        const result = system.checkConclusionInPropList();
        assert.ok(result.conclusion.equal(target.nodes.at(-1)), 'compare proof ASTs, not just rendered text');
        assert.ok(parse(result.conclusion.toString()).equal(result.conclusion));
        if (nf) {
            assert.equal(result.conditions.length, 0);
            assert.deepEqual(result.asserts.map(a => [a.type, a.name, [...a.vs], [...a.qs]]),
                [['nf', nf[0], [nf[1]], []]], 'preserve the original nf, without new side conditions');
        } else {
            assert.equal(result.asserts.length, 0);
            assert.equal(result.conditions.length, 1);
            assert.ok(result.conditions[0].equal(target.nodes[0]));
        }
        system.m(name);
        assert.ok(system.rules.get(name).step.length);
        assert.equal(layer.checkRuleGate(target), true);
    }
});

test('induction expands to a noncircular proof and requires the original nf for symbolic substitution', () => {
    system.clear();
    run(['hyp #nf($0,x)', cases[2].proof]);
    const wanted = parse(cases[2].gate, 'rule').nodes.at(-1);
    assert.ok(system.checkConclusionInPropList().conclusion.equal(wanted));
    system.expand(system.props.at(-1));
    const commands = system.genCmd(system.props);
    const fresh = new HilbertSystem();
    fresh.rules = new Map(system.rules);
    fresh.rules.delete('.pn5');
    fresh.rules.delete('qMapInduction');
    fresh.fromCmd(commands.map(text => parse(text, 'cmd')));
    assert.ok(fresh.checkConclusionInPropList().conclusion.equal(wanted));
    system.clear();
    run([cases[2].proof]);
    assert.ok(!system.checkConclusionInPropList().conclusion.equal(wanted));
});

test('compound replacement is represented by a fresh-variable formula template, preserving the induction instance', () => {
    // Old #rp(S(z)=S(z),S(z),u) has context P(t)=t=t. #sb substitutes
    // the variable t in this context, retaining both original occurrences.
    for (const term of ['{}', 'x', 'x∪{x}']) {
        const ast = parse(`#sb(t=t,t,${term})`);
        Assertion.reduceSbFn([], ast);
        assert.ok(ast.equal(parse(`(${term})=(${term})`)));
    }
    system.clear();
    run(['qMapInduction t=t t']);
    const result = system.checkConclusionInPropList();
    assert.equal(result.asserts.length, 0);
    assert.equal(result.conditions.length, 0);
    assert.ok(result.conclusion.equal(parse('{}={}→(∀x:(x∈ω→(x=x→x∪{x}=x∪{x})))→∀x:(x∈ω→x=x)')));
});

test('substitution keeps bound sources and rejects capture', () => {
    for (const [source, expected] of [['x', '∀y:(z=y)'], ['y', '∀y:(x=y)']]) {
        const ast = parse(`#sb(∀y:(x=y),${source},z)`);
        Assertion.reduceSbFn([], ast);
        assert.ok(ast.equal(parse(expected)));
    }
    assert.throws(() => Assertion.reduceSbFn([], parse('#sb(∀y:(x=y),x,y)')));
});

test('bilingual rule examples resolve and the quantified gate has the intended outer implication', () => {
    const target = parse(cases[1].gate, 'rule').nodes.at(-1);
    assert.equal(target.type, NodeType.LOGIC);
    assert.equal(target.name, '>');
    assert.equal(target.nodes[0].type, NodeType.QUANT);
    for (const name of ['<a1(a7)', 'c.t(<a1)', 'c.t(#,<a1)', 'c.t(<a1,#)', '<(<a2(<a1))', '>veve.\\acn']) {
        const rule = system.getD(parse(name, 'dname'));
        assert.ok(rule.step?.length, name);
        assert.ok(parse(rule.toString(), 'rule').nodes.at(-1).equal(rule.conclusion));
    }
    const templateHint = [...blockMap.values()].find(tile => tile.text?.en?.includes('For compound terms'));
    assert.ok(templateHint?.text.zh.includes('复合项'));
    assert.ok(templateHint.text.en.includes('t=t'));
});
