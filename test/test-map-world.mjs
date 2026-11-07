// Exercise the shipped JavaScript modules built by the application compiler.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseWorld, worldTileId, worldRuntimeTiles, worldSaveMode, worldSaveMeta, migrateWorldSave } from '../js/hy/world.js';
import { Polygon } from '../js/hy/tiling.js';
import { parseMapScript, createMapScriptState, planMapScript } from '../js/hy/script.js';
const sid = id => worldTileId('room', id);
const clone = value => structuredClone(value);
const rule = (from = 'reasoning', to = 'type', extra = {}) => ({ from, to, rate: 2, feeRate: 0, feeFixed: 0,
    minimum: 1, rounding: 'none', precision: 0, ...extra });
const manifest = (extra = {}) => ({ format: 'deductrium-world-v1', id: 'room', title: 'Room', revision: 1,
    mode: 'standalone', spawn: { tileId: 'start', rotation: 0 }, tiles: [
        { id: 'start', hash: '', type: 0, text: 'Hello' },
        { id: 'gate', name: 'Door', hash: '1', type: 2, text: 'A', data: { p: true } },
        { id: 'reward', name: 'Gift', hash: '2', type: 3, text: 'Gift', data: { getD: 4, script: 'give money 7' } },
    ], banks: {}, migrations: [], ...extra });
const save = (w = manifest()) => ({ world: worldSaveMeta(w), rw: [worldTileId(w.id, 'reward')], dg: [worldTileId(w.id, 'gate')],
    ms: createMapScriptState({ done: [worldTileId(w.id, 'reward')], tileEdits: { [worldTileId(w.id, 'gate')]: { type: 0, text: 'old' } },
        keys: ['mod:room::key'], flags: ['mod:room::f'], counts: { 'mod:room::n': 3 }, rewards: ['macro'], disabledAxioms: ['apn5'] }),
    worldPosition: { tileId: 'gate', hash: '1', rotation: 2 }, hy: { p: '1:1,0,0,0:' }, D: 123, balances: { reasoning: 123, type: 9 } });
const edge = (from, to, remap = {}, reset = []) => ({ from, to, remap, reset });
function atomicReject(data, w, pattern) {
    const before = clone(data), beforeWorld = clone(w);
    assert.throws(() => migrateWorldSave(data, w), pattern);
    assert.deepEqual(data, before); assert.deepEqual(w, beforeWorld);
}

test('legacy script branches resolve reward resets and numeric reads without rewriting proof text', () => {
    const w = manifest();
    w.tiles[0].data = {script: [
        'if money >= currency(type) + count(visits)',
        '  reset reward Gift',
        '  clear reward Gift',
        '  demolish gate Door',
        '  give money count(visits) + 1',
        'else',
        '  require proof "$a→$a"',
        '  add axiom amod "⊢$a→$a"',
        'end',
    ].join('\n')};
    const source = worldRuntimeTiles(w)[0][1].data.script;
    assert.match(source, /reset reward mod:room::reward/);
    assert.match(source, /clear reward mod:room::reward/);
    assert.match(source, /demolish gate mod:room::gate/);
    assert.match(source, /count\(mod:room::visits\)/);
    assert.match(source, /require proof "\$a→\$a"/);
    assert.match(source, /add axiom amod "⊢\$a→\$a"/);
    for (const bad of ['reset reward missing', 'demolish gate missing',
        'if flag ready\n give money currency(mod:other)\nend']) {
        w.tiles[0].data.script = bad;
        assert.throws(() => parseWorld(w), /Unknown internal script tile|Unregistered script currency/);
    }
});

test('saved local reward ownership and tombstones follow explicit tile identity migrations', () => {
    const old = manifest(), data = save(old);
    data.ms.rewards = [sid('reward'), 'macro'];
    data.ms.removedRewards = [sid('gate'), 'JJZI-1'];
    const next = clone(old); next.revision = 2;
    next.tiles[2].id = 'renamed'; next.migrations = [edge(1, 2, {reward:'renamed'})];
    const result = migrateWorldSave(data, next);
    assert.deepEqual(result.ms.rewards, [sid('renamed'), 'macro']);
    assert.deepEqual(result.ms.removedRewards, [sid('gate'), 'JJZI-1']);
    assert.deepEqual(data.ms.rewards, [sid('reward'), 'macro']);
});

