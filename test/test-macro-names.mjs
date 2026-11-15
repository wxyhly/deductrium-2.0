import assert from 'node:assert/strict';
import {test} from 'node:test';
import {HilbertSystem} from '../js/hs/core/core.js';
import {Deduction} from '../js/hs/core/deduction.js';
import {HSParser} from '../js/hs/core/parser.js';
import {HSLayer} from '../js/hs/main.js';
import {getCommand} from '../js/hs/gui/cmdmgr.js';
import {findTargets, targetList} from '../js/hs/targets.js';
import {planDeletion, deleteSelection} from '../js/hs/editing.js';
import {Serde} from '../js/hs/serde.js';

const parser = new HSParser();
const parse = (text, type = 'cmd') => parser.parse(text, type);
function fixture() {
    const system = new HilbertSystem();
    system.rules.set('a7', new Deduction(new Set(), parse('a7', 'dname'), [], [], parse('$A=$A', 'wff')));
    system.fromCmd([parse('a7 $A')]);
    return system;
}
function sameProof(system) {
    const context = system.saveContext();
    const steps = context.props.slice();
    const commands = system.genCmd();
    const rules = [...system.rules];
    return () => {
        assert.equal(system.props, context.props);
        assert.deepEqual(system.props, steps);
        assert.deepEqual(system.genCmd(), commands);
        assert.deepEqual([...system.rules], rules);
    };
}

test('recording parameters retain the whole requested name instead of a compound AST name', () => {
    for (const name of ['mp(mp)', 'z(mp)', 'sGood extra', 'sGood,other', 'sGood:other']) {
        const text = `m  ${name}  `;
        assert.equal(parse(text).nodes[0].name, name);
        assert.equal(parser.getTokens().map(token => token.displayText).join(''), text);
    }
});

test('the kernel rejects empty, compound and truncated names without consuming the proof', () => {
    for (const name of ['', ' ', 'z(mp)', 'mp(mp)', 'sGood extra', '(sGood)', 'sGood,other',
        'sGood:other', 'sGood;clear', 'sGood\nclear', 'sGood\r', '{folder', '}']) {
        const system = fixture();
        const unchanged = sameProof(system);
        assert.throws(() => system.m(name), error => error.type === 'invalidRuleName', JSON.stringify(name));
        unchanged();
    }
});

test('inline and prompted recording reject invalid names and allow a valid retry', async () => {
    const system = fixture();
    const layer = Object.assign(Object.create(HSLayer.prototype), {
        hilbertSystem: system, ruleList: [], activeRuleFolder: null,
        cmdInput: {setParserArgs() {}},
        propListView: {refresh() {}}, ruleListView: {refresh() {}},
    });
    layer.unlockBasicRuleCmd('m');
    const command = getCommand('m');
    const unchanged = sameProof(system);
    for (const name of ['mp(mp)', 'z(mp)', 'sGood extra']) {
        await assert.rejects(command.execute(parse(`m ${name}`).nodes), error => error.type === 'invalidRuleName');
        const result = command.getNextParam([]).parse(name);
        assert.equal(result.success, false);
        assert.equal(result.error.type, 'invalidRuleName');
        unchanged();
        assert.equal(layer.ruleList.length, 0);
    }
    const result = command.getNextParam([]).parse('sGood');
    assert.equal(result.success, true);
    await command.execute([result.value]);
    assert.equal(system.props.length, 0);
    assert.deepEqual(layer.ruleList.map(node => node.name), ['sGood']);
    assert.equal(system.rules.get('sGood').name.name, 'sGood');
    assert.equal(system.rules.has(''), false);
});

test('raw command replay rejects malformed names and ordinary names still record and apply', () => {
    for (const name of ['mp(mp)', 'z(mp)', 'sGood extra']) {
        const system = fixture();
        const unchanged = sameProof(system);
        assert.throws(() => system.fromCmd([parse(`m ${name}`)]), error => error.type === 'invalidRuleName');
        unchanged();
    }
    for (const name of ['s1', 's_name', 's+1', '规则名']) {
        const system = fixture();
        system.fromCmd([parse(`m ${name}`), parse(`d ${name} y`)]);
        assert.equal(system.props[0].ast.toString(), 'y=y');
        assert.equal(system.rules.get(name).name.name, name);
    }
});

