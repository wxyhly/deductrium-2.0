// Exercise the same JavaScript interface consumed by Game and the world importer.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMapScript, formatMapScript, rewriteMapScript, createMapScriptState, planMapScript } from '../js/hy/script.js';

const state = input => createMapScriptState(input);
const environment = extra => ({
    money: 20, typeMoney: 4, rewards: new Set(['base']),
    hasTile: id => ['door', 'gift', 'sign', 'mod/door', 'mod/gift', 'mod/sign'].includes(id),
    hasAxiom: id => id === 'ax', getTileType: () => 2,
    engine: {
        validate(value) { if (value.text === 'bad' || value.id === 'bad') throw Error('Invalid engine reference'); },
        query(query, current) { return query.text === 'yes' || Object.values(current.engine.axioms).includes(query.text); },
    },
    ...extra,
});
const plan = (source, event, input = state(), extra = {}, checksOnly = false) =>
    planMapScript(source, input, environment({event, ...extra}), checksOnly);
const shape = value => JSON.parse(JSON.stringify(value, (key, item) => ['line', 'endLine', 'elseLine'].includes(key) ? undefined : item));
const noEffects = result => { assert.deepEqual(result.effects, []); assert.deepEqual(result.attemptEffects, []); };

test('four top-level events roundtrip with branches, physical lines and JSON text', () => {
    const source = `// ignored\non touch\nif key k\nmessage "on pass; end\\ntext"\nelif flag f\nallow\nelse\nblock\nend\nend\non pass; require proof "yes"; end\non collect; give money min(3,count(n)+1); end\non start; set language en; end`;
    const ast = parseMapScript(source);
    assert.deepEqual(ast.map(node => node.event), ['touch', 'pass', 'collect', 'start']);
    assert.deepEqual(ast.map(node => node.op), ['on', 'on', 'on', 'on']);
    assert.equal(ast[0].line, 2); assert.equal(ast[0].endLine, 10);
    assert.equal(ast[0].body[0].branches[0].body[0].line, 4);
    const formatted = formatMapScript(ast);
    assert.deepEqual(shape(parseMapScript(formatted)), shape(ast));
    assert.equal(formatMapScript(parseMapScript(formatted)), formatted);
});

test('events reject mixing, duplicate handlers, nesting and invalid control markers', () => {
    for (const source of [
        'on unknown; end', 'on "pass"; end', '"on" pass; end', 'on pass extra; end', 'on; end',
        'on pass; end; on pass; end', 'on touch; on pass; end; end',
        'if key k; on pass; end; end', 'on touch; if key k; on pass; end; end; end',
        'give key k; on pass; end', 'if key k; end; on pass; end',
        'on pass; end; give key k', 'on pass; end; if key k; end',
        'on pass; else; end', 'on pass; elif key k; end', 'on pass', 'end',
    ]) assert.throws(() => parseMapScript(source), /Map script line/, source);
    assert.throws(() => parseMapScript('\n\non pass\nif key k\nend'), /line 3: Missing end for on/);
});

test('selection executes exactly one handler including start; once is the explicit default', () => {
    const source = ['touch', 'pass', 'collect', 'start'].map(event => `on ${event}; give key ${event}; end`).join('\n');
    for (const event of ['touch', 'pass', 'collect', 'start']) {
        const result = plan(source, event);
        assert.equal(result.handled, true); assert.equal(result.event, event);
        assert.equal(result.repeat, false); assert.deepEqual(result.state.keys, [event]);
        assert.equal(result.status, 'pass'); assert.equal(result.state.eventDone, undefined);
    }
});

test('explicit scripts without a matching selection are unhandled no-ops, including empty handlers', () => {
    for (const event of [undefined, 'touch', 'start']) {
        const input = state({keys: ['old'], eventDone: {door: ['pass']}});
        const result = plan('on pass; block; end', event, input);
        assert.equal(result.handled, false); assert.equal(Object.hasOwn(result, 'event'), false);
        assert.equal(result.repeat, undefined); assert.equal(result.status, 'pass');
        assert.deepEqual(result.state, input); assert.notEqual(result.state, input);
        assert.equal(result.money, 20); noEffects(result);
    }
    assert.equal(plan('on pass; end', 'pass').handled, true);
    for (const event of ['nope', null, 0]) assert.throws(() => plan('on pass; end', event), /Unknown event/);
});

