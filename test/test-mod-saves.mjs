// Run after the normal TypeScript build; import the actual application modules.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareModSave, captureModWorlds } from '../js/hy/mod-saves.js';
import { parseWorld, worldSaveMeta, worldTileId } from '../js/hy/world.js';
import { createMapScriptState } from '../js/hy/script.js';

const clone = value => structuredClone(value);
const id = (world, tile) => worldTileId(world, tile);
const world = (name, extra = {}) => parseWorld({
    format: 'deductrium-world-v1', id: name, title: name, revision: 1, mode: 'extension',
    spawn: { tileId: 'start', rotation: 0 }, banks: {}, migrations: [],
    tiles: [
        { id: 'start', hash: '0', type: 0, text: '' },
        { id: 'prize', hash: '1', type: 3, text: 'Prize', data: { getD: 4 } },
        { id: 'gate', hash: '2', type: 2, text: '$A', data: { p: true } },
    ], ...extra,
});
const entry = (world, enabled = true) => ({ world, enabled });
function update(old, name = 'renamed', hash = '3') {
    const next = clone(old);
    next.revision++;
    next.tiles[1].id = name;
    next.tiles[1].hash = hash;
    next.migrations = [{ from: 1, to: 2, remap: { prize: name }, reset: [] }];
    return parseWorld(next);
}
function save(worlds) {
    return {
        modWorlds: worlds.map(worldSaveMeta),
        rw: ['macro', ...worlds.map(w => id(w.id, 'prize'))],
        dg: ['1,2', ...worlds.map(w => id(w.id, 'gate'))],
        ms: createMapScriptState({
            done: ['official-script', ...worlds.map(w => id(w.id, 'prize'))],
            eventDone: Object.fromEntries([['official-script', ['touch']], ...worlds.map(w => [id(w.id, 'prize'), ['touch', 'collect']])]),
            tileEdits: Object.fromEntries([['official-tile', { text: 'Official' }], ...worlds.map(w => [id(w.id, 'gate'), { type: 0 }])]),
            rewards: ['stepw', ...worlds.map(w => id(w.id, 'prize'))],
            removedRewards: ['JJZI-1', ...worlds.map(w => id(w.id, 'gate'))],
            keys: ['official-key', 'mod:alpha::key'], flags: ['mod:beta::flag'], counts: { 'mod:alpha::visits': 3 },
            engine: { rules: ['.i'], axioms: { amod: '⊢$A' }, types: ['Bool'], disabledTypes: [] },
            ordinal: { current: [1], max: [1, 2], next: [1, 2, 3], base: 15 },
        }),
        hs: { rules: 'trusted proof bytes', sheets: [{ steps: ['hyp $A', 'mp'] }] },
        tt: { proof: 'unchanged' }, balances: { reasoning: 123, type: 9, 'mod:alpha': 6 },
        D: 123, DC: 7, TC: 2, ac: ['firstEat'], hy: { p: '4:0.9,0.1,0.2,0.3:1', extra: true },
    };
}
function rejectUnchanged(data, entries, pattern) {
    const before = clone(data), beforeEntries = clone(entries);
    assert.throws(() => prepareModSave(data, entries), pattern);
    assert.deepEqual(data, before);
    assert.deepEqual(entries, beforeEntries);
}

test('multiple mod migrations isolate stable IDs and preserve official, proof, currency and other script state', () => {
    const alpha = world('alpha'), beta = world('beta');
    const nextA = update(alpha), nextB = update(beta, 'new-prize', '4');
    const data = save([alpha, beta]), before = clone(data);
    const result = prepareModSave(data, [entry(nextA), entry(nextB)]);
    const expected = clone(before);
    expected.modWorlds = [worldSaveMeta(nextA), worldSaveMeta(nextB)];
    for (const [old, next] of [[id('alpha', 'prize'), id('alpha', 'renamed')], [id('beta', 'prize'), id('beta', 'new-prize')]]) {
        for (const values of [expected.rw, expected.ms.done, expected.ms.rewards]) values[values.indexOf(old)] = next;
        expected.ms.eventDone[next] = expected.ms.eventDone[old]; delete expected.ms.eventDone[old];
    }
    assert.deepEqual(result, expected);
    assert.deepEqual(data, before);
    result.hs.sheets[0].steps.push('detached');
    assert.deepEqual(data, before);
});

