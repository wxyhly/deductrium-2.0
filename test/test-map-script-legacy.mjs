// Import the actual JavaScript shipped to the game; no TypeScript loaders or hooks.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMapScript, formatMapScript, rewriteMapScript, createMapScriptState, planMapScript } from '../js/hy/script.js';

const state = value => createMapScriptState(value);
const ordinal = {current: [], max: [1], next: [1, 2], base: 5};
const comparison = (a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
};
const environment = (extra = {}) => ({
    money: 20, typeMoney: 4, rewards: new Set(['base', 'stepw']),
    hasTile: id => ['door', 'gift', 'sign', '__proto__'].includes(id), hasAxiom: id => id === 'apn5',
    getTileType: () => 2,
    metrics: {steps: 256, demolished: 2, spent: 10, 'ordinal-base': 5},
    ordinal: structuredClone(ordinal), compareOrdinals: comparison,
    nextOrdinal: (max, base, stepw) => [...max, stepw && base > 1 ? 2 : 1],
    engine: {
        validate(value) {
            if (value.id === 'unknown' || value.text === 'malformed' || value.pattern === 'malformed') throw Error('Unsupported engine reference');
        },
        query(query, current) {
            if (query.kind === 'rule-present') return current.engine.rules.includes(query.id) || Object.hasOwn(current.engine.axioms, query.id);
            if (query.kind === 'type-present') return current.engine.types.includes(query.id) && !current.engine.disabledTypes.includes(query.id);
            if (query.kind === 'rule-name') {
                const regex = new RegExp(`^${query.pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
                return [...current.engine.rules, ...Object.keys(current.engine.axioms)].some(id => regex.test(id));
            }
            if (query.kind === 'proof' || query.kind === 'rule') return Object.values(current.engine.axioms).includes(query.text) && !current.disabledAxioms.includes('apn5');
            return current.engine.types.includes(query.text) && !current.engine.disabledTypes.includes(query.text);
        },
    },
    ...extra,
});
const plan = (source, initial = state(), extra = {}, checks = false) => planMapScript(source, initial, environment(extra), checks);
const shape = value => JSON.parse(JSON.stringify(value, (key, item) => ['line', 'endLine', 'elseLine'].includes(key) ? undefined : item));
const unchanged = (result, initial, env) => {
    assert.deepEqual(result.state, initial);
    assert.deepEqual(result.balances, env.balances ?? {reasoning: env.money, type: env.typeMoney});
    assert.equal(result.spent, 0); assert.equal(result.typeSpent, 0); assert.deepEqual(result.effects, []);
};

test('legacy state defaults, strict nested restoration and independent clones', () => {
    const input = {engine: {rules: ['r', 'r'], axioms: JSON.parse('{"__proto__":"P"}'), types: ['T'], disabledTypes: ['T']}, removedRewards: ['base'], ordinal};
    const restored = state(input);
    assert.deepEqual(state().engine, {rules: [], axioms: {}, types: [], disabledTypes: []});
    assert.deepEqual(state().removedRewards, []); assert.equal(Object.hasOwn(state(), 'ordinal'), false);
    assert.deepEqual(restored.engine.rules, ['r']); assert.equal(restored.engine.axioms.__proto__, 'P');
    restored.engine.rules.push('changed'); restored.ordinal.current.push(1);
    assert.deepEqual(input.engine.rules, ['r', 'r']); assert.deepEqual(ordinal.current, []);
    for (const invalid of [
        {engine: null}, {engine: {extra: []}}, {engine: {rules: 'x'}}, {engine: {axioms: {a: 4}}},
        {removedRewards: 'x'}, {rewards: ['r'], removedRewards: ['r']}, {ordinal: {...ordinal, base: 0}},
        {ordinal: {...ordinal, next: [1, 3]}}, {ordinal: {...ordinal, missing: 1}}, {ordinal: {}},
    ]) assert.throws(() => state(invalid), /line 1:/);
    const accessor = {}; Object.defineProperty(accessor, 'x', {enumerable: true, get() {throw Error('must not run');}});
    assert.throws(() => state({engine: {axioms: accessor}}), /JSON data/);
    const sparse = []; sparse.length = 1;
    assert.throws(() => state({engine: {types: sparse}}), /JSON array/);
});

test('every new syntax parses, formats and reparses with quotes, branches and arithmetic', () => {
    const source = `event repeat; reward keep; unlock rule r; unlock type T; disable type T; enable type T;
add axiom ax "P -> (Q and R); // inert"; remove axiom ax;
if proof "P -> (Q and R)" or not (rule "P |- Q" and type "T");
remember proof "P"; remember rule "P |- Q"; remember type "T";
elif rule-name "a*x" and rule-present r and not type-present T;
require metric steps >= 256; require ordinal max <= "[1,2]";
else; clear reward base; reset reward gift; demolish gate door; end;
set ordinal current "[]"; set ordinal max "[1,2]"; set ordinal base 4;
raise ordinal "[1,2,2]"; recompute ordinal; generate ordinal "[1,2]";
set language zh; confirm "cost?"; give money min(5, max(1, currency(type)));
take currency type 2*count(n); set count n metric(steps)-1; add count n 2;
require money >= 2*currency(reasoning); allow; block`;
    const parsed = parseMapScript(source), formatted = formatMapScript(parsed);
    assert.deepEqual(shape(parseMapScript(formatted)), shape(parsed));
    assert.equal(formatMapScript(parseMapScript(formatted)), formatted);
    assert.equal(plan('if (proof "no"); block; else; allow; end').status, 'pass');
});

test('engine queries observe all staged edits, disabled types and original axiom policy', () => {
    const result = plan(`unlock rule r; require rule-present r;
add axiom apn5x "P"; require proof "P"; require rule "P";
if rule-name "a*x"; remove axiom apn5x; end;
if rule-name "a*x"; block; end;
unlock type T; require type "T"; require type-present T;
disable type T; if type-present T; block; end;
enable type T; require type-present T;
add axiom ax "Q"; disable axiom apn5;
if proof "Q"; block; else; enable axiom apn5; end; require proof "Q"`);
    assert.equal(result.status, 'pass'); assert.deepEqual(result.state.engine.rules, ['r']);
    assert.deepEqual(result.state.engine.axioms, {ax: 'Q'});
    assert.deepEqual(result.state.engine.types, ['T']); assert.deepEqual(result.state.engine.disabledTypes, []);
    assert.equal(result.effects.filter(effect => effect.op === 'engine').length, 7);
});

test('whole-tree engine validation includes dead bodies, short circuits and code after allow', () => {
    for (const source of [
        'if key absent; unlock rule unknown; end', 'if not-key absent or proof "malformed"; allow; end',
        'allow\nadd axiom unknown "P"', 'if key absent; if type "malformed"; end; end',
        'if key absent; disable type unknown; else; allow; end',
    ]) assert.throws(() => plan(source), /line \d+: Unsupported engine reference/);
    assert.throws(() => plan('if key absent; unlock rule r; end', state(), {engine: undefined}), /env.engine/);
    assert.throws(() => plan('require proof "P"', state(), {engine: {validate() {}, query() {return 'true';}}}), /boolean/);
});

test('require and explicit block roll back every staged ledger/state while retaining attempt effects', () => {
    const initial = state({keys: ['k'], done: ['gift']}), env = environment();
    const before = JSON.stringify(initial), envBefore = JSON.stringify(env.ordinal);
    for (const ending of ['require key absent', 'block']) {
        const result = planMapScript(`remember proof "P"; generate ordinal "[1,2]";
take money 3; give currency type 2; take key k; unlock rule r;
set ordinal max "[1,2]"; reset reward gift; demolish gate door; confirm "cost?";
${ending}; message "unreachable"`, initial, env);
        assert.equal(result.status, 'blocked'); unchanged(result, initial, env);
        assert.deepEqual(result.attemptEffects, [{op: 'remember', kind: 'proof', text: 'P'}, {op: 'generate-ordinal', value: [1, 2]}]);
        assert.equal(result.confirmation, undefined);
    }
    assert.equal(JSON.stringify(initial), before); assert.equal(JSON.stringify(env.ordinal), envBefore);
});

test('allow/block terminate the entire selected path including enclosing branches', () => {
    const result = plan('if not-key absent; if not-key absent; give money 1; allow; end; block; end; take money 999');
    assert.equal(result.status, 'pass'); assert.equal(result.money, 21);
    assert.equal(plan('if key absent; block; else; require key absent; end; allow').status, 'blocked');
    assert.throws(() => plan('allow; set tile unknown road'), /Unknown tile/);
});

test('confirmation continues planning and blocked plans discard the request', () => {
    const result = plan('confirm "cost?"; take money 2; confirm "cost?"; remember type "T"');
    assert.equal(result.confirmation, 'cost?'); assert.equal(result.money, 18); assert.equal(result.status, 'pass');
    assert.deepEqual(result.attemptEffects, [{op: 'remember', kind: 'type', text: 'T'}]);
    assert.equal(plan('confirm "cost?"; block').confirmation, undefined);
    assert.throws(() => plan('confirm "one"; confirm "two"'), /line 1: Conflicting confirmation/);
});

test('checksOnly evaluates incoming state without edits, confirmation, or attempt effects', () => {
    const initial = state({engine: {rules: ['r']}}), env = environment();
    const result = planMapScript(`event repeat; reward keep; remember proof "P"; generate ordinal "[1]";
confirm "cost?"; unlock rule other; disable type T; clear reward base; take money 999;
raise ordinal "[1,2]"; set count n 5; set language en;
require rule-present r; if rule-present other; block; end; require money == 20; allow`, initial, env, true);
    unchanged(result, initial, env); assert.equal(result.status, 'pass'); assert.equal(result.repeat, true);
    assert.deepEqual(result.attemptEffects, []); assert.equal(result.confirmation, undefined);
    assert.equal(result.consumeReward, undefined);
    assert.equal(plan('unlock rule r; require rule-present r', state(), {}, true).status, 'blocked');
});

test('event policy overrides completed before any effects and detects conflicting declarations', () => {
    assert.equal(plan('give money 1', state(), {completed: true}).money, 20);
    assert.equal(plan('event once; give money 1', state(), {completed: true}).money, 20);
    const result = plan('give money 1; event repeat; reward keep', state(), {completed: true});
    assert.equal(result.money, 21); assert.equal(result.repeat, true); assert.equal(result.consumeReward, false);
    assert.equal(plan('event repeat; give money 1', state(), {completed: true}, true).money, 20);
    assert.equal(plan('reward consume').consumeReward, true);
    assert.throws(() => plan('event once; if key absent; event repeat; end'), /Conflicting event/);
});

test('relief reset clears persistent/environment ownership and allows repeated payouts', () => {
    const initial = state({rewards: ['gift'], done: ['gift'], tileEdits: {gift: {type: 0, text: '5'}}});
    const reset = plan('clear reward base; require not-reward base; reset reward gift; require not-reward gift', initial,
        {rewards: new Set(['base', 'gift'])});
    assert.deepEqual(reset.state.done, []); assert.deepEqual(reset.state.removedRewards, ['base', 'gift']);
    assert.equal(reset.state.tileEdits.gift.type, 3); assert.equal(reset.state.tileEdits.gift.text, '5');
    assert.deepEqual(reset.effects, [{op: 'clear-reward', id: 'base'}, {op: 'reset', id: 'gift'}]);
    const paid = plan('unlock reward gift; require reward gift; give money 5', reset.state, {rewards: new Set(['gift'])});
    assert.equal(paid.money, 25); assert.deepEqual(paid.state.removedRewards, ['base']);
    assert.deepEqual(paid.effects, [{op: 'reward', id: 'gift'}]);
    assert.throws(() => plan('if key absent; reset reward unknown; end'), /Unknown tile/);
});

test('demolition stages tile/metric edits and language is a finite effect', () => {
    const result = plan(`demolish gate door; require tile door == road; require metric demolished == 3;
demolish gate door; require metric demolished == 3; set language en`);
    assert.equal(result.state.tileEdits.door.type, 0);
    assert.deepEqual(result.effects.at(-1), {op: 'language', value: 'en'});
    assert.throws(() => plan('set language arbitrary'), /Invalid language/);
});

test('arithmetic sees staged balances/counts/metrics and obeys precedence, min/max and bounds', () => {
    const result = plan(`set count n 2; give money 2*count(n)+1; take money max(1, min(3, currency(type)));
require money == 22; require money >= 2*currency(type);
give currency type count(n)*2; require currency type == 8;
add count n metric(steps)-256; require count n == 2;
require metric spent == 13; require metric steps >= 256;
require money == (3+8)*2; require money == 24-2; require money == 2e1+2`);
    assert.equal(result.status, 'pass'); assert.equal(result.money, 22); assert.equal(result.typeMoney, 8);
    for (const source of ['give money 1e12*2', 'take money 1-2', 'set count n 1*.5', 'give money currency(missing)',
        'if key absent; give money currency(missing); end', 'require metric unregistered == 1']) assert.throws(() => plan(source), /line 1:/);
});

test('exchange accepts a staged expression and explicit destination without counting transfers as spending', () => {
    const banks = {b: {rules: [{from: 'reasoning', to: 'type', rate: 2, feeRate: 0, feeFixed: 0, minimum: 1, rounding: 'none', precision: 0}]}};
    const result = plan('set count n 2; exchange b reasoning 2 * count(n) type; require currency type == 12', state(), {banks});
    assert.equal(result.money, 16); assert.equal(result.typeMoney, 12); assert.equal(result.spent, 0);
    assert.throws(() => plan('exchange b reasoning count(n)', state(), {banks}), /minimum|positive/i);
});

test('ordinal operations prefer live global progress and persist only explicit mutations', () => {
    const stale = state({ordinal: {...ordinal, max: [1], base: 12}});
    const live = {...ordinal, max: [1, 2], base: 4};
    const read = plan('require ordinal max == "[1,2]"; require metric ordinal-base == 4', stale, {ordinal: live});
    assert.equal(read.status, 'pass'); assert.deepEqual(read.state.ordinal, stale.ordinal);
    const normal = plan('message "normal"'); assert.equal(Object.hasOwn(normal.state, 'ordinal'), false);
    const result = plan('set ordinal current "[1]"; set ordinal base 3; raise ordinal "[1,2,2]"; require ordinal next == "[1,2,2,2]"', stale, {ordinal: live});
    assert.equal(result.status, 'pass'); assert.deepEqual(result.state.ordinal, {current: [1], max: [1, 2, 2], next: [1, 2, 2, 2], base: 3});
    assert.deepEqual(live.max, [1, 2]);
    const lower = plan('raise ordinal "[]"', stale, {ordinal: live});
    assert.deepEqual(lower.state.ordinal, stale.ordinal);
    assert.equal(plan('set ordinal max "[1]"; clear reward stepw; recompute ordinal').state.ordinal.next.at(-1), 1);
});

test('ordinal parsing/restoration/callback outputs reject unsafe sequences including zeros', () => {
    const valid = [[], [1], Array.from({length: 64}, (_, i) => i + 1)];
    for (const value of valid) assert.doesNotThrow(() => parseMapScript(`generate ordinal ${JSON.stringify(JSON.stringify(value))}`));
    for (const value of [[0], [2], [1, 0], [1, 3], [1, -1], [1, 1.5], Array(65).fill(1), [1000000]]) {
        const source = `\nset ordinal max ${JSON.stringify(JSON.stringify(value))}`;
        assert.throws(() => parseMapScript(source), /line 2:/);
        assert.throws(() => state({ordinal: {...ordinal, max: value}}), /line 1:/);
        assert.throws(() => plan('recompute ordinal', state(), {nextOrdinal: () => value}), /line 1:/);
    }
    assert.throws(() => plan('require ordinal max == "[1]"', state(), {compareOrdinals: () => NaN}), /Invalid ordinal comparison/);
    assert.throws(() => plan('if key absent; recompute ordinal; end', state(), {nextOrdinal: undefined}), /nextOrdinal/);
    assert.throws(() => plan('raise ordinal "[1]"', state(), {compareOrdinals: undefined}), /compareOrdinals/);
});

test('recursive namespaces cover command and predicate expressions, reset and demolish but preserve engines and text', () => {
    const source = `set count n 1; give money count(n); take currency type min(count(n),1);
exchange b reasoning count(n) type; if proof "count(n)" and count n == count(n);
reset reward gift; clear reward global; demolish gate door;
unlock rule r; add axiom ax "P"; unlock type T;
elif metric steps > count(n); set count n count(n)+1; else; give key k; end`;
    const rewritten = rewriteMapScript(source, id => `mod:${id}`);
    assert.match(rewritten, /set count mod:n 1/);
    assert.equal((rewritten.match(/count\(mod:n\)/g) ?? []).length, 6);
    assert.match(rewritten, /reset reward mod:gift/); assert.match(rewritten, /demolish gate mod:door/);
    assert.match(rewritten, /clear reward global/); assert.match(rewritten, /proof "count\(n\)"/);
    assert.match(rewritten, /unlock rule r/); assert.match(rewritten, /add axiom ax "P"/); assert.match(rewritten, /unlock type T/);
    assert.equal(formatMapScript(parseMapScript(rewritten)), rewritten);
});

test('new syntax retains physical lines and bounded parsing without eval or unbounded expressions', () => {
    for (const invalid of ['proof "P"', 'require proof P', 'add axiom ax schema', 'require ordinal next == [1]',
        'set ordinal base 16', 'set ordinal next "[1]"', 'event loop', 'reward forever', 'while true',
        'give money eval(1)', 'give money min(1)', 'give money max(1,2,3)', 'give money currency(type).constructor']) {
        assert.throws(() => parseMapScript(`// comment\n\n${invalid}`), /line 3:/, invalid);
    }
    assert.throws(() => parseMapScript(`give money ${'('.repeat(17)}1${')'.repeat(17)}`), /nesting/);
    assert.throws(() => parseMapScript(`give money ${Array(130).fill('1').join('+')}`), /256 nodes/);
    assert.throws(() => parseMapScript(Array(257).fill('event repeat').join(';')), /256 commands/);
    assert.equal(plan('require key absent').status, 'blocked');
    assert.throws(() => plan('remember proof "P"\nset tile missing road'), /line 2: Unknown tile/);
});