test('flat scripts remain handled and never acquire an explicit event or default policy', () => {
    for (const event of [undefined, 'touch', 'pass', 'collect', 'start']) {
        const result = plan('give key legacy; give money 2', event);
        assert.equal(result.handled, true); assert.equal(Object.hasOwn(result, 'event'), false);
        assert.equal(result.repeat, undefined); assert.equal(result.money, 22);
        assert.deepEqual(result.state.keys, ['legacy']);
    }
    assert.equal(plan('', undefined).handled, true);
    noEffects(plan('event once; give key k', 'touch', state(), {completed: true}));
    assert.deepEqual(plan('event repeat; give key k', undefined, state(), {completed: true}).state.keys, ['k']);
});

test('whole-tree preflight validates inactive references even without event selection', () => {
    for (const inactive of [
        'open gate absent', 'disable axiom absent', 'require tile absent == gate',
        'require proof "bad"', 'unlock rule bad', 'give currency absent 1',
        'give money currency(absent)', 'exchange absent reasoning 1', 'reset reward absent',
        'if key missing; open gate absent; end', 'allow; open gate absent',
    ]) for (const event of ['touch', undefined]) {
        assert.throws(() => plan(`on touch; allow; end; on collect; ${inactive}; end`, event), /line/, inactive);
    }
});

test('policies are static within each handler and independent between handlers', () => {
    const source = 'on touch; if key missing; event repeat; end; give key t; end; on pass; event once; give key p; end; on start; give key s; end';
    assert.equal(plan(source, 'touch', state(), {completed: true}).repeat, true);
    assert.deepEqual(plan(source, 'touch', state(), {completed: true}).state.keys, ['t']);
    const passed = plan(source, 'pass', state(), {completed: true});
    assert.equal(passed.repeat, false); assert.deepEqual(passed.state.keys, []); noEffects(passed);
    assert.equal(plan(source, 'start').repeat, false);
    for (const event of ['touch', undefined]) assert.throws(() => plan(
        'on touch; allow; end; on collect; event once; if key missing; event repeat; end; end', event,
    ), /Conflicting event policies/);
});

test('completed once handlers recheck incoming requirements without ordinary or attempt effects', () => {
    const source = 'on pass; give key k; remember proof "yes"; confirm "pay?"; require key k; end';
    const input = state({done: ['door'], eventDone: {door: ['pass']}});
    const failed = plan(source, 'pass', input, {completed: true});
    assert.equal(failed.status, 'blocked'); assert.equal(failed.handled, true); assert.equal(failed.event, 'pass');
    assert.deepEqual(failed.state, input); noEffects(failed); assert.equal(failed.confirmation, undefined);
    const passed = plan(source, 'pass', state({...input, keys: ['k']}), {completed: true});
    assert.equal(passed.status, 'pass'); noEffects(passed); assert.equal(passed.confirmation, undefined);
    const fresh = plan(source, 'pass', input, {completed: false});
    assert.equal(fresh.status, 'pass'); assert.equal(fresh.confirmation, 'pay?');
    assert.deepEqual(fresh.state.eventDone, input.eventDone); assert.deepEqual(fresh.state.done, input.done);
});

test('completion is caller driven and neither done store implicitly suppresses a handler', () => {
    const input = state({done: ['door'], eventDone: {door: ['touch', 'pass']}});
    const result = plan('on pass; give money 3; end', 'pass', input);
    assert.equal(result.money, 23); assert.deepEqual(result.state, input);
    assert.deepEqual(input.eventDone, {door: ['touch', 'pass']});
});

