import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { HSLayer } from '../js/hs/main.js';
import { Serde } from '../js/hs/serde.js';

function restore(r, cmds = '') {
    const layer = Object.create(HSLayer.prototype);
    const hs = layer.hilbertSystem = new HilbertSystem();
    layer.ruleList = [];
    layer.navigator = { close() {} };
    layer.ruleListView = { refresh() {} };
    layer.propListView = { refresh() {}, setData() {} };
    layer.sheetGui = { sheets: [], restoreExpanded() {}, render() {} };
    layer.serde = new Serde(layer, hs, layer.ruleList, layer.propListView, layer.ruleListView);
    layer.deserialize({ r, s: { sheets: [{ name: 'Proof', cmds }], activeIndex: 0 }, ri: 10, re: [7] });
    return { layer, hs };
}

const axioms = `(7){Axioms
(2)a1:ax:.
(3)a2:ax:.
(1)mp:ax:$1→$2,$1⊢$2
}`;
const identity = '(6)si:⊢$0→$0;a1 $0 $0;a1 $0 $0→$0;a2 $0 $0→$0 $0;mp 3 2;mp 4 1';

test('restores si before its axioms and expands it without changing the rule tree', () => {
    const { layer, hs } = restore(`${identity}\n${axioms}`, 'si A');
    assert.equal(hs.rules.get('a1').toString(), '⊢$1→$2→$1');
    assert.equal(hs.rules.get('si').error, undefined);
    assert.equal(hs.props.at(-1).ast.toString(), 'A→A');
    hs.expand(hs.props.at(-1));
    assert.equal(hs.props.at(-1).ast.toString(), 'A→A');
    assert.equal(hs.props.length, 5);
    assert.deepEqual(layer.ruleList, [
        { name: 'si', uuid: 6 },
        { name: 'Axioms', uuid: 7, children: [
            { name: 'a1', uuid: 2 }, { name: 'a2', uuid: 3 }, { name: 'mp', uuid: 1 },
        ] },
    ]);
    assert.deepEqual([...layer.ruleListView.expandedFolders], [7]);
});

test('restores forward macro dependencies and still rejects unresolved proofs', () => {
    const { hs } = restore(`(8)outer:⊢$0→$0;inner $0
(9)inner:⊢$0→$0;si $0
${identity}
(10)missing:⊢$0→$0;notFound $0
(11)self:⊢$0→$0;self $0
(12)cycleA:⊢$0→$0;cycleB $0
(13)cycleB:⊢$0→$0;cycleA $0
(14)mismatch:⊢$0;a1 $0 $0
${axioms}`);
    hs.fromCmd([new HSParser().parse('outer A', 'cmd')]);
    for (const dependency of ['inner', 'si']) {
        hs.expand(hs.props.at(-1));
        assert.equal(hs.props.at(-1).from.data.deduction.toString(), dependency);
    }
    assert.deepEqual(hs.rules.get('missing').error.cause, { type: 'dname404', ruleName: 'notFound' });
    assert.equal(hs.rules.get('mismatch').error.cause.type, 'replayConclusionMismatch');
    for (const name of ['missing', 'self', 'cycleA', 'cycleB', 'mismatch']) {
        const rule = hs.rules.get(name);
        assert.ok(rule.error, name);
        assert.equal(rule.step, undefined, name);
        assert.throws(() => hs.d(rule, [], {}),
            error => error.type === 'deductFail' && error.cause.cause.type === 'errRuleUsed');
    }
});
