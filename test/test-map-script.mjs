// Test the same compiled module loaded by the game and editor.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMapScript, formatMapScript, rewriteMapScript, createMapScriptState, planMapScript } from '../js/hy/script.js';

test('parser keeps physical lines and JSON text with literal separators and escapes', () => {
    const commands = parseMapScript('// comment\r\ngive key 钥匙; message "a;b // text\\n\\\"quoted\\\""\r\nrequire key 钥匙');
    assert.equal(commands.length, 3);
    assert.deepEqual(commands.map(command => command.line), [2, 2, 3]);
    assert.equal(commands[1].text, 'a;b // text\n"quoted"');
    assert.deepEqual(parseMapScript(formatMapScript(commands)).map(({ line, ...command }) => command),
        commands.map(({ line, ...command }) => command));
});

test('parser rejects invalid syntax and non-JSON strings at their physical line', () => {
    for (const invalid of ['message \'hello\'', 'message "bad\\q"', 'message "unclosed',
        'give key x // inline', 'give key x; // inline', 'message "ok"tail',
        'give key "two words"', 'give key x extra', 'require money => 2',
        'require count c = 2', 'unlock layer X-layer', 'set tile g lava']) {
        assert.throws(() => parseMapScript(`\n// comment\n${invalid}`), /line 3/i, invalid);
    }
});

const environment = (extra = {}) => ({
    money: 20,
    rewards: new Set(['base']),
    hasTile: id => ['door', 'sign', '__proto__', 'constructor', 'toString'].includes(id),
    hasAxiom: id => ['apn5', 'asep'].includes(id),
    ...extra,
});

const assertBlocked = (source, state, env, checksOnly = false) => {
    const result = planMapScript(source, state, env, checksOnly);
    assert.equal(result.status, 'blocked', source);
    assert.deepEqual(result.state, state);
    assert.notEqual(result.state, state);
    assert.deepEqual(result.balances, env.balances ?? { reasoning: env.money, type: env.typeMoney ?? 0 });
    assert.equal(result.spent, 0); assert.equal(result.typeSpent, 0);
    assert.deepEqual(result.effects, []); assert.deepEqual(result.attemptEffects, []);
    return result;
};

test('planner simulates commands in order and persists edits without mutating inputs', () => {
    const state = createMapScriptState({ done: ['visited'], tileEdits: { door: { text: 'old' } } });
    const before = JSON.stringify(state);
    const plan = planMapScript(`
require not-key 铜钥匙
give key 铜钥匙; require key 铜钥匙
take key 铜钥匙; require not-key 铜钥匙
require not-flag met; set flag met; require flag met
clear flag met; require not-flag met
set count visits 2; add count visits -1; require count visits == 1
give money 0.5; take money 3.25; require money == 17.25
disable axiom apn5; disable axiom asep; enable axiom apn5
require reward base; unlock reward custom; require reward custom
unlock layer D-layer; unlock layer T-layer; unlock layer P-layer; unlock layer G-layer
open gate door; close gate door; set tile door reward
set text sign "欢迎; // literal\\n第二行"; message "Hello"
`, state, environment());
    assert.equal(plan.money, 17.25);
    assert.equal(plan.spent, 3.25);
    assert.deepEqual(plan.state, {
        keys: [], flags: [], counts: { visits: 1 }, disabledAxioms: ['asep'], done: ['visited'],
        tileEdits: { door: { text: 'old', type: 3 }, sign: { text: '欢迎; // literal\n第二行' } },
        rewards: ['custom'], layers: ['D-layer', 'T-layer', 'P-layer', 'G-layer'],
        engine: { rules: [], axioms: {}, types: [], disabledTypes: [] }, removedRewards: [],
    });
    assert.deepEqual(plan.effects, [
        { op: 'reward', id: 'custom' },
        { op: 'layer', id: 'D-layer' }, { op: 'layer', id: 'T-layer' },
        { op: 'layer', id: 'P-layer' }, { op: 'layer', id: 'G-layer' },
        { op: 'open', id: 'door' }, { op: 'close', id: 'door' }, { op: 'tile', id: 'door', type: 3 },
        { op: 'text', id: 'sign', text: '欢迎; // literal\n第二行' }, { op: 'message', text: 'Hello' },
    ]);
    assert.equal(JSON.stringify(state), before);
    plan.state.done.push('new'); plan.state.tileEdits.door.text = 'changed';
    assert.equal(JSON.stringify(state), before);
});

