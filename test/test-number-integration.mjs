// Compile this checkout first, then: node test/test-number-integration.mjs
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { test } from 'node:test';
import { NodeType } from '../js/asttype.js';
import { LangMgr } from '../js/lang.js';
import { HSLayer } from '../js/hs/main.js';
import { Serde } from '../js/hs/serde.js';
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { initialCreativeRules } from '../js/hs/core/initial.js';
import { getNumberLiteralDefinition } from '../js/hs/core/number-literals.js';
import { getCommand } from '../js/hs/gui/cmdmgr.js';

function parse(text, type) {
    const ast = new HSParser().parse(text, type);
    assert.ok(ast, `${type}: ${text}`);
    assert.equal(ast.end, text.length, `must consume the entire ${type}: ${text}`);
    return ast;
}

// Stub only rendering; use the production loader, parser, kernel and serializer.
function layerWith(text = initialCreativeRules) {
    const layer = Object.create(HSLayer.prototype);
    layer.hilbertSystem = new HilbertSystem();
    layer.ruleList = [];
    layer.ruleListView = { refresh() {} };
    layer.propListView = { refresh() {} };
    const language = LangMgr.lang;
    try {
        LangMgr.lang = 'zh';
        if (text) layer.addRules(text);
    } finally {
        LangMgr.lang = language;
    }
    return layer;
}

const declarations = initialCreativeRules.split('\n').map(line => line.trim())
    .filter(line => line && !/^(\/\/|[{}])/.test(line))
    .map(line => {
        const colon = line.indexOf(':');
        assert.ok(colon > 0, `invalid initial rule line: ${line}`);
        return { name: line.slice(0, colon), axiom: line.slice(colon + 1).startsWith('ax:'), line };
    });

function assertNoErrors(system, label) {
    const errors = [...system.rules].filter(([, rule]) => rule.error)
        .map(([name, rule]) => `${name}: ${inspect(rule.error.cause, { depth: 8 })}`);
    assert.deepEqual(errors, [], `${label}: every rule, including newly added static proofs, must load`);
}

function folderAt(nodes, ...path) {
    let node;
    for (const name of path) {
        const matches = nodes.filter(n => n.name === name && n.children);
        assert.equal(matches.length, 1, `unique folder: ${path.join('/')}`);
        node = matches[0];
        nodes = node.children;
    }
    return node;
}

function leaves(nodes) {
    return nodes.flatMap(n => n.children ? leaves(n.children) : [n]);
}

function replay(system, commands) {
    system.fromCmd(commands.map(cmd => parse(cmd, 'cmd')));
}

function checkClosed(system, conclusion) {
    const result = system.checkConclusionInPropList();
    assert.equal(result.asserts.length, 0, 'no unproved assertions');
    assert.equal(result.conditions.length, 0, 'no unproved hypotheses');
    assert.ok(result.conclusion.equal(parse(conclusion, 'wff')), `expected ${conclusion}, got ${result.conclusion}`);
}

const arithmetic = [
    ['.0@N', '0∈ℕ'], ['.3@N', '3∈ℕ'], ['.2+3', '2+3=5'], ['.2*3', '2*3=6'],
];

test('complete initialCreativeRules loads through real HSLayer.addRules without error placeholders', t => {
    const layer = layerWith('');
    const system = layer.hilbertSystem;
    replay(system, ['hyp P']);
    const context = system.saveContext();
    layer.addRules(initialCreativeRules);
    assert.equal(system.props, context.props, 'loading must restore the current proof context');
    assert.deepEqual(system.genCmd(), ['hyp P']);
    assertNoErrors(system, 'initialCreativeRules');
    t.diagnostic(`${declarations.length} static rules; ${declarations.filter(d => !d.axiom).length} derived proofs`);
    assert.equal(new Set(declarations.map(d => d.name)).size, declarations.length, 'unique static rule names');
    assert.deepEqual(leaves(layer.ruleList).map(n => n.name), declarations.map(d => d.name), 'all static entries, in order');
    for (const { name, axiom } of declarations) {
        const rule = system.rules.get(name);
        assert.ok(rule, `registered static rule: ${name}`);
        if (!axiom) assert.ok(rule.step?.length, `${name}: a derived rule must carry checked proof steps`);
    }
});