test('disabled and removed mods keep all progress and old metadata until enabled again', () => {
    const alpha = world('alpha'), beta = world('beta'), missing = world('removed');
    const newer = update(alpha); newer.migrations = [];
    const data = save([alpha, beta, missing]), before = clone(data);
    assert.deepEqual(prepareModSave(data, [entry(newer, false), entry(beta)]), before);
    rejectUnchanged(data, [entry(newer), entry(beta)], /migration/i);
});

test('capture keeps disabled and removed metadata while enabled extensions replace the current version', () => {
    const alpha = world('alpha'), beta = world('beta'), removed = world('removed');
    const newer = update(alpha), standalone = world('solo', { mode: 'standalone' });
    const previous = [alpha, beta, removed].map(worldSaveMeta), before = clone(previous);
    const captured = captureModWorlds(previous, [entry(newer), entry(update(beta), false), entry(standalone)]);
    assert.deepEqual(captured, [worldSaveMeta(newer), worldSaveMeta(beta), worldSaveMeta(removed)]);
    assert.deepEqual(previous, before);
    captured[0].tiles[0].goal = 'changed';
    assert.deepEqual(previous, before);
    assert.deepEqual(captureModWorlds([], [entry(beta, false), entry(standalone)]), []);
});

test('a later mod migration failure leaves the whole save and all installed manifests unchanged', () => {
    const alpha = world('alpha'), beta = world('beta');
    const broken = update(beta); broken.migrations = [];
    rejectUnchanged(save([alpha, beta]), [entry(update(alpha)), entry(broken)], /migration/i);
});

test('old normal saves adopt enabled metadata without touching already scoped progress or proof bytes', () => {
    const alpha = world('alpha'), data = save([alpha]); delete data.modWorlds;
    const before = clone(data), result = prepareModSave(data, [entry(alpha)]);
    assert.deepEqual(result, { ...before, modWorlds: [worldSaveMeta(alpha)] });
    assert.deepEqual(data, before);
    const official = { hs: { r: 'original' }, rw: ['macro'], hy: { p: ':1,0,0,0:' } };
    assert.deepEqual(prepareModSave(official, []), { ...official, modWorlds: [] });
});

test('gate IDs, tile edits and reward tombstones migrate without normalizing old engine state', () => {
    const alpha = world('alpha'), next = update(alpha);
    next.tiles[2].id = 'door'; next.migrations[0].remap.gate = 'door';
    const data = save([alpha]);
    data.ms.engine = { oldFormat: 'original proof trust chain', axioms: { proof: 'exact bytes' } };
    delete data.ms.ordinal; delete data.ms.keys;
    const result = prepareModSave(data, [entry(next)]);
    assert.deepEqual(result.dg, ['1,2', id('alpha', 'door')]);
    assert.deepEqual(result.ms.tileEdits, { 'official-tile': { text: 'Official' }, [id('alpha', 'door')]: { type: 0 } });
    assert.deepEqual(result.ms.removedRewards, ['JJZI-1', id('alpha', 'door')]);
    assert.deepEqual(result.ms.engine, data.ms.engine);
    assert(!Object.hasOwn(result.ms, 'keys'));
    assert(!Object.hasOwn(result.ms, 'ordinal'));
});

test('goal resets clear claims and edits but retain once guards including eventDone', () => {
    const alpha = world('alpha'), next = clone(alpha);
    next.revision = 2; next.tiles[1].data.getD = 8;
    next.migrations = [{ from: 1, to: 2, remap: {}, reset: ['prize'] }];
    const data = save([alpha]); data.ms.tileEdits[id('alpha', 'prize')] = { type: 0 };
    const result = prepareModSave(data, [entry(parseWorld(next))]);
    assert.deepEqual(result.rw, ['macro']);
    assert.deepEqual(result.ms.rewards, ['stepw']);
    assert(!Object.hasOwn(result.ms.tileEdits, id('alpha', 'prize')));
    assert(result.ms.done.includes(id('alpha', 'prize')));
    assert.deepEqual(result.ms.eventDone[id('alpha', 'prize')], ['touch', 'collect']);
    assert.deepEqual(result.hs, data.hs); assert.deepEqual(result.balances, data.balances);
});

test('saved mod positions follow remapped identities and canonical hashes with an identity camera', () => {
    const alpha = world('alpha'), newer = update(alpha, 'renamed', '1,0,3');
    const data = save([alpha]);
    data.modPosition = { worldId: 'alpha', tileId: 'prize', hash: '1', entryHash: '5' };
    const before = clone(data), result = prepareModSave(data, [entry(newer)]);
    assert.deepEqual(result.modPosition, { worldId: 'alpha', tileId: 'renamed', hash: '3', entryHash: '5' });
    assert.deepEqual(result.hy, { p: '3:1,0,0,0:1', extra: true });
    assert.deepEqual(data, before);
});