test('late requirements, missing keys, insufficient money and invalid references fail atomically', () => {
    const state = createMapScriptState({ keys: ['owned'], counts: { n: 1 } });
    const before = JSON.stringify(state);
    const env = environment();
    for (const source of [
        'take key owned; give money 3; open gate door\nrequire key missing',
        'give key new\ntake key absent', 'open gate door\ntake money 21',
        'open gate door\nset text missing "bad"', 'give key x\ndisable axiom unknown',
        'set count n 1000000000000\nadd count n 1',
        'give money 1000000000000', 'message "hello"\ngarbage',
    ]) {
        if (source.includes('require key missing')) assertBlocked(source, state, env);
        else assert.throws(() => planMapScript(source, state, env), /line \d+/i, source);
        assert.equal(JSON.stringify(state), before);
        assert.deepEqual(env.rewards, new Set(['base']));
        assert.equal(env.money, 20);
    }
});

test('checksOnly validates the entire script and requirements but skips every effect', () => {
    const state = createMapScriptState({ keys: ['owned'], counts: { n: 2 }, done: ['door'] });
    const plan = planMapScript(`take key owned; give key new; set flag changed; add count n 3;
take money 999; disable axiom apn5; open gate door; set tile sign wall;
unlock reward custom; unlock layer G-layer; message "skip";
require key owned; require not-key new; require not-flag changed; require count n == 2; require money == 20`, state, environment(), true);
    assert.deepEqual(plan, { state, money: 20, spent: 0, typeMoney: 0, typeSpent: 0, balances: { reasoning: 20, type: 0 }, effects: [], status: 'pass', attemptEffects: [] });
    assert.notEqual(plan.state, state);
    for (const source of ['give key new; require key new', 'take key owned; require not-key owned',
        'require key owned; set tile missing road', 'require key owned; enable axiom unknown',
        'require key owned; unlock layer X-layer', 'require key owned; set text sign "bad\\q"']) {
        if (source === 'give key new; require key new' || source === 'take key owned; require not-key owned') assertBlocked(source, state, environment(), true);
        else assert.throws(() => planMapScript(source, state, environment(), true), /line \d+/i);
    }
});

// Explicit example policy for tests, not a gameplay default. Fee is extra source currency.
const bank = () => ({ rules: [
    { from: 'reasoning', to: 'type', rate: 2, feeRate: 0.1, feeFixed: 1, minimum: 2, rounding: 'floor', precision: 2 },
    { from: 'type', to: 'reasoning', rate: 0.5, feeRate: 0, feeFixed: 0, minimum: 1, rounding: 'none', precision: 0 },
] });

test('currency and exchange commands round-trip with physical lines and strict syntax', () => {
    const source = '\ngive currency reasoning 3; take currency type .25\nrequire currency type >= 1; exchange 中央银行 reasoning 2';
    const commands = parseMapScript(source);
    assert.deepEqual(commands, [
        { line: 2, op: 'give', kind: 'currency', currency: 'reasoning', value: 3 },
        { line: 2, op: 'take', kind: 'currency', currency: 'type', value: 0.25 },
        { line: 3, op: 'require', kind: 'currency', currency: 'type', comparison: '>=', value: 1 },
        { line: 3, op: 'exchange', bankId: '中央银行', currency: 'reasoning', value: 2 },
    ]);
    assert.deepEqual(parseMapScript(formatMapScript(commands)).map(({ line, ...rest }) => rest),
        commands.map(({ line, ...rest }) => rest));
    for (const source of [
        'give currency __proto__ 2', 'take currency constructor 2', 'give currency "type" 2',
        'require currency type => 1', 'require currency type 1', 'exchange b type',
        'exchange "b" reasoning 2', 'exchange b reasoning type 2', 'exchange b __proto__ 2',
        'give currency type -1', 'take currency type Infinity', 'require currency type >= NaN',
        'give currency type 1e12 extra', 'exchange b type 1e999', 'exchange b type -1',
        'exchange b type 1000000000001',
    ]) assert.throws(() => parseMapScript(`\n${source}`), /line 2/i, source);
});