test('detached manifests, numeric world IDs, stable runtime names and isolated save mode', () => {
    const input = manifest(), w = parseWorld(input);
    assert.deepEqual(w, input); assert.notEqual(w.tiles, input.tiles);
    w.tiles[0].text = 'changed'; assert.equal(input.tiles[0].text, 'Hello');
    assert.equal(worldSaveMode(input), 'world-room'); assert.equal(sid('nested::gate'), 'mod:room::nested::gate');
    const numeric = manifest({ id: '123' }); assert.equal(parseWorld(numeric).id, '123');
    const tiles = worldRuntimeTiles(input);
    assert.equal(tiles[1][1].name, sid('gate')); assert.equal(tiles[1][1].data.worldLocalName, 'Door');
    tiles[2][1].data.getD = 99; assert.equal(input.tiles[2].data.getD, 4);
    assert.throws(() => worldTileId('room', `${'a'.repeat(80)}::${'b'.repeat(80)}`), /128/);
});

test('actual Polygon normalization, canonical collisions and syntax/path bounds', () => {
    const w = manifest(); w.tiles[1].hash = '1,0,3';
    assert.equal(parseWorld(w).tiles[1].hash, '3');
    w.tiles[1].hash = '1,0'; assert.throws(() => parseWorld(w), /canonical hash/);
    const p = new Polygon(6, 4);
    for (let seed = 1; seed <= 40; seed++) {
        let state = seed, path = [], canonical = [];
        for (let i = 0; i < 24; i++) { state = (state * 1664525 + 1013904223) >>> 0; const n = state % 6; path.push(n); p.getNeighborAndDir(canonical, n, false); }
        const one = manifest({ tiles: [{ id: 'start', hash: path.join(','), type: 0, text: '' }] });
        assert.equal(parseWorld(one).tiles[0].hash, canonical.join(','));
    }
    for (const bad of ['6', '-1', '01', '1,', ' 1', '1.0', Array(514).fill(2).join(',')]) {
        const item = manifest(); item.tiles[1].hash = bad; assert.throws(() => parseWorld(item), /hash|steps/);
    }
});

test('strict schema, duplicate IDs/names, language text and walkable spawn', () => {
    for (const change of [w => w.format = 'js', w => w.id = '_room', w => w.revision = 0,
        w => w.revision = 1.5, w => w.revision = Number.MAX_SAFE_INTEGER + 1, w => w.mode = 'creative',
        w => w.tiles[1].id = 'start', w => w.tiles[2].name = 'Door', w => w.tiles[1].name = 'reward',
        w => w.tiles[1].type = 5, w => w.tiles[1].text = { zh: 4 }, w => w.tiles[1].data = [],
        w => w.tiles[1].data.scriptRepeat = 'yes', w => w.tiles[1].data.payD = -1,
        w => w.tiles[1].data.got = true, w => w.spawn.tileId = 'missing', w => w.spawn.tileId = 'gate',
        w => w.spawn.rotation = 6, w => w.spawn.rotation = 1.5, w => w.extra = true,
        w => delete w.banks, w => w.tiles = [], w => w.tiles = Array(20001).fill(w.tiles[0])]) {
        const w = manifest(); change(w); assert.throws(() => parseWorld(w));
    }
    const w = manifest(); w.tiles[0].text = { zh: '你好', en: 'Hello' }; w.spawn.tileId = 'reward';
    assert.deepEqual(parseWorld(w).tiles[0].text, w.tiles[0].text);
});

test('plain JSON rejects hostile descriptors/prototypes/cycles/nonfinite/sparse/deep data without execution', () => {
    let called = 0;
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get() { called++; return 1; } });
    const arrayAccessor = Object.defineProperty([], '0', { enumerable: true, get() { called++; return 1; } });
    const cycle = {}; cycle.x = cycle;
    const symbol = { [Symbol('x')]: 1 };
    for (const bad of [accessor, arrayAccessor, new Date(), Object.create({ x: 1 }), cycle, symbol, { x: undefined },
        { x: NaN }, { x: Infinity }, { x: () => 2 }, { x: 1n }, { x: Array(1) },
        JSON.parse('{"constructor":0}'), JSON.parse('{"x":{"__proto__":{}}}'), JSON.parse('{"prototype":0}'),
        Object.defineProperty({}, 'x', { value: 2, enumerable: false })]) {
        const w = manifest(); w.tiles[0].data = bad; assert.throws(() => parseWorld(w));
    }
    const deep = {}; let cursor = deep; for (let i = 0; i < 33; i++) cursor = cursor.x = {};
    const w = manifest(); w.tiles[0].data = deep; assert.throws(() => parseWorld(w), /depth 32/);
    assert.equal(called, 0); assert.equal({}.polluted, undefined);
});