test('renaming uses the same validation and preserves aliases and references on failure', () => {
    const system = fixture();
    system.m('sGood');
    system.fromCmd([parse('d sGood y')]);
    for (const name of ['', 'z(mp)', 'sGood extra', '{folder']) {
        const unchanged = sameProof(system);
        assert.throws(() => system.renameD('sGood', name), error => error.type === 'invalidRuleName');
        unchanged();
        assert.equal(system.props[0].from.data.deduction.name, 'sGood');
        assert.equal(system.rules.get('sGood').name.name, 'sGood');
    }
    assert.throws(() => system.renameD('sGood', 'mp'), error => error.type === 'invalidRuleNameStartsWith');
    system.renameD('sGood', 'sNew');
    assert.equal(system.rules.get('sNew').name.name, 'sNew');
    system.renameDnameInProps(system.props, 'sGood', 'sNew');
    assert.equal(system.props[0].from.data.deduction.name, 'sNew');
});

test('an explicitly quoted empty target can delete a legacy nameless macro without selecting an unnamed step', () => {
    const system = fixture();
    const macro = system.m('sLegacy');
    // Simulate a rule already created by the old m mp(mp) bug.
    system.rules.delete('sLegacy');
    macro.name.name = '';
    system.rules.set('', macro);
    system.fromCmd([parse('a7 y')]);
    assert.equal(system.props[0].name, '');
    assert.deepEqual(targetList('""'), ['']);
    assert.throws(() => targetList(''));
    assert.deepEqual(findTargets(system, [], '', 'del'), [{kind: 'macro', name: ''}]);
    const step = system.props[0];
    deleteSelection(system, planDeletion(system, [], targetList('""')), [system.saveContext()]);
    assert.equal(system.rules.has(''), false);
    assert.deepEqual(system.props, [step]);
});

test('prompted deletion preserves quoted lists until target selection decodes them once', () => {
    const layer = Object.assign(Object.create(HSLayer.prototype), {cmdInput: {setParserArgs() {}}});
    layer.unlockEditingCommands();
    const request = getCommand('del').getNextParam([]);
    for (const text of ['""', '"sOne","sTwo"', '"sOne,sTwo"', '"a\\\"b",sOther']) {
        const parsed = request.parse(text);
        assert.equal(parsed.success, true);
        assert.equal(parsed.value.name, text);
    }
    assert.deepEqual(targetList('"sOne","sTwo"'), ['sOne', 'sTwo']);
    assert.deepEqual(targetList('"sOne,sTwo"'), ['sOne,sTwo']);
    assert.deepEqual(targetList('"a\\\"b",sOther'), ['a"b', 'sOther']);
    for (const text of ['sOne,', '"unterminated', '"sOne" "sTwo"']) assert.throws(() => targetList(text));
});

test('restoring old builtin aliases preserves legacy names while new renames remain validated', () => {
    const builtin = 'a7:ax:⊢$A=$A\n.old:⊢$A=$A;a7 $A';
    for (const name of ['', 'z space', 'z(mp)']) {
        const system = new HilbertSystem();
        const view = {idCounter: 1, refresh() {}};
        const layer = Object.assign(Object.create(HSLayer.prototype), {
            hilbertSystem: system, ruleList: [], ruleListView: view,
        });
        const serde = new Serde(layer, system, layer.ruleList, view, view);
        const aliases = [['a7', 'a7'], ['.old', name]];
        serde.deserializeRulelist(`(1)a7:ax:.\n(2)${name}:⊢$A=$A;a7 $A`, builtin, aliases);
        assert.equal(system.rules.get(name)?.name.name, name);
        assert.equal(system.rules.get(name)?.error, undefined);
        assert.equal(system.getSysRuleName('.old'), name);
        const saved = serde.serializeRulelist();
        serde.deserializeRulelist(saved, builtin, aliases);
        assert.equal(system.rules.get(name)?.error, undefined);
        assert.equal(system.getSysRuleName('.old'), name);
        assert.throws(() => system.renameD(name, 'z(other)'), error => error.type === 'invalidRuleName');
        system.renameD(name, 'sRecovered');
        assert.equal(system.getSysRuleName('.old'), 'sRecovered');
    }
});