test('legacy money aliases only reasoning and missing type balance stays zero for old saves', () => {
    const state = createMapScriptState();
    const initial = planMapScript('', state, environment());
    assert.equal(initial.money, 20);
    assert.equal(initial.typeMoney, 0);
    assert.equal(initial.typeSpent, 0);
    const plan = planMapScript(`give money 5; give currency reasoning 2; take currency reasoning 3;
require money == 24; require currency reasoning == 24; take money 4;
give currency type 10; take currency type 3; require currency type == 7`, state, environment());
    assert.equal(plan.money, 20);
    assert.equal(plan.spent, 7);
    assert.equal(plan.typeMoney, 7);
    assert.equal(plan.typeSpent, 3);
    const legacy = planMapScript('give money 3; take money 2; require money == 21', state, environment({ typeMoney: 12 }));
    assert.equal(legacy.money, 21);
    assert.equal(legacy.spent, 2);
    assert.equal(legacy.typeMoney, 12);
    assert.equal(legacy.typeSpent, 0);
    for (const typeMoney of [null, '0', NaN, Infinity, -1, 1e12 + 1]) {
        assert.throws(() => planMapScript('', state, environment({ typeMoney })), /line 1/i);
    }
});

test('script exchanges share both ledgers sequentially without inflating spending counters', () => {
    const state = createMapScriptState();
    const env = environment({ money: 100, typeMoney: 3, banks: { central: bank() } });
    const snapshot = JSON.stringify(env);
    const plan = planMapScript(`exchange central reasoning 10;
require money == 88; require currency type == 23;
exchange central type 4; take currency type 3; take money 1;
require currency reasoning == 89; require currency type == 16`, state, env);
    assert.equal(plan.money, 89);
    assert.equal(plan.typeMoney, 16);
    assert.equal(plan.spent, 1);
    assert.equal(plan.typeSpent, 3);
    assert.deepEqual(plan.effects, []);
    assert.equal(JSON.stringify(env), snapshot);
    assert.deepEqual(state, createMapScriptState());
});

test('currency and bank failures leave balances, script state and author configuration intact', () => {
    const state = createMapScriptState({ keys: ['owned'], tileEdits: { door: { text: 'old' } } });
    const env = environment({ typeMoney: 3, banks: { central: bank() } });
    const before = JSON.stringify({ state, env });
    for (const source of [
        'take key owned; exchange central reasoning 10; require currency type > 100',
        'open gate door; exchange central reasoning 20',
        'give currency type 2; take currency type 6',
        'give currency reasoning 1e12', 'give currency type 1e12',
        'exchange central reasoning 1', 'exchange central type 0',
        'give money 1; exchange missing reasoning 2',
        'give currency type 1; require currency reasoning == 0',
    ]) {
        if (source.includes('require currency')) assertBlocked(source, state, env);
        else assert.throws(() => planMapScript(source, state, env), /line \d+/i, source);
        assert.equal(JSON.stringify({ state, env }), before);
    }
    const invalid = bank(); delete invalid.rules[1].feeFixed;
    assert.throws(() => planMapScript('require key absent; exchange broken reasoning 2', state,
        environment({ banks: { broken: invalid } })), /line 1:.*missing feeFixed/);
    assert.throws(() => planMapScript('require key absent\nexchange missing reasoning 2', state, env), /line 2: Unknown bank/);
    const oneWay = { rules: [bank().rules[0]] };
    assert.throws(() => planMapScript('exchange b type 2', state, environment({ banks: { b: oneWay } })), /Unsupported bank direction/);
});

test('checksOnly validates bank references and all rule data but never performs exchanges', () => {
    const state = createMapScriptState();
    const env = environment({ money: 0, typeMoney: 0, banks: { central: bank() } });
    const plan = planMapScript(`exchange central reasoning 100; give currency type 8; take currency reasoning 9;
require currency reasoning == 0; require currency type == 0`, state, env, true);
    assert.deepEqual(plan, { state, money: 0, spent: 0, typeMoney: 0, typeSpent: 0, balances: { reasoning: 0, type: 0 }, effects: [], status: 'pass', attemptEffects: [] });
    assert.throws(() => planMapScript('exchange missing reasoning 2', state, env, true), /Unknown bank/);
    assert.throws(() => planMapScript('exchange central reasoning 1', state, env, true), /minimum/);
    const invalid = bank(); invalid.rules[1].rounding = 'auto';
    assert.throws(() => planMapScript('require currency reasoning == 0; exchange central reasoning 2', state,
        environment({ banks: { central: invalid } }), true), /Invalid rounding/);
    assertBlocked('give currency type 5; require currency type == 5', state, env, true);
});