test('Chinese number folders and stable primitive names are present', () => {
    const layer = layerWith();
    const nodes = layer.ruleList;
    const contains = (path, names) => {
        const found = new Set(leaves(folderAt(nodes, ...path).children).map(n => n.name));
        for (const name of names) assert.ok(found.has(name), `${path.join('/')}: ${name}`);
    };
    contains(['皮亚诺算数', '公理'], ['apn1', 'apn2', 'apn3', 'apn4', 'apn5']);
    contains(['皮亚诺算数', '符号定义', '1-10定义'], Array.from({ length: 10 }, (_, i) => `d${i + 1}`));
    contains(['皮亚诺算数', '符号定义'], ['d+1', 'd+2', 'd*1', 'd*2', 'd<=', 'd>=', 'd/|', 'dPrime']);
    const theorems = leaves(folderAt(nodes, '皮亚诺算数', '定理').children);
    assert.ok(theorems.length, 'Peano theorem folder is populated');
    for (const { name } of theorems) assert.ok(layer.hilbertSystem.rules.get(name)?.step?.length, `${name}: theorem, not axiom`);
    contains(['数系', '自然数'], ['d0', 'dS', 'dN']);
    contains(['数系', '整数'], ['dfZ', 'dZ', 'dZ+', 'dZ-', 'dZ*', 'dZ<=']);
    contains(['数系', '有理数'], ['dfQ', 'dQ', 'dQ+', 'dQ-', 'dQ*', 'dQ/', 'dQ<=']);
    contains(['数系', '实数'], ['ddkCut', 'dR', 'dR+', 'dR-', 'dR*1', 'dR*2', 'dR/1', 'dR/2', 'dR<=']);
});

test('dynamic definitions require their own number-system prerequisite', () => {
    const gates = ['apn1', 'dZ', 'dQ', 'dR'];
    const cases = [
        ['apn1', 'd37', '37=S(36)'],
        ['dZ', 'dZ+37', '+37=Z((37,0))'],
        ['dZ', 'dZ-37', '-37=Z((0,37))'],
        ['dQ', 'dQ37', '37q=Q((+37,+1))'],
        ['dQ', 'd-37q', '-37q=Q((-37,+1))'],
        ['dQ', 'dQ0.125', '0.125=Q((+125,+1000))'],
        ['dR', 'dR37', '37r={x∈ℚ|x≤37q∧¬(x=37q)}'],
        ['dR', 'd-37r', '-37r={x∈ℚ|x≤-37q∧¬(x=-37q)}'],
        ['dR', 'd0.125r', '0.125r={x∈ℚ|x≤0.125∧¬(x=0.125)}'],
    ];
    for (const [gate, name, expected] of cases) {
        const layer = layerWith('');
        const system = layer.hilbertSystem;
        const get = () => system.getD(parse(name, 'dname'));
        const missingRule = error => error?.type === 'dname404' && error.ruleName === name;
        assert.throws(get, missingRule, `${name}: unavailable in an empty system`);
        assert.equal(system.rules.has(name), false, `${name}: failed lookup must not cache a rule`);
        for (const other of gates.filter(g => g !== gate)) {
            const declaration = declarations.find(d => d.name === other);
            assert.ok(declaration, `initial prerequisite ${other}`);
            layer.addRules(declaration.line);
        }
        assert.throws(get, missingRule, `${name}: unrelated systems must not unlock it`);
        assert.equal(system.rules.has(name), false);
        layer.addRules(declarations.find(d => d.name === gate).line);
        assertNoErrors(system, name);
        const rule = get();
        assert.equal(rule.error, undefined, name);
        assert.equal(rule.conditions.length, 0, name);
        assert.equal(rule.assertions.length, 0, name);
        assert.ok(rule.conclusion.equal(parse(expected, 'wff')), `${name}: ${rule}`);
        assert.equal(get(), rule, `${name}: repeated lookup uses the registered definition`);
        assert.ok(getNumberLiteralDefinition(name), `${name}: recognized definition`);
        replay(system, [`d ${name}`]);
        checkClosed(system, expected);
    }
});

test('approved number-system corrections and the original Prime boundary are preserved', () => {
    const system = layerWith().hilbertSystem;
    const expected = {
        'dR/1': '∀x:∀y:(x∈ℝ→y∈ℝ→0q∈x→y/x=y*{z∈ℚ|z≤0q∨∃m:(m∈ℚ＼x∧¬m≤0q∧z≤1q/m∧¬z=1q/m)})',
        'dR/2': '∀x:∀y:(x∈ℝ→y∈ℝ→¬y=0r→x/(0r-y)=0r-x/y)',
        'dQ<=': '$x∈ℤ×(ℤ＼{+0})→$y∈ℤ×(ℤ＼{+0})→pr2($x)*pr2($y)≥+0→(Q($x)≤Q($y)↔pr1($x)*pr2($y)≤pr2($x)*pr1($y))',
        dPrime: '∀n:(Prime(n)↔n∈ℕ∧¬∃x:(x∈ℕ∧¬x=1∧¬x=n∧∃y:(y∈ℕ∧x*y=n)))',
    };
    for (const [name, formula] of Object.entries(expected)) {
        assert.ok(system.rules.get(name).conclusion.equal(parse(formula, 'wff')), name);
    }
});