test('failed selected handler rolls back all ordinary changes but retains selected attempts', () => {
    const input = state({eventDone: {door: ['touch']}}), snapshot = structuredClone(input);
    const result = plan('on touch; remember proof "other"; end; on pass; give money 3; take money 2; give key k; open gate door; remember rule "yes"; generate ordinal "[1]"; confirm "pay?"; require key missing; end', 'pass', input);
    assert.equal(result.status, 'blocked'); assert.deepEqual(result.state, snapshot);
    assert.equal(result.money, 20); assert.equal(result.spent, 0); assert.deepEqual(result.effects, []);
    assert.equal(result.confirmation, undefined);
    assert.deepEqual(result.attemptEffects, [{op: 'remember', kind: 'rule', text: 'yes'}, {op: 'generate-ordinal', value: [1]}]);
    assert.deepEqual(input, snapshot);
});

test('pure proof and rule gates use selected staged state and terminate within the handler', () => {
    for (const kind of ['proof', 'rule']) {
        const source = `on touch; block; end; on pass; add axiom ax "P"; require ${kind} "P"; allow; block; end`;
        const result = plan(source, 'pass');
        assert.equal(result.status, 'pass'); assert.deepEqual(result.state.engine.axioms, {ax: 'P'});
        assert.equal(plan(`on pass; require ${kind} "no"; end`, 'pass').status, 'blocked');
    }
});

test('checksOnly suppresses repeat handler effects and still checks incoming conditions', () => {
    const result = plan('on pass; event repeat; give key k; require key k; end', 'pass', state(), {}, true);
    assert.equal(result.repeat, true); assert.equal(result.status, 'blocked'); noEffects(result);
});

test('reset reward preserves event completion while retaining the legacy flat reset behavior', () => {
    const input = state({done: ['gift'], rewards: ['gift'], eventDone: {gift: ['touch', 'collect']}});
    const result = plan('on start; reset reward gift; end', 'start', input);
    assert.deepEqual(result.state.done, []); assert.deepEqual(result.state.eventDone, input.eventDone);
    assert.deepEqual(result.effects, [{op: 'reset', id: 'gift'}]);
});

test('namespace rewriting descends into events, branches, predicates and numeric counters', () => {
    const source = 'on pass; if key k and count n >= count(m); open gate door; else; reset reward gift; end; require tile sign == gate; give money count(n); require proof "P"; unlock rule r; end';
    const rewritten = rewriteMapScript(source, id => `mod/${id}`);
    assert.match(rewritten, /on pass/); assert.match(rewritten, /key mod\/k/);
    assert.match(rewritten, /count mod\/n >= count\(mod\/m\)/);
    assert.match(rewritten, /open gate mod\/door/); assert.match(rewritten, /reset reward mod\/gift/);
    assert.match(rewritten, /tile mod\/sign/); assert.match(rewritten, /count\(mod\/n\)/);
    assert.match(rewritten, /require proof "P"/); assert.match(rewritten, /unlock rule r/);
    assert.throws(() => rewriteMapScript(source, () => 'bad id'), /Invalid ID/);
    assert.equal(plan(rewritten, 'pass').handled, true);
});

test('event wrappers share source, marker and structural budgets with all inactive bodies', () => {
    const nested = depth => 'on touch;' + 'if key k;'.repeat(depth) + 'allow;' + 'end;'.repeat(depth) + 'end';
    assert.doesNotThrow(() => parseMapScript(nested(15)));
    assert.doesNotThrow(() => formatMapScript(parseMapScript(nested(15))));
    assert.throws(() => parseMapScript(nested(16)), /nesting exceeds 16/);
    assert.doesNotThrow(() => parseMapScript('on pass;' + 'allow;'.repeat(254) + 'end'));
    assert.throws(() => parseMapScript('on pass;' + 'allow;'.repeat(255) + 'end'), /256 commands/);
    assert.throws(() => plan('on touch;end;on collect;' + 'allow;'.repeat(253) + 'end', 'touch'), /256 commands/);
    assert.throws(() => parseMapScript('on pass;message "' + 'a'.repeat(16384) + '";end'), /16384/);
    assert.throws(() => formatMapScript([{op: 'on', event: 'pass', line: 1, endLine: 1, body: [{op: 'on', event: 'touch', line: 1, endLine: 1, body: []}]}]), /top-level/);
});