test('all currency comparisons observe the correct ledger and amount boundaries', () => {
    const state = createMapScriptState(), env = environment({ typeMoney: 7 });
    planMapScript(`require currency type >= 7; require currency type <= 7; require currency type == 7;
require currency type != 20; require currency type > 6; require currency type < 8;
give currency type 0; take currency reasoning 0; give currency reasoning 999999999980;
require currency reasoning == 1e12`, state, env);
    for (const [comparison, amount] of [['>=', 8], ['<=', 6], ['==', 20], ['!=', 7], ['>', 7], ['<', 7]]) {
        assertBlocked(`require currency type ${comparison} ${amount}`, state, env);
    }
    assert.throws(() => planMapScript('give currency type 1e12; take currency type 1e12; give currency type 8; take currency type 8', state,
        environment({ typeMoney: 0 })), /line 1/i, 'cumulative typeSpent is bounded');
});

test('bank IDs and currency names remain global during module rewriting', () => {
    const source = 'give key k; exchange central reasoning 2; give currency type 3; require currency reasoning >= 0; take currency type 1';
    assert.equal(rewriteMapScript(source, id => `instance::${id}`),
        'give key instance::k\nexchange central reasoning 2\ngive currency type 3\nrequire currency reasoning >= 0\ntake currency type 1');
    const state = createMapScriptState();
    for (const bankId of ['__proto__', 'constructor', 'toString']) {
        assert.throws(() => planMapScript(`exchange ${bankId} reasoning 2`, state, environment({ banks: {} })), /Unknown bank/);
        const banks = JSON.parse(`{"${bankId}":${JSON.stringify(bank())}}`);
        assert.equal(planMapScript(`exchange ${bankId} reasoning 2`, state, environment({ banks })).typeMoney, 4);
    }
    let reads = 0;
    const banks = Object.defineProperty({}, 'central', { get() { reads++; return bank(); } });
    assert.throws(() => planMapScript('exchange central reasoning 2', state, environment({ banks })), /Unknown bank/);
    assert.equal(reads, 0);
});

const modEnvironment = (extra = {}) => environment({
    typeMoney: 7,
    balances: { reasoning: 20, type: 7, 'mod:alpha': 10, 'mod:beta': 10 },
    ...extra,
});
const modBank = () => ({ rules: [
    { ...bank().rules[0], to: 'mod:alpha', rate: 3, feeRate: 0, feeFixed: 0 },
    { ...bank().rules[0], to: 'mod:beta', rate: 4, feeRate: 0, feeFixed: 0 },
    { ...bank().rules[1], from: 'mod:alpha', to: 'mod:beta', rate: 2 },
] });

test('registered mod currencies keep equal-valued ledgers isolated from each other and legacy fields', () => {
    const env = modEnvironment(), before = JSON.stringify(env);
    const plan = planMapScript(`require currency mod:alpha == 10; require currency mod:beta == 10;
give currency mod:alpha 4; take currency mod:beta 3;
require currency mod:alpha == 14; require currency mod:beta == 7;
take money 2; take currency type 1; require currency reasoning == 18`, createMapScriptState(), env);
    assert.deepEqual(plan.balances, { reasoning: 18, type: 6, 'mod:alpha': 14, 'mod:beta': 7 });
    assert.equal(plan.money, 18); assert.equal(plan.typeMoney, 6);
    assert.equal(plan.spent, 2); assert.equal(plan.typeSpent, 1);
    plan.balances['mod:alpha'] = 99;
    assert.equal(JSON.stringify(env), before);
});

test('mod registration is mandatory even for skipped effects and late commands', () => {
    const state = createMapScriptState(), env = modEnvironment(), before = JSON.stringify(env);
    for (const source of [
        'give currency mod:missing 1', 'take currency mod:missing 0', 'require currency mod:missing == 0',
        'require key absent\ngive currency mod:missing 1',
        'give key k; exchange central reasoning 2 mod:missing',
    ]) {
        for (const checksOnly of [false, true]) {
            assert.throws(() => planMapScript(source, state, { ...env, banks: { central: modBank() } }, checksOnly), /Unregistered currency/);
        }
        assert.deepEqual(state, createMapScriptState());
        assert.equal(JSON.stringify(env), before);
    }
    assert.throws(() => planMapScript('give currency mod:alpha 1', state, environment()), /Unregistered currency/);
});