test('natural membership and arithmetic carry proof steps and genCmd replays in a fresh system', () => {
    const system = layerWith().hilbertSystem;
    replay(system, ['hyp P']);
    const original = system.saveContext();
    for (const [name, conclusion] of arithmetic) {
        const rule = system.getD(parse(name, 'dname'));
        assert.equal(rule.error, undefined, name);
        assert.ok(rule.step?.length, `${name}: generated proof must not be an axiom`);
        assert.equal(rule.conditions.length, 0, name);
        assert.equal(rule.assertions.length, 0, name);
        assert.equal(system.props, original.props, `${name}: proof generation restores context`);
        assert.deepEqual(system.genCmd(), ['hyp P']);
        const commands = system.genCmd(rule.step);
        assert.ok(commands.length, name);
        const fresh = layerWith().hilbertSystem;
        // Replaying the body must not be a circular invocation of the result.
        assert.ok(!commands.some(cmd => parse(cmd, 'cmd').nodes[0]?.name === name), `${name}: noncircular proof body`);
        replay(fresh, commands);
        checkClosed(fresh, conclusion);
        assert.deepEqual(fresh.genCmd(), commands, `${name}: stable command serialization`);
    }
    for (const name of ['.1001@N', '.501+500', '.33*31', '.9007199254740993@N']) {
        assert.throws(() => system.getD(parse(name, 'dname')), /1000-successor budget/, name);
        assert.equal(system.rules.has(name), false, `${name}: rejected proof must not be registered`);
        assert.equal(system.props, original.props, `${name}: budget failure preserves context`);
        assert.deepEqual(system.genCmd(), ['hyp P']);
    }
});

test('real Serde rule-list round trip preserves folders, proofs and regenerates command-only numeric rules', () => {
    const layer = layerWith();
    const system = layer.hilbertSystem;
    const sum = system.getD(parse('.2+3', 'dname'));
    layer.addRules(`numberMigrationSum:⊢2+3=5;${system.genCmd(sum.step).join(';')};`);
    assertNoErrors(system, 'before save');
    const commands = ['d d37', 'd dZ-37', 'd dQ0.125', 'd dR37',
        ...arithmetic.map(([name]) => `d ${name}`), 'd numberMigrationSum'];
    replay(system, commands);
    const savedCommands = system.genCmd();
    const expected = system.props.map(p => p.ast.clone());
    let uuid = 1;
    const assignIds = nodes => nodes.forEach(n => { n.uuid = uuid++; if (n.children) assignIds(n.children); });
    assignIds(layer.ruleList); // Normally assigned by the real tree viewer during rendering.
    const tree = structuredClone(layer.ruleList);
    const serde = new Serde(layer, system, layer.ruleList, layer.propListView, layer.ruleListView);
    const data = serde.serializeRulelist();
    assert.match(data, /\(\d+\)apn1:ax:\./, 'static axioms use init placeholders');
    assert.match(data, /\(\d+\)numberMigrationSum:⊢/, 'user proof is included');
    for (const name of ['d37', 'dZ-37', 'dQ0.125', 'dR37', ...arithmetic.map(([name]) => name)]) {
        assert.ok(!leaves(layer.ruleList).some(n => n.name === name), `${name}: generated cache is outside the rule list`);
    }
    const restored = layerWith('');
    const loaded = restored.hilbertSystem;
    const loader = new Serde(restored, loaded, restored.ruleList, restored.propListView, restored.ruleListView);
    loader.deserializeRulelist(data);
    assertNoErrors(loaded, 'after Serde.deserializeRulelist');
    assert.deepEqual(restored.ruleList, tree, 'folder nesting, names, order and UUIDs survive');
    for (const { name, axiom } of declarations) {
        assert.equal(loaded.rules.get(name).toString(), system.rules.get(name).toString(), `${name}: statement survives`);
        if (!axiom) assert.ok(loaded.rules.get(name).step?.length, `${name}: proof survives`);
    }
    assert.ok(loaded.rules.get('numberMigrationSum').step?.length, 'user proof replays on load');
    for (const name of ['d37', 'dZ-37', 'dQ0.125', 'dR37']) {
        assert.equal(loaded.rules.has(name), false, `${name}: not accidentally persisted as an axiom`);
    }
    assert.equal(loaded.props.length, 0, 'rule loading leaves the sheet empty');
    replay(loaded, savedCommands);
    assert.equal(loaded.props.length, expected.length);
    loaded.props.forEach((p, i) => assert.ok(p.ast.equal(expected[i]), `restored command ${i + 1}`));
    assert.deepEqual(loaded.genCmd(), savedCommands, 'regenerated commands are stable');
    for (const [name] of arithmetic) assert.ok(loaded.rules.get(name)?.step?.length, `${name}: regenerated checked proof`);
    assert.equal(loader.serializeRulelist(), data, 'stable save after regeneration');
});

