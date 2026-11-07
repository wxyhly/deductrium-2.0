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
        assert.throws(() => planMapScript(source, state, env), /line \d+/i, source);
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
    assert.deepEqual(plan, { state, money: 20, spent: 0, effects: [] });
    assert.notEqual(plan.state, state);
    for (const source of ['give key new; require key new', 'take key owned; require not-key owned',
        'require key owned; set tile missing road', 'require key owned; enable axiom unknown',
        'require key owned; unlock layer X-layer', 'require key owned; set text sign "bad\\q"']) {
        assert.throws(() => planMapScript(source, state, environment(), true), /line \d+/i);
    }
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
        assert.throws(() => planMapScript(requirement, state, environment()), /Requirement not met/);
    }
});

test('restore creates independent defaults, normalizes sets and clones nested JSON data', () => {
    const empty = { keys: [], flags: [], counts: {}, disabledAxioms: [], done: [], tileEdits: {}, rewards: [], layers: [] };
    assert.deepEqual(createMapScriptState(), empty);
    assert.deepEqual(createMapScriptState({}), empty);
    const saved = { keys: ['k', 'k'], flags: ['f'], counts: { n: -3 }, disabledAxioms: ['apn5'],
        done: ['door'], tileEdits: { sign: { type: 4, text: 'original' } }, rewards: ['r'], layers: ['G-layer'] };
    const restored = createMapScriptState(saved);
    assert.deepEqual(restored.keys, ['k']);
    restored.keys.push('new'); restored.counts.n = 5; restored.tileEdits.sign.text = 'changed';
    assert.deepEqual(saved.keys, ['k', 'k']); assert.equal(saved.counts.n, -3); assert.equal(saved.tileEdits.sign.text, 'original');
    assert.deepEqual(createMapScriptState(JSON.parse(JSON.stringify(saved))), { ...saved, keys: ['k'] });
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
            'function f() {}', 'give money (1+2)', 'give key k; globalThis.__mapScriptExecuted=true',
            'message `${globalThis.__mapScriptExecuted=true}`', 'give money JSON.parse("2")']) {
            assert.throws(() => planMapScript(script, createMapScriptState(), environment()), /line \d+/i);
        }
        const text = '${globalThis.__mapScriptExecuted=true}; eval("boom"); while(true){}';
        const plan = planMapScript(`message ${JSON.stringify(text)}`, createMapScriptState(), environment());
        assert.deepEqual(plan.effects, [{ op: 'message', text }]);
        assert.equal(globalThis.__mapScriptExecuted, false);
    } finally { delete globalThis.__mapScriptExecuted; }
});