test('registered balance maps must agree with both built-in compatibility balances', () => {
    for (const balances of [
        { reasoning: 19, type: 7 }, { reasoning: 20, type: 8 }, { reasoning: 20 }, { type: 7 }, {},
        { reasoning: 20, type: 7, 'mod:alpha': -1 }, { reasoning: 20, type: 7, 'mod:alpha': Infinity },
        JSON.parse('{"reasoning":20,"type":7,"__proto__":4}'),
    ]) assert.throws(() => planMapScript('', createMapScriptState(), modEnvironment({ balances })), /line 1/i);
    assert.throws(() => planMapScript('', createMapScriptState(), environment({ balances: { reasoning: 20, type: 7 } })), /match money\/typeMoney/);
    assert.deepEqual(planMapScript('', createMapScriptState(), modEnvironment()).balances,
        { reasoning: 20, type: 7, 'mod:alpha': 10, 'mod:beta': 10 });
});

test('multi-target script exchanges require explicit targets and preserve four-token single-target syntax', () => {
    const state = createMapScriptState(), env = modEnvironment({ banks: { central: modBank() } });
    const source = 'exchange central reasoning 2 mod:beta; exchange central mod:alpha 2';
    const plan = planMapScript(source, state, env);
    assert.deepEqual(plan.balances, { reasoning: 18, type: 7, 'mod:alpha': 8, 'mod:beta': 22 });
    assert.equal(plan.spent, 0); assert.equal(plan.typeSpent, 0);
    assert.deepEqual(parseMapScript(source)[0], { line: 1, op: 'exchange', bankId: 'central', currency: 'reasoning', value: 2, to: 'mod:beta' });
    assert.equal(rewriteMapScript(source, id => `instance::${id}`), 'exchange central reasoning 2 mod:beta\nexchange central mod:alpha 2');
    for (const checksOnly of [false, true]) {
        assert.throws(() => planMapScript('require key missing; exchange central reasoning 2', state, env, checksOnly), /Ambiguous bank direction/);
        assert.throws(() => planMapScript('exchange central reasoning 2 type', state, env, checksOnly), /Unsupported bank direction/);
        const check = planMapScript(source, state, env, true);
        assert.deepEqual(check.balances, env.balances);
    }
    const unregisteredRule = modBank(); unregisteredRule.rules.push({ ...bank().rules[0], from: 'mod:missing' });
    assert.throws(() => planMapScript('exchange central mod:alpha 2', state,
        modEnvironment({ banks: { central: unregisteredRule } }), true), /Unregistered currency: mod:missing/);
});

test('module rewriting scopes local references on both sides and preserves global identifiers and text', () => {
    const script = `require key k; require not-key no; require flag f; require not-flag nf;
require count c >= 2; give key k; take key k; set flag f; clear flag f;
set count c 2; add count c 3; open gate door; close gate door;
set tile door road; set text sign "k door c apn5";
require reward base; unlock reward custom; unlock layer D-layer;
disable axiom apn5; enable axiom apn5; message "door"; give money 2`;
    const rewritten = parseMapScript(rewriteMapScript(script, id => `模块::${id}`));
    assert.deepEqual(rewritten.filter(command => 'id' in command).map(command => command.id), [
        '模块::k', '模块::no', '模块::f', '模块::nf', '模块::c', '模块::k', '模块::k', '模块::f', '模块::f',
        '模块::c', '模块::c', '模块::door', '模块::door', '模块::door', '模块::sign',
        'base', 'custom', 'D-layer', 'apn5', 'apn5',
    ]);
    assert.equal(rewritten.find(command => command.kind === 'text').text, 'k door c apn5');
    assert.equal(rewritten.find(command => command.op === 'message').text, 'door');
    assert.throws(() => rewriteMapScript('give key k', () => 'bad id'), /line 1/i);
    assert.throws(() => rewriteMapScript('give key k', () => 'x'.repeat(129)), /line 1/i);
    assert.throws(() => rewriteMapScript('give key k', () => 'x; give money 9'), /line 1/i);
});