test('eventDone roundtrips as independent JSON data and safely preserves special tile IDs', () => {
    assert.equal(state().eventDone, undefined); // Preserve the legacy default object shape.
    const input = JSON.parse('{"eventDone":{"__proto__":["touch","start"],"constructor":["pass"],"gift":["collect"]}}');
    const restored = state(input);
    assert.equal(Object.getPrototypeOf(restored.eventDone), Object.prototype);
    assert.equal(Object.hasOwn(restored.eventDone, '__proto__'), true);
    assert.deepEqual(state(JSON.parse(JSON.stringify(restored))), restored);
    restored.eventDone.__proto__.push('collect'); restored.eventDone.gift.push('start');
    assert.deepEqual(input.eventDone.__proto__, ['touch', 'start']); assert.deepEqual(input.eventDone.gift, ['collect']);
    assert.deepEqual(state({eventDone: {}}).eventDone, {});
});

test('eventDone rejects invalid IDs, nonunique/unknown events and executable restoration values', () => {
    for (const eventDone of [null, [], {door: 'pass'}, {door: ['unknown']}, {door: ['pass', 'pass']},
        {'': ['pass']}, {'bad id': ['pass']}, {['x'.repeat(129)]: ['pass']}, {door: [null]}]) {
        assert.throws(() => state({eventDone}), /Map script line/);
    }
    let accessed = false;
    const value = Object.defineProperty({}, 'door', {enumerable: true, get() { accessed = true; return ['pass']; }});
    assert.throws(() => state({eventDone: value}), /JSON data/);
    const events = Object.defineProperty([], '0', {enumerable: true, get() { accessed = true; return 'pass'; }});
    assert.throws(() => state({eventDone: {door: events}}), /JSON array entries/);
    const sparse = []; sparse.length = 1;
    assert.throws(() => state({eventDone: {door: sparse}}), /JSON array/);
    assert.equal(accessed, false);
});

test('planning clones state, completion arrays and all caller-owned inputs', () => {
    const input = state({eventDone: {door: ['touch']}, counts: {n: 2}}), snapshot = structuredClone(input);
    Object.freeze(input.eventDone.door); Object.freeze(input.eventDone); Object.freeze(input.counts); Object.freeze(input);
    const env = environment({event: 'collect', balances: Object.freeze({reasoning: 20, type: 4})});
    const result = planMapScript('on collect; add count n 1; give money 2; confirm "ok?"; end', input, env);
    assert.deepEqual(input, snapshot); assert.deepEqual(result.state.eventDone, snapshot.eventDone);
    assert.notEqual(result.state.eventDone, input.eventDone); assert.notEqual(result.state.eventDone.door, input.eventDone.door);
    result.state.eventDone.door.push('collect'); assert.deepEqual(input.eventDone.door, ['touch']);
    assert.equal(result.confirmation, 'ok?'); assert.equal(result.money, 22);
    assert.deepEqual(env.balances, {reasoning: 20, type: 4});
});

test('@self parses and formats literally while only tile positions escape namespacing', () => {
    const source = `on pass; require tile @self == gate;
if tile @self != road; open gate @self; close gate @self; demolish gate @self; end;
set tile @self reward; set text @self "@self"; reset reward @self;
give key @self; require key @self; set flag @self; require flag @self;
set count @self count(@self)+1; require count @self >= count(@self);
unlock reward @self; clear reward @self; require reward @self; end`;
    const formatted = formatMapScript(parseMapScript(source));
    assert.deepEqual(shape(parseMapScript(formatted)), shape(parseMapScript(source)));
    const rewritten = rewriteMapScript(source, id => `mod/${id}`);
    for (const text of ['tile @self == gate', 'tile @self != road', 'open gate @self', 'close gate @self',
        'demolish gate @self', 'set tile @self reward', 'set text @self "@self"', 'reset reward @self']) {
        assert.ok(rewritten.includes(text), text);
    }
    for (const text of ['give key mod/@self', 'require key mod/@self', 'set flag mod/@self',
        'require flag mod/@self', 'count mod/@self', 'count(mod/@self)', 'unlock reward @self',
        'clear reward @self', 'require reward @self']) assert.ok(rewritten.includes(text), text);
    assert.doesNotThrow(() => rewriteMapScript('on pass; open gate @self; end', () => { throw Error('must not namespace self'); }));
});