test('unchanged positions preserve the saved camera during normal loads and metadata-only upgrades', () => {
    const alpha = world('alpha'), newer = clone(alpha);
    newer.revision = 2; newer.title = 'New title';
    newer.migrations = [{from: 1, to: 2, remap: {}, reset: []}];
    const data = save([alpha]);
    data.hy.p = '1:0.9,0.1,0.2,0.3:1';
    data.modPosition = {worldId: 'alpha', tileId: 'prize', hash: '1'};
    for (const manifest of [alpha, parseWorld(newer)]) {
        const result = prepareModSave(data, [entry(manifest)]);
        assert.deepEqual(result.hy, data.hy);
        assert.deepEqual(result.modPosition, data.modPosition);
    }
});

test('deleted or reset position identities relocate to the current spawn', () => {
    for (const remove of [false, true]) {
        const alpha = world('alpha'), next = clone(alpha);
        next.revision = 2;
        next.migrations = [{ from: 1, to: 2, remap: remove ? { prize: null } : {}, reset: remove ? [] : ['prize'] }];
        if (remove) next.tiles.splice(1, 1);
        const data = save([alpha]);
        data.modPosition = { worldId: 'alpha', tileId: 'prize', hash: '1' };
        const result = prepareModSave(data, [entry(parseWorld(next))]);
        assert.deepEqual(result.modPosition, { worldId: 'alpha', tileId: 'start', hash: '0' });
        assert.equal(result.hy.p, '0:1,0,0,0:1');
    }
});

test('disabled or removed positions return to the saved official entry or origin and keep mod progress', () => {
    const alpha = world('alpha');
    for (const entries of [[], [entry(alpha, false)]]) for (const entryHash of [undefined, '5']) {
        const data = save([alpha]);
        data.modPosition = { worldId: 'alpha', tileId: 'prize', hash: '1', ...(entryHash === undefined ? {} : { entryHash }) };
        const result = prepareModSave(data, entries);
        assert(!Object.hasOwn(result, 'modPosition'));
        assert.equal(result.hy.p, `${entryHash ?? ''}:1,0,0,0:1`);
        assert.deepEqual(result.modWorlds, data.modWorlds);
        assert.deepEqual(result.rw, data.rw); assert.deepEqual(result.ms, data.ms);
    }
});

test('legacy raw positions evacuate known disabled tiles without disturbing active collisions or unknown positions', () => {
    const disabled = world('disabled', { entry: { mainHash: '', edge: 0, tileId: 'start' } });
    const enabled = world('enabled');
    const data = save([disabled]); data.hy.p = '1:0.9,0.1,0.2,0.3:1';
    assert.equal(prepareModSave(data, [entry(disabled, false)]).hy.p, ':1,0,0,0:1');
    assert.equal(prepareModSave(data, [entry(disabled, false), entry(enabled)]).hy.p, data.hy.p);
    assert.equal(prepareModSave(data, []).hy.p, data.hy.p);
    const unknown = clone(data); unknown.hy.p = '5:0.9,0.1,0.2,0.3:1,2';
    assert.deepEqual(prepareModSave(unknown, [entry(disabled, false)]).hy, unknown.hy);
    const standalone = world('standalone', { mode: 'standalone' });
    assert.deepEqual(prepareModSave(data, [entry(standalone, false)]).hy, data.hy);
    const withEntry = world('entry', {
        tiles: [{ id: 'start', hash: '5,1', type: 0, text: '' }],
        entry: { mainHash: '5', edge: 1, tileId: 'start' },
    });
    const fromEntry = { hy: { p: '5,1:0.9,0.1,0.2,0.3:' } };
    assert.equal(prepareModSave(fromEntry, [entry(withEntry, false)]).hy.p, '5:1,0,0,0:');
});

test('metadata defaults only when absent; wrong types never yield a currency allowlist', () => {
    for (const modWorlds of [null, {}, '', 0, { currency: { id: 'mod:forged' } }]) {
        rejectUnchanged({ modWorlds, balances: { 'mod:forged': 100 } }, [], /array/i);
    }
    const currency = world('coins', { currency: { id: 'mod:coins', name: 'Coins' } });
    const data = { modWorlds: [worldSaveMeta(currency)], balances: { 'mod:coins': 100 } };
    assert.deepEqual(prepareModSave(data, []), data);
});