test('parser preserves signed numeric atoms and division precedence', () => {
    const atom = name => [NodeType.ATOM_ITEM, name];
    const fn = (name, ...args) => [NodeType.FN, name, ...args];
    const shape = ast => [ast.type, ast.name, ...ast.nodes.map(shape)];
    for (const literal of ['+1', '-1', '-1q']) {
        const ast = parse(literal, 'item');
        assert.deepEqual(shape(ast), atom(literal));
        assert.equal(ast.toString(), literal);
        const equality = parse(`${literal}=${literal}`, 'wff');
        assert.deepEqual(shape(equality), [NodeType.PRED, '=', atom(literal), atom(literal)]);
    }
    for (const [text, expected] of [
        ['1q+2q/3q', fn('+', atom('1q'), fn('/', atom('2q'), atom('3q')))],
        ['1q/2q*3q', fn('*', fn('/', atom('1q'), atom('2q')), atom('3q'))],
        ['1q*2q/3q', fn('/', fn('*', atom('1q'), atom('2q')), atom('3q'))],
        ['1q/2q/3q', fn('/', fn('/', atom('1q'), atom('2q')), atom('3q'))],
        ['(1q+2q)/3q', fn('/', fn('+', atom('1q'), atom('2q')), atom('3q'))],
        ['-1q/+1', fn('/', atom('-1q'), atom('+1'))],
    ]) {
        const ast = parse(text, 'item');
        assert.deepEqual(shape(ast), expected, text);
        assert.deepEqual(shape(parse(ast.toString(), 'item')), expected, `${text}: stringify round trip`);
    }
});

test('signed replacement parameters survive command and saved-rule replay', () => {
    for (const literal of ['-2', '+2', '-2q', '-2r']) {
        const layer = layerWith();
        const system = layer.hilbertSystem;
        replay(system, ['hyp ∀x:x=x', `d <a4 1 (${literal})`]);
        const expected = system.props.at(-1).ast.clone();
        const commands = system.genCmd();
        system.loadContext(system.createEmptyContext());
        replay(system, commands);
        assert.ok(system.props.at(-1).ast.equal(expected), `${literal}: command replay`);
        assert.deepEqual(system.genCmd(), commands, `${literal}: stable commands`);
        layer.addRules(`signedReplay:∀x:x=x⊢${literal}=${literal};${commands.join(';')};`);
        assert.equal(system.rules.get('signedReplay').error, undefined, `${literal}: saved rule replay`);
        assert.ok(system.rules.get('signedReplay').step?.length);
        const serde = new Serde(layer, system, layer.ruleList, layer.propListView, layer.ruleListView);
        const saved = serde.serializeRulelist();
        const restored = layerWith('');
        const loader = new Serde(restored, restored.hilbertSystem, restored.ruleList, restored.propListView, restored.ruleListView);
        loader.deserializeRulelist(saved);
        assertNoErrors(restored.hilbertSystem, `${literal}: loaded signed rule`);
        assert.ok(restored.hilbertSystem.rules.get('signedReplay').step?.length);
    }
});

test('replacement image terms remain distinct from class binders through serialization', () => {
    for (const text of ['{(x)|y∈A}', '{($B)|$x∈$C}', '{(S(x))|y∈A}']) {
        const ast = parse(text, 'item');
        assert.equal(ast.type, NodeType.RPL, text);
        assert.ok(parse(ast.toString(), 'item').equal(ast), `${text}: replacement round trip`);
    }
    const ordinaryClass = parse('{x|y∈A}', 'item');
    assert.equal(ordinaryClass.type, NodeType.CLASS);
    assert.ok(parse(ordinaryClass.toString(), 'item').equal(ordinaryClass));
    const system = layerWith().hilbertSystem;
    assert.equal(system.rules.get('drepl').conclusion.nodes[0].nodes[1].type, NodeType.RPL);
    replay(system, ['drepl (a,b) (x,b) x ℕ']);
    assert.ok(system.props[0].ast.toString().includes('(x,b)'));
});