test('source, command, identifier and numeric limits include exact boundaries', () => {
    assert.equal(parseMapScript(' '.repeat(16384)).length, 0);
    assert.throws(() => parseMapScript(' '.repeat(16385)), /line 1/i);
    assert.equal(parseMapScript(Array(256).fill('give key k').join(';')).length, 256);
    assert.throws(() => parseMapScript(Array(257).fill('give key k').join('\n')), /line 257/i);
    assert.equal(parseMapScript(`give key ${'字'.repeat(128)}`)[0].id.length, 128);
    assert.throws(() => parseMapScript(`give key ${'字'.repeat(129)}`), /line 1/i);
    assert.equal(parseMapScript('set count c -1e12')[0].value, -1e12);
    assert.equal(parseMapScript('give money 1e12')[0].value, 1e12);
    assert.equal(parseMapScript('give money .25')[0].value, 0.25);
    for (const source of ['set count n 1.5', 'add count n 1000000000001', 'set count n -1000000000001',
        'set count n 9007199254740992', 'give money 1000000000001', 'take money -1',
        'give money Infinity', 'give money NaN', 'give money 1e999', 'give money 0x10',
        'require money >= -1', 'require count n == 0.5']) {
        assert.throws(() => parseMapScript(source), /line 1/i, source);
    }
    for (const money of [NaN, Infinity, -1, 1e12 + 1, '20']) {
        assert.throws(() => planMapScript('', createMapScriptState(), environment({ money })), /line 1/i);
    }
});

test('all comparisons use sequential values and missing counters default to zero', () => {
    const state = createMapScriptState();
    planMapScript(`require count absent == 0; require money >= 20; require money <= 20;
require money == 20; require money != 21; require money > 19; require money < 21;
set count n -3; require count n >= -3; require count n <= -3; require count n == -3;
require count n != 0; require count n > -4; require count n < -2`, state, environment());
    for (const requirement of ['require money >= 21', 'require money <= 19', 'require money == 19',
        'require money != 20', 'require money > 20', 'require money < 20', 'require count absent != 0']) {
        assertBlocked(requirement, state, environment());
    }
});

test('restore creates independent defaults, normalizes sets and clones nested JSON data', () => {
    const empty = { keys: [], flags: [], counts: {}, disabledAxioms: [], done: [], tileEdits: {}, rewards: [], layers: [],
        engine: { rules: [], axioms: {}, types: [], disabledTypes: [] }, removedRewards: [] };
    assert.deepEqual(createMapScriptState(), empty);
    assert.deepEqual(createMapScriptState({}), empty);
    const saved = { keys: ['k', 'k'], flags: ['f'], counts: { n: -3 }, disabledAxioms: ['apn5'],
        done: ['door'], tileEdits: { sign: { type: 4, text: 'original' } }, rewards: ['r'], layers: ['G-layer'] };
    const restored = createMapScriptState(saved);
    assert.deepEqual(restored.keys, ['k']);
    restored.keys.push('new'); restored.counts.n = 5; restored.tileEdits.sign.text = 'changed';
    assert.deepEqual(saved.keys, ['k', 'k']); assert.equal(saved.counts.n, -3); assert.equal(saved.tileEdits.sign.text, 'original');
    assert.deepEqual(createMapScriptState(JSON.parse(JSON.stringify(saved))), { ...empty, ...saved, keys: ['k'] });
    const other = createMapScriptState(); other.keys.push('isolated');
    assert.deepEqual(createMapScriptState(), empty);
});

test('restore rejects malformed state, arrays, numbers and tile JSON', () => {
    const accessorArray = Object.defineProperty([], '0', { enumerable: true, get() { throw new Error('executed array getter'); } });
    for (const input of [null, [], 2, 'state', new Date(), { unknown: [] }, { keys: 'k' },
        { keys: accessorArray }, { keys: Array(1) },
        { keys: [null] }, { flags: [2] }, { done: [false] }, { rewards: [{}] },
        { disabledAxioms: ['two words'] }, { layers: ['X-layer'] }, { keys: ['x'.repeat(129)] },
        { counts: [] }, { counts: { n: NaN } }, { counts: { n: Infinity } }, { counts: { n: 1.1 } },
        { counts: { n: 1e12 + 1 } }, { counts: { 'bad id': 1 } },
        { tileEdits: [] }, { tileEdits: { door: null } }, { tileEdits: { door: { type: 5 } } },
        { tileEdits: { door: { type: -1 } } }, { tileEdits: { door: { type: '0' } } },
        { tileEdits: { door: { type: 0.5 } } }, { tileEdits: { door: { text: [] } } },
        { tileEdits: { door: { text: 'x'.repeat(16385) } } }, { tileEdits: { door: { extra: true } } },
        Object.defineProperty({}, 'keys', { enumerable: true, get() { throw new Error('executed'); } }),
    ]) assert.throws(() => createMapScriptState(input), /line 1/i);
});

