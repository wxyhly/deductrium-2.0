// Exercise the shipped JavaScript used by the game; the parent build supplies js/hy/script.js.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMapScript, formatMapScript, rewriteMapScript, createMapScriptState, planMapScript } from '../js/hy/script.js';

const environment = (extra = {}) => ({
    money: 20, typeMoney: 0,
    rewards: new Set(['base']),
    hasTile: id => ['door', 'sign', '__proto__', 'constructor'].includes(id),
    hasAxiom: id => ['apn5', 'asep'].includes(id),
    getTileType: id => id === 'sign' ? 1 : 2,
    ...extra,
});
const state = extra => createMapScriptState(extra);
const shape = ast => JSON.parse(JSON.stringify(ast, (key, value) => ['line', 'elseLine', 'endLine'].includes(key) ? undefined : value));
const messages = plan => plan.effects.filter(effect => effect.op === 'message').map(effect => effect.text);
const choose = (condition, initial = state(), env = environment()) => messages(planMapScript(
    `if ${condition}; message "yes"; else; message "no"; end`, initial, env,
))[0] === 'yes';

test('branch AST preserves physical lines for every header, predicate, body and closing marker', () => {
    const [branch] = parseMapScript('// ignored\r\nif key k\r\nmessage "if;else // \\"text\\""\r\nelif not flag f\r\nif count c == 0; give key nested; end\r\nelse\r\nmessage "end"\r\nend');
    assert.equal(branch.op, 'if'); assert.equal(branch.line, 2); assert.equal(branch.endLine, 8);
    assert.deepEqual(branch.branches.map(item => item.line), [2, 4]);
    assert.equal(branch.branches[0].condition.predicate.line, 2);
    assert.equal(branch.branches[0].body[0].line, 3);
    assert.equal(branch.branches[1].condition.op, 'not');
    const nested = branch.branches[1].body[0];
    assert.equal(nested.line, 5); assert.equal(nested.endLine, 5);
    assert.equal(nested.branches[0].body[0].line, 5);
    assert.equal(branch.elseLine, 6); assert.equal(branch.elseBody[0].line, 7);
});

test('format round-trip retains the entire recursive AST and inert JSON text', () => {
    const source = `give key (legacy); if not (key k or flag f) and (count c >= -2 or not-reward r);
message "a; if (key k) // \\"quoted\\"";
elif currency type == 0; if layer D-layer; unlock info help; else; unlock achievement badge; end;
else; require tile door != wall; end`;
    const parsed = parseMapScript(source), formatted = formatMapScript(parsed);
    assert.deepEqual(shape(parseMapScript(formatted)), shape(parsed));
    assert.equal(formatMapScript(parseMapScript(formatted)), formatted);
    // A long, flat boolean chain must not become forbidden nesting when formatted.
    const chain = `if ${Array(80).fill('key k').join(' or ')}; end`;
    assert.deepEqual(shape(parseMapScript(formatMapScript(parseMapScript(chain)))), shape(parseMapScript(chain)));
});

test('not binds before and, and before or; parentheses override precedence', () => {
    for (let mask = 0; mask < 8; mask++) {
        const [a, b, c] = [1, 2, 4].map(bit => !!(mask & bit));
        const initial = state({ keys: ['a', 'b', 'c'].filter((_, index) => mask & (1 << index)) });
        assert.equal(choose('key a or key b and not key c', initial), a || (b && !c));
        assert.equal(choose('(key a or key b) and not key c', initial), (a || b) && !c);
        assert.equal(choose('not(key a and (key b or key c))', initial), !(a && (b || c)));
        assert.equal(choose('not not key a', initial), a);
    }
});