test('namespace matching is exact and foreign duplicates and raw state remain intact', () => {
    const alpha = world('alpha'), foreign = id('alpha-extra', 'unknown');
    const data = save([alpha]);
    data.rw = [foreign, id('alpha', 'prize'), foreign, 'official', 'official'];
    data.ms.eventDone[foreign] = ['touch'];
    data.ms.tileEdits[foreign] = { text: 'Kept' };
    const result = prepareModSave(data, [entry(update(alpha))]);
    assert.deepEqual(result.rw, [foreign, id('alpha', 'renamed'), foreign, 'official', 'official']);
    assert.deepEqual(result.ms.eventDone[foreign], ['touch']);
    assert.deepEqual(result.ms.tileEdits[foreign], { text: 'Kept' });
});

test('saved metadata is validated even for disabled or absent mods, including unsafe goal JSON', () => {
    const alpha = world('alpha');
    for (const change of [
        meta => meta.revision = 0,
        meta => meta.revision = Number.MAX_SAFE_INTEGER + 1,
        meta => meta.mode = 'standalone',
        meta => meta.extra = true,
        meta => meta.currency = { id: 'mod:other' },
        meta => meta.tiles[0].id = id('other', 'start'),
        meta => meta.tiles.push(clone(meta.tiles[0])),
        meta => meta.tiles[0].goal = '{"type":0,"__proto__":{}}',
        meta => meta.tiles[0].goal = '{"type":99}',
        meta => meta.tiles[0].extra = true,
        meta => meta.tiles = [],
    ]) {
        const data = save([alpha]); change(data.modWorlds[0]);
        rejectUnchanged(data, [], /World|Mod/i);
        assert.throws(() => captureModWorlds(data.modWorlds, []), /World|Mod/i);
    }
    const data = save([alpha]); data.modWorlds.push(clone(data.modWorlds[0]));
    rejectUnchanged(data, [], /duplicate/i);
});

test('active scope unknown progress, changed goals and currency registration cannot bypass migration', () => {
    const alpha = world('alpha');
    const unknown = save([alpha]); unknown.rw.push(id('alpha', 'unknown'));
    rejectUnchanged(unknown, [entry(alpha)], /unknown/i);
    const changed = clone(alpha); changed.tiles[1].data.getD = 7;
    rejectUnchanged(save([alpha]), [entry(parseWorld(changed))], /revision|goal/i);
    const currency = world('alpha', { currency: { id: 'mod:alpha', name: 'Coins' } });
    rejectUnchanged(save([alpha]), [entry(currency)], /currency/i);
    const duplicate = [entry(alpha), entry(alpha)];
    rejectUnchanged(save([alpha]), duplicate, /duplicate/i);
});

test('position validation rejects foreign, missing and malformed identities atomically', () => {
    const alpha = world('alpha');
    for (const position of [
        { worldId: 'alpha', tileId: 'missing', hash: '1' },
        { worldId: 'alpha', tileId: 'mod:other::prize', hash: '1' },
        { worldId: 'alpha', tileId: 'prize', hash: '6' },
        { worldId: 'alpha', tileId: 'prize', hash: '1', entryHash: 'bad' },
        { worldId: 'alpha', tileId: 'prize', hash: '1', extra: true },
    ]) {
        const data = save([alpha]); data.modPosition = position;
        rejectUnchanged(data, [entry(alpha)], /World|Mod/i);
    }
});

test('preflight never invokes getters or toJSON and rejects prototype injection', () => {
    let invoked = 0;
    const data = { hs: {} };
    Object.defineProperty(data.hs, 'proof', { enumerable: true, get() { invoked++; return 'unsafe'; } });
    assert.throws(() => prepareModSave(data, []), /JSON|property/i);
    assert.equal(invoked, 0);
    const withToJSON = { toJSON() { invoked++; return {}; } };
    assert.throws(() => prepareModSave(withToJSON, []), /JSON|property/i);
    assert.equal(invoked, 0);
    assert.throws(() => prepareModSave(JSON.parse('{"__proto__":{}}'), []), /prototype/i);
    const sparse = []; sparse.length = 1;
    assert.throws(() => prepareModSave({ modWorlds: sparse }, []), /Sparse|JSON/i);
});