test('d-leading rule names survive shorthand, explicit commands and genCmd round trips', () => {
    const system = layerWith().hilbertSystem;
    for (const [name, values] of [
        ['d+1', '0'], ['d+2', '0 1'], ['d*1', '0'], ['d*2', '0 1'],
        ['d/|', ''], ['d-37q', ''], ['dZ-37', ''],
        ['d{}', ''], ['d{..}', '0 1 2'],
    ]) {
        const shortText = `${name} ${values}`.trimEnd();
        const explicit = parse(`d ${shortText}`, 'cmd');
        const shorthand = parse(shortText, 'cmd');
        assert.equal(shorthand.name, 'd', shortText);
        assert.equal(shorthand.nodes[0].toString(), name, `${name}: keep the leading d`);
        assert.ok(shorthand.equal(explicit), `${name}: shorthand and explicit application agree`);
        system.loadContext(system.createEmptyContext());
        system.fromCmd([explicit]);
        const expected = system.props[0].ast.clone();
        const commands = system.genCmd();
        assert.equal(commands.length, 1, name);
        const saved = parse(commands[0], 'cmd');
        assert.equal(saved.nodes[0].toString(), name, `${name}: serialized rule identity`);
        assert.ok(saved.equal(shorthand), `${name}: serialized arguments`);
        system.loadContext(system.createEmptyContext());
        replay(system, commands);
        assert.equal(system.props.length, 1, name);
        assert.ok(system.props[0].ast.equal(expected), `${name}: replayed conclusion`);
        assert.deepEqual(system.genCmd(), commands, `${name}: stable serialization`);
    }
    // Parentheses remain a separator for explicit d commands.
    const ordinary = parse('d a7 S(0)', 'cmd');
    for (const text of ['d(a7) S(0)', 'd (a7) S(0)']) {
        const command = parse(text, 'cmd');
        assert.equal(command.name, 'd', text);
        assert.equal(command.nodes[0].toString(), 'a7', text);
        assert.ok(command.nodes[1].equal(ordinary.nodes[1]), `${text}: preserved function argument`);
        system.loadContext(system.createEmptyContext());
        system.fromCmd([command]);
        checkClosed(system, 'S(0)=S(0)');
    }
});

test('d a7 S(0) works in command and expected-item paths; relations cannot become items', async () => {
    const layer = layerWith();
    const system = layer.hilbertSystem;
    const cmd = parse('d a7 S(0)', 'cmd');
    // The command parser starts ambiguous calls as predicates; d knows a7 needs an item.
    assert.equal(cmd.nodes[1].name, 'S');
    system.fromCmd([cmd]);
    checkClosed(system, 'S(0)=S(0)');
    const commands = system.genCmd();
    system.loadContext(system.createEmptyContext());
    replay(system, commands);
    checkClosed(system, 'S(0)=S(0)');

    layer.cmdInput = { setParserArgs() {} };
    layer.cmdUIMgr = { insertText() {} };
    layer.unlockBasicPropCmd();
    const command = getCommand('d');
    assert.ok(command);
    const args = [parse('a7', 'dname')];
    const request = command.getNextParam(args, false);
    assert.ok(request, 'a7 requests its item argument');
    const value = request.parse('S(0)');
    assert.equal(value.success, true, inspect(value));
    assert.equal(value.value.type, NodeType.FN, 'expected-item parsing produces a function');
    assert.doesNotThrow(() => value.value.checkITEM());
    assert.equal(command.getNextParam([...args, value.value], false), null);
    await command.execute([...args, value.value]);
    checkClosed(system, 'S(0)=S(0)');

    for (const relation of ['x=y', 'x∈ℕ', 'x≤y', 'x≥y', 'x∣y', 'x⊂y', 'x＜y', 'x＞y']) {
        const ast = parse(relation, 'wff');
        ast.becomeItem();
        assert.equal(ast.type, NodeType.PRED, `${relation}: relation remains a predicate`);
        assert.throws(() => ast.checkITEM(), undefined, `${relation}: cannot pass item validation`);
        const before = system.genCmd();
        assert.throws(() => replay(system, [`d a7 ${relation}`]), undefined, `${relation}: rejected by the real command path`);
        assert.deepEqual(system.genCmd(), before, `${relation}: failed command does not append a proposition`);
    }
});