test('first matching branch alone executes, including elif, else and empty branches', () => {
    const script = `if key a; message "a"; elif flag b; message "b"; else; message "fallback"; end`;
    assert.deepEqual(messages(planMapScript(script, state({ keys: ['a'], flags: ['b'] }), environment())), ['a']);
    assert.deepEqual(messages(planMapScript(script, state({ flags: ['b'] }), environment())), ['b']);
    assert.deepEqual(messages(planMapScript(script, state(), environment())), ['fallback']);
    assert.deepEqual(messages(planMapScript('if not-key a; elif not-key b; message "wrong"; else; message "wrong"; end', state(), environment())), []);
    assert.deepEqual(messages(planMapScript('if key missing; take key missing; require flag missing; take money 999; end', state(), environment())), []);
    assert.deepEqual(messages(planMapScript('if key missing; message "wrong"; end; message "after"', state(), environment())), ['after']);
});

test('branches and new require predicates observe staged keys, flags, counts, rewards, layers, axioms and tiles', () => {
    const script = `give key k; set flag f; set count n 3; unlock reward custom; unlock layer D-layer;
disable axiom apn5; open gate door;
if key k and flag f and count n == 3 and reward custom and layer D-layer and not-axiom apn5 and tile door == road;
    require reward custom; require layer D-layer; require not-axiom apn5; require tile door == road;
    if not-reward absent and tile door != gate; unlock achievement reached; end;
else; require key impossible; end;
enable axiom apn5; close gate door;
if axiom apn5 and tile door == gate; unlock info next; end;
set tile sign ordinal; if tile sign == ordinal; message "ordinal"; end`;
    const initial = state(), before = JSON.stringify(initial);
    const plan = planMapScript(script, initial, environment());
    assert.deepEqual(plan.effects.filter(effect => ['achievement', 'info', 'message'].includes(effect.op)), [
        { op: 'achievement', id: 'reached' }, { op: 'info', id: 'next' }, { op: 'message', text: 'ordinal' },
    ]);
    assert.equal(JSON.stringify(initial), before);
    assert.equal(plan.state.tileEdits.door.type, 2); assert.equal(plan.state.tileEdits.sign.type, 4);
});

test('currency and bank effects stage balances before later branch decisions', () => {
    const banks = { central: { rules: [{ from: 'reasoning', to: 'type', rate: 2, feeRate: 0,
        feeFixed: 0, minimum: 1, rounding: 'none', precision: 0 }] } };
    const env = environment({ banks, balances: { reasoning: 20, type: 0, 'mod:coin': 1 } });
    const before = structuredClone(env.balances);
    const plan = planMapScript(`exchange central reasoning 5;
if money == 15 and currency type == 10; take currency type 3; give currency mod:coin 2; end;
if currency type == 7 and currency mod:coin == 3; take money 2; message "funded"; end`, state(), env);
    assert.deepEqual(plan.balances, { reasoning: 13, type: 7, 'mod:coin': 3 });
    assert.equal(plan.spent, 2); assert.equal(plan.typeSpent, 3);
    assert.deepEqual(messages(plan), ['funded']); assert.deepEqual(env.balances, before);
});

test('reward, layer and axiom predicates combine incoming ownership and staged state', () => {
    const initial = state({ rewards: ['saved'], layers: ['T-layer'], disabledAxioms: ['asep'] });
    const env = environment({ hasLayer: id => id === 'D-layer' });
    for (const condition of ['reward base', 'reward saved', 'not-reward absent', 'layer D-layer', 'layer T-layer',
        'axiom apn5', 'not-axiom asep', 'not-axiom unavailable']) assert.equal(choose(condition, initial, env), true, condition);
    for (const condition of ['not-reward base', 'not-reward saved', 'reward absent', 'layer G-layer', 'axiom asep',
        'axiom unavailable', 'not-axiom apn5']) assert.equal(choose(condition, initial, env), false, condition);
    assert.equal(choose('layer T-layer', initial, environment()), true, 'hasLayer remains optional');
    assert.equal(choose('layer D-layer', initial, environment()), false);
});

test('every tile name compares correctly, with restored type edits overriding base type and text-only edits falling back', () => {
    const names = ['road', 'wall', 'gate', 'reward', 'ordinal'];
    for (const [type, name] of names.entries()) {
        assert.equal(choose(`tile door == ${name}`, state(), environment({ getTileType: () => type })), true);
        assert.equal(choose(`tile door != ${name}`, state(), environment({ getTileType: () => type })), false);
        assert.equal(choose(`tile door == ${name}`, state({ tileEdits: { door: { type } } })), true);
    }
    assert.equal(choose('tile door == gate', state({ tileEdits: { door: { text: 'only text' } } })), true);
    assert.equal(choose('tile __proto__ == road', state(JSON.parse('{"tileEdits":{"__proto__":{"type":0}}}'))), true);
});