test('banks require explicit valid policy and only the registered builtin/own currency IDs', () => {
    const w = manifest({ currency: { id: 'mod:room', name: 'Room coin', symbol: 'R' }, banks: { b: { rules: [
        rule('reasoning', 'mod:room'), rule('type', 'mod:room'), rule('mod:room', 'reasoning'), rule('mod:room', 'type'),
    ] } } });
    assert.equal(parseWorld(w).banks.b.rules.length, 4);
    w.tiles[0].data = { bank: 'b' }; assert.equal(parseWorld(w).tiles[0].data.bank, 'b');
    for (const change of [v => v.currency.id = 'mod:other', v => v.currency.name = '', v => v.currency.name = 'x'.repeat(81),
        v => v.currency.symbol = 'x'.repeat(17), v => delete v.currency, v => v.banks.b.rules[0].to = 'mod:other',
        v => delete v.banks.b.rules[0].rate, v => v.banks.b.rules[0].rate = 0,
        v => v.banks.b.rules[0].feeRate = -1, v => v.tiles[0].data.bank = 'missing',
        v => v.tiles[0].data.bank = 1]) { const v = clone(w); change(v); assert.throws(() => parseWorld(v)); }
    const meta = worldSaveMeta(w); assert.deepEqual(meta.currency, { id: 'mod:room' });
    w.currency.name = 'Renamed'; w.currency.symbol = 'Q';
    assert.deepEqual(migrateWorldSave(save(w), w).world.currency, meta.currency);
});

test('script tokens and data tile refs isolate locals but preserve global reward/axiom/text/currency', () => {
    const w = manifest({ currency: { id: 'mod:room', name: 'Coin' }, banks: { b: { rules: [rule('reasoning', 'mod:room')] } } });
    w.tiles[0].data = { dstrTarget: ['gate', 'Door'], requiresReward: 'Gift', script:
        'give key k; require key k; set flag f; add count n 1; open gate Door; set text gate "Door; give key k"; unlock reward macro; disable axiom apn5; exchange b reasoning 2 mod:room; give currency mod:room 3; message "Door"' };
    const tile = worldRuntimeTiles(w)[0][1], commands = parseMapScript(tile.data.script);
    assert.deepEqual(tile.data.dstrTarget, [sid('gate'), sid('gate')]); assert.equal(tile.data.requiresReward, sid('reward'));
    for (const c of commands.slice(0, 6)) assert.ok(c.id.startsWith('mod:room::'));
    assert.equal(commands[5].text, 'Door; give key k'); assert.equal(commands[6].id, 'macro'); assert.equal(commands[7].id, 'apn5');
    assert.equal(commands[8].bankId, 'b'); assert.equal(commands[8].to, 'mod:room'); assert.equal(commands[9].currency, 'mod:room');
    assert.equal(commands[10].text, 'Door');
    w.tiles[0].data.requiresReward = 'macro'; assert.equal(worldRuntimeTiles(w)[0][1].data.requiresReward, 'macro');
    for (const source of ['open gate missing', 'exchange absent reasoning 1', 'exchange b reasoning 1 mod:other',
        'give currency mod:other 1', 'globalThis.executed = true']) { w.tiles[0].data.script = source; assert.throws(() => parseWorld(w)); }
    w.tiles[0].data.script = ''; w.tiles[0].data.dstrTarget = 'missing'; assert.throws(() => parseWorld(w), /reference/);
});