test('@self resolves every tile command and staged tile predicate to the concrete host', () => {
    const source = `on pass; require tile @self == gate; open gate @self;
if tile @self == road; close gate @self; else; block; end;
require tile @self == gate; demolish gate @self; require tile @self == road;
set tile @self reward; set text @self "changed"; require tile @self == reward;
reset reward @self; require tile @self == reward; end`;
    const input = state({eventDone: {door: ['touch']}}), snapshot = structuredClone(input);
    const queried = [];
    const result = plan(source, 'pass', input, {selfId: 'door', getTileType(id) { queried.push(id); return 2; }});
    assert.equal(result.status, 'pass'); assert.deepEqual(queried, ['door']);
    assert.deepEqual(result.state.tileEdits, {door: {type: 3, text: 'changed'}});
    assert.deepEqual(result.effects, [{op: 'open', id: 'door'}, {op: 'close', id: 'door'},
        {op: 'demolish', id: 'door'}, {op: 'tile', id: 'door', type: 3},
        {op: 'text', id: 'door', text: 'changed'}, {op: 'reset', id: 'door'}]);
    assert.deepEqual(input, snapshot); assert.deepEqual(result.state.eventDone, snapshot.eventDone);
    assert.equal(plan(source, 'pass', state(), {selfId: 'gift'}).effects[0].id, 'gift');
    assert.ok(formatMapScript(parseMapScript(source)).includes('@self'));
});

test('@self requires an available valid selfId even in inactive handlers and dead branches', () => {
    const references = ['require tile @self == gate', 'if tile @self == gate; allow; end',
        'open gate @self', 'close gate @self', 'demolish gate @self',
        'set tile @self road', 'set text @self "x"', 'reset reward @self'];
    for (const reference of references) {
        for (const wrapper of [body => body, body => `on touch; allow; end; on pass; ${body}; end`,
            body => `if key absent; ${body}; end`, body => `allow; ${body}`]) {
            const source = wrapper(reference);
            assert.throws(() => plan(source, 'touch'), /@self requires env\.selfId/, source);
            assert.throws(() => plan(source, undefined, state(), {selfId: 'absent'}), /@self target is not an available tile: absent/, source);
            assert.doesNotThrow(() => plan(source, 'touch', state(), {selfId: 'door'}), source);
        }
    }
    for (const selfId of [null, 7, '', 'bad id', 'x'.repeat(129), '@self']) {
        assert.throws(() => plan('open gate @self', undefined, state(), {selfId}), /@self requires.*env\.selfId/);
    }
    assert.throws(() => plan('\n\non pass; open gate @self; end', 'pass'), /line 3: @self/);
});

test('ordinary IDs named @self remain literal with no host binding and retain namespace behavior', () => {
    const source = 'give key @self; set flag @self; set count @self 2; add count @self count(@self); require key @self; require flag @self; require count @self == 4; unlock reward @self; require reward @self';
    for (const extra of [{}, {selfId: 'door'}]) {
        const result = plan(source, undefined, state(), extra);
        assert.equal(result.status, 'pass'); assert.deepEqual(result.state.keys, ['@self']);
        assert.deepEqual(result.state.flags, ['@self']); assert.deepEqual(result.state.counts, {'@self': 4});
        assert.deepEqual(result.state.rewards, ['@self']); assert.deepEqual(result.state.tileEdits, {});
        assert.equal(plan('clear reward @self', undefined, state({rewards: ['@self']}), extra).effects[0].id, '@self');
    }
    const rewritten = rewriteMapScript(source, id => `mod/${id}`);
    assert.deepEqual(plan(rewritten, undefined).state.keys, ['mod/@self']);
    assert.equal(plan('open gate door', undefined, state(), {selfId: 'absent'}).effects[0].id, 'door');
});