test('checksOnly chooses using incoming state and balances, skips effects, and checks only selected requirements', () => {
    const initial = state({ keys: ['old'], counts: { n: 2 }, tileEdits: { door: { type: 1 } } });
    const script = `take key old; give key new; set count n 9; give money 3; give currency type 5;
unlock reward custom; unlock layer D-layer; disable axiom apn5; open gate door;
unlock achievement badge; unlock info help;
if key new or reward custom or layer D-layer or not-axiom apn5 or tile door == road or currency type > 0;
    require key new; message "changed";
elif key old and count n == 2 and money == 20 and currency type == 0 and tile door == wall;
    require key old; require axiom apn5; require not-reward custom; message "incoming";
else; require key impossible; end`;
    const checked = planMapScript(script, initial, environment(), true);
    assert.deepEqual(checked, { state: initial, money: 20, typeMoney: 0, spent: 0, typeSpent: 0,
        balances: { reasoning: 20, type: 0 }, effects: [], status: 'pass', attemptEffects: [] });
    assert.notEqual(checked.state, initial); assert.notEqual(checked.state.tileEdits.door, initial.tileEdits.door);
    assert.deepEqual(messages(planMapScript(script, initial, environment())), ['changed']);
    const blocked = planMapScript('if key old; require key absent; else; give key absent; end', initial, environment(), true);
    assert.equal(blocked.status, 'blocked'); assert.deepEqual(blocked.state, initial);
    assert.deepEqual(blocked.balances, {reasoning: 20, type: 0}); assert.deepEqual(blocked.effects, []);
    assert.equal(blocked.spent, 0); assert.equal(blocked.typeSpent, 0); assert.deepEqual(blocked.attemptEffects, []);
});

test('whole-tree reference preflight includes unreachable predicates, bodies, later elifs and short-circuited operands', () => {
    const cases = [
        ['if key absent\nopen gate missing\nend', /line 2: Unknown tile/],
        ['if not-key absent\nmessage "chosen"\nelif tile missing == road\nend', /line 3: Unknown tile/],
        ['if not-key absent or tile missing == gate\nend', /line 1: Unknown tile/],
        ['if key absent and currency mod:missing > 0\nend', /line 1: Unregistered currency/],
        ['if key absent\ngive currency mod:missing 1\nend', /line 2: Unregistered currency/],
        ['if key absent\nexchange missing reasoning 1\nend', /line 2: Unknown bank/],
        ['if key absent\ndisable axiom missing\nend', /line 2: Unknown axiom/],
        ['require key missing\nif key absent\nset text missing "bad"\nend', /line 3: Unknown tile/],
    ];
    for (const [script, error] of cases) for (const checksOnly of [false, true]) {
        assert.throws(() => planMapScript(script, state(), environment(), checksOnly), error, script);
    }
    const invalidBank = { rules: [{ from: 'reasoning', to: 'type', rate: 2 }] };
    assert.throws(() => planMapScript('if key absent\nexchange bad reasoning 1\nend', state(), environment({ banks: { bad: invalidBank } })), /line 2:/);
});

test('tile predicates require a valid optional adapter even in unselected branches', () => {
    for (const checksOnly of [false, true]) {
        assert.throws(() => planMapScript('if key absent\nrequire tile door == gate\nend', state(), environment({ getTileType: undefined }), checksOnly), /line 2:.*getTileType/);
        for (const type of [undefined, NaN, Infinity, -1, 5, 0.5, '2']) {
            assert.throws(() => planMapScript('if tile door == gate; end', state(), environment({ getTileType: () => type }), checksOnly), /line 1: Invalid tile type/);
        }
    }
    assert.throws(() => planMapScript('if tile door == gate; end', state(), environment({ getTileType() { throw new Error('adapter failed'); } })), /line 1: adapter failed/);
    for (const extra of [{ getTileType: 2 }, { hasLayer: true }]) {
        assert.throws(() => planMapScript('', state(), environment(extra)), /line 1: Invalid environment/);
    }
    assert.deepEqual(planMapScript('give key legacy', state(), environment({ getTileType: undefined })).state.keys, ['legacy']);
});