test('same revision allows presentation/positions/author renames but rejects any goal or identity drift atomically', () => {
    const old = manifest(), data = save(old), moved = clone(old);
    moved.title = 'Renamed'; moved.tiles[0].text = 'New'; moved.tiles[1].name = 'Renamed Door'; moved.tiles[1].hash = '3';
    moved.tiles[1].data.color = '#abc';
    const result = migrateWorldSave(data, moved); assert.deepEqual(result.dg, data.dg); assert.equal(result.worldPosition.hash, '1');
    result.ms.counts['mod:room::n'] = 99; result.hy.p = 'changed'; assert.equal(data.ms.counts['mod:room::n'], 3); assert.equal(data.hy.p, '1:1,0,0,0:');
    for (const change of [w => w.tiles[1].text = 'B', w => w.tiles[1].data.payD = 1,
        w => w.tiles[2].data.script = 'give money 8', w => w.tiles[2].data.getD = 5,
        w => w.tiles[1].type = 0, w => w.tiles.pop(), w => w.tiles.push({ id: 'new', hash: '4', type: 0, text: '' })]) {
        const w = clone(old); change(w); atomicReject(data, w, /Same revision/);
    }
});

test('ordinary/malformed/foreign/future saves and missing or malformed migration chains fail atomically', () => {
    const w = manifest();
    for (const data of [null, {}, { rw: [] }, { ...save(), world: {} }, { ...save(), world: { ...worldSaveMeta(w), id: 'other' } },
        { ...save(), world: { ...worldSaveMeta(w), revision: 2 } }, { ...save(), world: { ...worldSaveMeta(w), revision: 0 } },
        { ...save(), world: { ...worldSaveMeta(w), tiles: [{ id: sid('start'), goal: 'bad' }] } },
        { ...save(), world: { ...worldSaveMeta(w), tiles: [...worldSaveMeta(w).tiles, worldSaveMeta(w).tiles[0]] } },
        { ...save(), dg: [sid('unknown')] }, { ...save(), rw: ['mod:other::reward'] }, { ...save(), dg: ['Door'] },
        { ...save(), worldPosition: { tileId: 'unknown' } }, { ...save(), ms: { done: [sid('missing')] } }]) atomicReject(data, w);
    assert.throws(() => migrateWorldSave(undefined, w));
    atomicReject(save(), manifest({ revision: 2 }), /Missing migration/);
    for (const migrations of [[edge(2, 1)], [edge(1, 3)], [edge(1, 2), edge(1, 2)],
        [edge(1, 2, { unknown: 'gate' })], [edge(1, 2, {}, ['unknown'])], [edge(1, 2, {}, ['gate', 'gate'])]])
        atomicReject(save(), manifest({ revision: 2, migrations }));
});

test('explicit empty upgrade preserves state and once-only execution prevents a second payout', () => {
    const data = save(), w = manifest({ revision: 2, migrations: [edge(1, 2)] }), result = migrateWorldSave(data, w);
    assert.deepEqual(result.rw, data.rw); assert.deepEqual(result.dg, data.dg); assert.deepEqual(result.ms, data.ms);
    const reward = worldRuntimeTiles(w)[2][1];
    const plan = planMapScript(reward.data.script, result.ms, { money: result.D, rewards: new Set(result.rw), hasTile: () => true, hasAxiom: () => true }, result.ms.done.includes(reward.name));
    assert.equal(plan.money, data.D); assert.deepEqual(plan.effects, []);
    assert.deepEqual(migrateWorldSave(result, w), result);
});

test('goal changes require explicit decision; reset removes open/reward edits but retains script done and all balances', () => {
    const data = save(), w = manifest({ revision: 2, migrations: [edge(1, 2)] });
    w.tiles[1].text = 'B'; w.tiles[2].data.script = 'give money 99';
    atomicReject(data, w, /Changed goal/);
    w.migrations[0].reset = ['gate', 'reward'];
    const result = migrateWorldSave(data, w);
    assert.deepEqual(result.rw, []); assert.deepEqual(result.dg, []); assert.deepEqual(result.ms.tileEdits, {});
    assert.deepEqual(result.ms.done, [sid('reward')]); assert.deepEqual(result.ms.keys, data.ms.keys);
    assert.deepEqual(result.ms.counts, data.ms.counts); assert.deepEqual(result.balances, data.balances); assert.equal(result.D, 123);
    assert.equal(result.worldPosition.tileId, 'start'); assert.equal(result.worldPosition.rotation, 2); assert.equal(result.worldPosition.hash, '1'); assert.deepEqual(result.hy, data.hy);
});