test('prototype-looking IDs are normal own data and never read inherited values', () => {
    const state = createMapScriptState(JSON.parse('{"counts":{"__proto__":4},"tileEdits":{"__proto__":{"text":"old"}}}'));
    const plan = planMapScript(`require count constructor == 0; require count toString == 0;
add count __proto__ 2; set count constructor 3; set count toString 5;
open gate __proto__; set text constructor "safe"; close gate toString`, state, environment());
    assert.equal(plan.state.counts.__proto__, 6);
    assert.equal(plan.state.counts.constructor, 3);
    assert.equal(plan.state.counts.toString, 5);
    assert.deepEqual(plan.state.tileEdits.__proto__, { text: 'old', type: 0 });
    assert.deepEqual(plan.state.tileEdits.constructor, { text: 'safe' });
    assert.deepEqual(plan.state.tileEdits.toString, { type: 2 });
    assert.equal(Object.getPrototypeOf(plan.state.counts), Object.prototype);
    assert.equal(Object.getPrototypeOf(plan.state.tileEdits), Object.prototype);
    assert.equal(Object.prototype.type, undefined);
    assert.equal(state.counts.__proto__, 4);
});

test('all tile names match game values and open/close persist road/gate types', () => {
    for (const [name, type] of [['road', 0], ['wall', 1], ['gate', 2], ['reward', 3], ['ordinal', 4]]) {
        const plan = planMapScript(`set tile door ${name}`, createMapScriptState(), environment());
        assert.equal(plan.state.tileEdits.door.type, type);
        assert.deepEqual(plan.effects, [{ op: 'tile', id: 'door', type }]);
    }
    assert.equal(planMapScript('open gate door', createMapScriptState(), environment()).state.tileEdits.door.type, 0);
    assert.equal(planMapScript('close gate door', createMapScriptState(), environment()).state.tileEdits.door.type, 2);
});

test('repeated unlocks and set operations remain idempotent; done is parent-owned', () => {
    const state = createMapScriptState({ done: ['door'] });
    const script = 'give key k; give key k; set flag f; set flag f; disable axiom apn5; disable axiom apn5; unlock reward custom; unlock reward custom; unlock layer D-layer; unlock layer D-layer';
    const first = planMapScript(script, state, environment());
    assert.deepEqual(first.state.keys, ['k']); assert.deepEqual(first.state.flags, ['f']);
    assert.deepEqual(first.state.disabledAxioms, ['apn5']);
    assert.deepEqual(first.state.rewards, ['custom']); assert.deepEqual(first.state.layers, ['D-layer']);
    assert.deepEqual(first.state.done, ['door']);
    assert.deepEqual(first.effects, [{ op: 'reward', id: 'custom' }, { op: 'layer', id: 'D-layer' }]);
    const second = planMapScript(script, first.state, environment());
    assert.deepEqual(second.state, first.state); assert.deepEqual(second.effects, []);
    assert.deepEqual(planMapScript('unlock reward base', state, environment()).effects, []);
});

test('JavaScript is rejected as commands and preserved inertly inside JSON strings', () => {
    globalThis.__mapScriptExecuted = false;
    try {
        for (const script of ['globalThis.__mapScriptExecuted=true', 'eval("1")', 'while (true) {}',
            'function f() {}', 'give money (1+eval(2))', 'give key k; globalThis.__mapScriptExecuted=true',
            'message `${globalThis.__mapScriptExecuted=true}`', 'give money JSON.parse("2")']) {
            assert.throws(() => planMapScript(script, createMapScriptState(), environment()), /line \d+/i);
        }
        const text = '${globalThis.__mapScriptExecuted=true}; eval("boom"); while(true){}';
        assert.equal(planMapScript('give money (1+2)', createMapScriptState(), environment()).money, 23);
        const plan = planMapScript(`message ${JSON.stringify(text)}`, createMapScriptState(), environment());
        assert.deepEqual(plan.effects, [{ op: 'message', text }]);
        assert.equal(globalThis.__mapScriptExecuted, false);
    } finally { delete globalThis.__mapScriptExecuted; }
});