test('late selected failures roll back all staged branch state, ledgers and effects', () => {
    const initial = state({ keys: ['old'], counts: { n: 1 }, tileEdits: { door: { text: 'original' } } });
    const env = environment({ balances: { reasoning: 20, type: 0, 'mod:coin': 4 } });
    const before = structuredClone({ initial, balances: env.balances, rewards: [...env.rewards] });
    const prefix = `take key old; give money 2; give currency mod:coin 3;
if money == 22; set flag staged; add count n 2; open gate door; set text door "changed";
unlock reward custom; unlock layer G-layer; disable axiom apn5; unlock achievement badge; unlock info help; end;
if flag staged;\n`;
    for (const failure of ['require key absent', 'take money 100', 'take currency mod:coin 100', 'set count n 1e12; add count n 1']) {
        if (failure === 'require key absent') {
            const blocked = planMapScript(`${prefix}${failure}\nend`, initial, env);
            assert.equal(blocked.status, 'blocked'); assert.deepEqual(blocked.state, initial);
            assert.deepEqual(blocked.balances, env.balances); assert.deepEqual(blocked.effects, []);
            assert.equal(blocked.spent, 0); assert.equal(blocked.typeSpent, 0); assert.deepEqual(blocked.attemptEffects, []);
        } else assert.throws(() => planMapScript(`${prefix}${failure}\nend`, initial, env), /line 5:/);
        assert.deepEqual({ initial, balances: env.balances, rewards: [...env.rewards] }, before);
    }
});

test('achievement and info unlocks are global, ordered, deduplicated plan effects without save fields', () => {
    const plan = planMapScript('unlock achievement same; unlock info same; unlock achievement same; if not-key x; unlock info same; unlock info next; end', state(), environment());
    assert.deepEqual(plan.effects, [{ op: 'achievement', id: 'same' }, { op: 'info', id: 'same' }, { op: 'info', id: 'next' }]);
    assert.deepEqual(plan.state, state());
    assert.deepEqual(shape(parseMapScript(formatMapScript(parseMapScript('unlock achievement 徽章; unlock info help')))), [
        { op: 'unlock', kind: 'achievement', id: '徽章' }, { op: 'unlock', kind: 'info', id: 'help' },
    ]);
});

test('recursive rewrite namespaces all local predicate and body references while preserving globals', () => {
    const source = `if key k and not-key nk and (flag f or not-flag nf) and count n > 0 and tile door != wall;
require tile sign == road; give key body;
elif not (reward r or not-reward nr or layer D-layer or axiom apn5 or not-axiom asep);
if currency type == 0; set flag nested; open gate door; end;
else; set count n 2; add count n 1; set tile sign road; set text sign "door k";
unlock reward global; unlock layer G-layer; unlock achievement badge; unlock info help; disable axiom apn5; end`;
    const rewritten = rewriteMapScript(source, id => `模块::${id}`);
    const [node] = parseMapScript(rewritten);
    const ids = [];
    const collect = condition => {
        if (condition.op === 'predicate') { if ('id' in condition.predicate) ids.push(condition.predicate.id); }
        else if (condition.op === 'not') collect(condition.condition);
        else { collect(condition.left); collect(condition.right); }
    };
    collect(node.branches[0].condition); collect(node.branches[1].condition);
    assert.deepEqual(ids, ['模块::k', '模块::nk', '模块::f', '模块::nf', '模块::n', '模块::door', 'r', 'nr', 'D-layer', 'apn5', 'asep']);
    assert.equal(node.branches[0].body[0].id, '模块::sign'); assert.equal(node.branches[0].body[1].id, '模块::body');
    assert.equal(node.branches[1].body[0].branches[0].body[0].id, '模块::nested');
    assert.equal(node.branches[1].body[0].branches[0].body[1].id, '模块::door');
    assert.deepEqual(node.elseBody.map(command => command.id), ['模块::n', '模块::n', '模块::sign', '模块::sign', 'global', 'G-layer', 'badge', 'help', 'apn5']);
    assert.equal(node.elseBody[3].text, 'door k');
    assert.equal(rewriteMapScript(rewritten, id => id.startsWith('模块::') ? id : `模块::${id}`), rewritten);
    assert.throws(() => rewriteMapScript('\nif key k; end', () => 'bad id'), /line 2:/);
    assert.throws(() => rewriteMapScript('if reward global\nelse\nif tile door == road; end\nend', () => 'bad;id'), /line 3:/);
});