test('multi-hop simultaneous remap migrates all stable progress, position and script once guards', () => {
    const data = save(), w = manifest({ revision: 3, migrations: [edge(1, 2, { gate: 'middle', reward: 'prize' }), edge(2, 3, { middle: 'door', prize: 'gift' })] });
    w.tiles[1].id = 'door'; w.tiles[1].hash = '4'; w.tiles[2].id = 'gift';
    const result = migrateWorldSave(data, w);
    assert.deepEqual(result.dg, [sid('door')]); assert.deepEqual(result.rw, [sid('gift')]); assert.deepEqual(result.ms.done, [sid('gift')]);
    assert.deepEqual(result.ms.tileEdits, { [sid('door')]: { type: 0, text: 'old' } }); assert.equal(result.worldPosition.tileId, 'door');
    assert.equal(result.worldPosition.hash, '1'); assert.deepEqual(result.hy, data.hy);
    const swap = manifest({ revision: 2, migrations: [edge(1, 2, { gate: 'reward', reward: 'gate' })] });
    [swap.tiles[1].id, swap.tiles[2].id] = ['reward', 'gate'];
    assert.deepEqual(migrateWorldSave(data, swap).dg, [sid('reward')]);
});

test('changed-target remap clears old open state, removed tiles need an explicit decision, collisions reject', () => {
    const data = save(), w = manifest({ revision: 2, migrations: [edge(1, 2, { gate: 'new' })] });
    w.tiles[1].id = 'new'; w.tiles[1].text = 'New puzzle';
    const result = migrateWorldSave(data, w); assert.deepEqual(result.dg, []); assert.deepEqual(result.ms.tileEdits, {}); assert.equal(result.worldPosition.tileId, 'start');
    const removed = manifest({ revision: 2, migrations: [edge(1, 2)] }); removed.tiles.splice(1, 1);
    atomicReject(data, removed, /Removed tile/); removed.migrations[0].remap.gate = null;
    assert.equal(migrateWorldSave(data, removed).worldPosition.tileId, 'start');
    removed.migrations[0] = edge(1, 2, {}, ['gate']); assert.deepEqual(migrateWorldSave(data, removed).dg, []);
    atomicReject(data, manifest({ revision: 2, migrations: [edge(1, 2, { gate: 'reward' })] }), /merges/);
    atomicReject(data, manifest({ revision: 2, migrations: [edge(1, 2, { gate: 'missing' })] }), /target must exist/);
});

test('standalone global rewards and extension official progress/positions survive; foreign mod IDs reject', () => {
    const data = save(); data.rw.push('macro', 'D-layer');
    assert.deepEqual(migrateWorldSave(data, manifest()).rw, data.rw);
    const w = manifest({ mode: 'extension' }), mixed = save(w); mixed.rw.push('macro'); mixed.dg.push('official-gate');
    mixed.ms.done.push('official-script'); mixed.ms.tileEdits['official-gate'] = { type: 0 };
    mixed.worldPosition = { hash: '4' };
    const result = migrateWorldSave(mixed, w); assert.deepEqual(result, mixed);
    for (const field of ['rw', 'dg']) { const bad = clone(mixed); bad[field].push('mod:other::tile'); atomicReject(bad, w); }
});


test('nested branches resolve local tile/reward aliases and validate inactive references before publication', () => {
    const w=manifest();
    w.tiles[0].data={script:`if not reward Gift and (tile Door == gate or key red)
        give key red
        if count visits == 0
            set flag ready
            unlock reward Gift
            open gate Door
        elif currency type >= 3
            give currency type 1
        else
            message "Door"
        end
    end`};
    const runtime=worldRuntimeTiles(w), source=runtime[0][1].data.script;
    assert.match(source,/reward mod:room::reward/); assert.match(source,/tile mod:room::gate/);
    assert.match(source,/key mod:room::red/); assert.match(source,/open gate mod:room::gate/);
    const plan=planMapScript(source,createMapScriptState(),{money:0,typeMoney:0,rewards:new Set(),
        hasTile:id=>runtime.some(([,tile])=>tile.name===id),hasAxiom:()=>true,getTileType:id=>runtime.find(([,tile])=>tile.name===id)?.[1].type});
    assert(plan.state.keys.includes('mod:room::red'));
    assert(plan.state.rewards.includes(sid('reward')));assert.equal(plan.state.tileEdits[sid('gate')].type,0);
    for(const body of ['open gate missing','if tile missing == road\nmessage "hi"\nend','give currency mod:other 1','exchange absent reasoning 1']){
        const bad=clone(w);bad.tiles[0].data.script=`if key red\nmessage "ok"\nelse\n${body}\nend`;
        assert.throws(()=>parseWorld(bad));
    }
});