test('@self aliases concrete IDs for checksOnly, rollback and prototype-safe edits', () => {
    const input = state({tileEdits: {door: {type: 0}}, eventDone: {door: ['pass']}});
    const checked = plan('on pass; close gate @self; require tile @self == road; end', 'pass', input, {selfId: 'door', completed: true});
    assert.equal(checked.status, 'pass'); assert.deepEqual(checked.state, input); noEffects(checked);
    const blocked = plan('on pass; open gate @self; set text @self "x"; require tile door == gate; end', 'pass', state(), {selfId: 'door'});
    assert.equal(blocked.status, 'blocked'); assert.deepEqual(blocked.state, state()); noEffects(blocked);
    const special = plan('set text @self "safe"; open gate @self; require tile @self == road', undefined, state(),
        {selfId: '__proto__', hasTile: id => id === '__proto__'});
    assert.equal(Object.getPrototypeOf(special.state.tileEdits), Object.prototype);
    assert.equal(Object.hasOwn(special.state.tileEdits, '__proto__'), true);
    assert.deepEqual(special.state.tileEdits.__proto__, {text: 'safe', type: 0});
});

test('portable pure proof/rule templates demolish only their bound tile when dG is owned', () => {
    for (const kind of ['proof', 'rule']) {
        const source = `on pass; require ${kind} "yes"; if reward dG; demolish gate @self; message "delGate"; else; allow; end; end`;
        const rewritten = rewriteMapScript(source, id => `mod/${id}`);
        const passed = plan(rewritten, 'pass', state(), {selfId: 'door'});
        assert.equal(passed.status, 'pass'); noEffects(passed);
        const demolished = plan(rewritten, 'pass', state(), {selfId: 'door', rewards: new Set(['dG'])});
        assert.deepEqual(demolished.effects, [{op: 'demolish', id: 'door'}, {op: 'message', text: 'delGate'}]);
        const failed = plan(source, 'pass', state(), {selfId: 'door', rewards: new Set(['dG']), engine: {validate() {}, query() {return false;}}});
        assert.equal(failed.status, 'blocked'); noEffects(failed); assert.deepEqual(failed.state.tileEdits, {});
    }
});

test('@self preflight reaches short-circuited operands, inactive elif and else bodies', () => {
    for (const source of [
        'if not-key absent or tile @self == gate; allow; end',
        'if key absent and not (tile @self == gate); allow; end',
        'if not-key absent; allow; elif tile @self == gate; block; end',
        'if not-key absent; allow; else; reset reward @self; end',
    ]) {
        const wrapped = `on pass; ${source}; end`;
        assert.throws(() => plan(wrapped, 'pass'), /@self requires env\.selfId/);
        assert.throws(() => plan(wrapped, undefined, state(), {selfId: 'absent'}), /@self target is not an available tile/);
        assert.doesNotThrow(() => plan(wrapped, 'pass', state(), {selfId: 'door'}));
    }
    const source = 'on pass; if key absent; block; elif not (tile @self != gate) and tile door == gate; open gate @self; else; block; end; require tile door == road; end';
    const result = plan(source, 'pass', state(), {selfId: 'door'});
    assert.equal(result.status, 'pass'); assert.deepEqual(result.effects, [{op: 'open', id: 'door'}]);
});

test('mixed concrete and @self tile references rewrite and resolve independently in a collect handler', () => {
    const source = `on collect; if not (tile @self != reward) and tile door == gate;
open gate door; set text @self "key"; else; block; end; require tile door == road; end`;
    const visited = [];
    const rewritten = rewriteMapScript(source, id => { visited.push(id); return `mod/${id}`; });
    assert.ok(visited.length > 0); assert.ok(visited.every(id => id === 'door'));
    const result = plan(rewritten, 'collect', state(), {selfId: 'mod/gift', getTileType: id => id === 'mod/gift' ? 3 : 2});
    assert.equal(result.status, 'pass'); assert.deepEqual(result.effects,
        [{op: 'open', id: 'mod/door'}, {op: 'text', id: 'mod/gift', text: 'key'}]);
    assert.deepEqual(result.state.tileEdits, {'mod/door': {type: 0}, 'mod/gift': {text: 'key'}});
});