test('control and condition syntax errors retain their exact physical line', () => {
    const invalid = [
        ['else', 1], ['elif key k', 1], ['end', 1], ['if key k', 1],
        ['if key k\nelse\nelse\nend', 3], ['if key k\nelse\nelif key k\nend', 3],
        ['if key k\nend extra', 2], ['if key k\nelse extra\nend', 2],
        ['if', 1], ['if key', 1], ['if not', 1], ['if ()\nend', 1], ['if (key k\nend', 1],
        ['if key k)\nend', 1], ['if key k and\nend', 1], ['if key k or or key k\nend', 1],
        ['if key k && flag f\nend', 1], ['if "key k"\nend', 1], ['if key k extra\nend', 1],
        ['if tile door >= road\nend', 1], ['if tile door == lava\nend', 1],
        ['if layer X-layer\nend', 1], ['if key k\nelse\nunlock layer X-layer\nend', 3],
        ['require not-axiom "apn5"', 1], ['require not-reward', 1], ['require layer X-layer', 1],
    ];
    for (const [source, line] of invalid) {
        assert.throws(() => parseMapScript(`// comment\n${source}`), new RegExp(`line ${line + 1}:`), source);
    }
});

test('depth 16, all control markers, and statements in unselected branches obey exact bounds', () => {
    const nested = depth => `${'if key k\n'.repeat(depth)}give key leaf\n${'end\n'.repeat(depth)}`;
    assert.doesNotThrow(() => parseMapScript(nested(16)));
    assert.doesNotThrow(() => formatMapScript(parseMapScript(nested(16))));
    assert.throws(() => parseMapScript(nested(17)), /line 17:.*nesting/);
    const full = `if key missing\n${'give key k\n'.repeat(254)}end`;
    assert.doesNotThrow(() => planMapScript(full, state(), environment()));
    assert.throws(() => parseMapScript(`if key missing\n${'give key k\n'.repeat(255)}end`), /line 257:.*256/);
    assert.doesNotThrow(() => parseMapScript(`if ${'('.repeat(16)}key k${')'.repeat(16)}; end`));
    assert.throws(() => parseMapScript(`\nif ${'('.repeat(17)}key k${')'.repeat(17)}; end`), /line 2:.*nesting/);
    assert.doesNotThrow(() => parseMapScript(`if ${'not '.repeat(16)}key k; end`));
    assert.throws(() => parseMapScript(`if ${'not '.repeat(17)}key k; end`), /line 1:.*nesting/);
});

test('branch language rejects executable expressions and loops while retaining ordinary flat token compatibility', () => {
    for (const condition of ['eval("true")', 'key k || key b', 'money >= (1+eval(2))', 'globalThis.x', 'key k; while true', 'true']) {
        assert.throws(() => parseMapScript(`if ${condition}; end`), /line 1:/, condition);
    }
    assert.equal(planMapScript('if money >= (1+2); give key arithmetic; end', state(), environment()).state.keys[0], 'arithmetic');
    const flat = 'give key (k); set flag and; set count not 2; require flag and; message "if; else; end"';
    assert.equal(formatMapScript(parseMapScript(flat)), flat.split('; ').slice(0, 4).join('\n') + '\nmessage "if; else; end"');
    assert.deepEqual(planMapScript(flat, state(), environment()).state.keys, ['(k)']);
});
