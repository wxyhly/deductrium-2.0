/** Data-only published worlds and transactional save migration; no DOM or storage access. */
import { Polygon } from './tiling.js';
import { regionContains } from './half-plane.js';
import type { HalfPlaneRegion } from './half-plane.js';
import type { TileBlock } from './maploader.js';
import { validateBankConfig } from './economy.js';
import type { BankConfig } from './economy.js';
import { validateMapBankOffer } from './bank.js';
import { createMapScriptState, parseMapScript, formatMapScript, rewriteMapScript } from './script.js';
import type { MapScriptCommand, MapScriptPredicate, MapScriptCondition, MapScriptStatement, MapScriptNumberExpression } from './script.js';

export interface WorldCurrency { id: string; name: string; symbol?: string }
export interface WorldTile {
    id: string; hash: string; type: 0 | 1 | 2 | 3 | 4;
    name?: string; text: string | Record<string, string>; data?: Record<string, any>;
}
export interface WorldMigration {
    from: number; to: number; remap: Record<string, string | null>; reset: string[];
}
export interface WorldManifest {
    format: 'deductrium-world-v1' | 'deductrium-world-v2'; id: string; title: string; revision: number;
    mode: 'standalone' | 'extension'; spawn: { tileId: string; rotation: number };
    tiles: WorldTile[]; banks: Record<string, BankConfig>; migrations: WorldMigration[];
    currency?: WorldCurrency;
    region?: HalfPlaneRegion;
    entry?: { mainHash: string; edge: number; tileId: string };
}
export interface WorldSaveMeta {
    id: string; revision: number; tiles: { id: string; goal: string }[];
    mode?: 'standalone' | 'extension';
    /** Only identity is persisted: renaming a currency does not invalidate a save. */
    currency?: { id: string };
}

const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_TILES = 20_000;
const polygon = new Polygon(6, 4);
function fail(message: string): never { throw new Error(`World: ${message}`); }
function record(value: any, label: string): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
    return value;
}
/** Clone through descriptors: getters, toJSON, exotic prototypes and sparse arrays never run. */
function json(value: any, depth = 0, ancestors = new Set<object>()): any {
    if (depth > 32) fail('JSON exceeds depth 32');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object') fail('Expected plain JSON');
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) fail('Expected plain JSON prototype');
    if (ancestors.has(value)) fail('Cyclic JSON');
    ancestors.add(value);
    const out: any = array ? [] : {};
    if (array && value.length > 1_000_000) fail('JSON array too large');
    for (const key of Reflect.ownKeys(value)) {
        if (array && key === 'length') continue;
        if (typeof key !== 'string' || FORBIDDEN.has(key)) fail('Forbidden JSON prototype key');
        if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) fail('Invalid JSON array property');
        const d = Object.getOwnPropertyDescriptor(value, key)!;
        if (!d.enumerable || !('value' in d)) fail('Expected JSON data property');
        out[key] = json(d.value, depth + 1, ancestors);
    }
    if (array && out.length !== value.length || array && Object.keys(out).length !== value.length) fail('Sparse JSON array');
    ancestors.delete(value);
    return out;
}
function fields(value: any, allowed: string[], required: string[], label: string) {
    record(value, label);
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${label}: unknown field ${key}`);
    for (const key of required) if (!Object.hasOwn(value, key)) fail(`${label}: missing ${key}`);
}
function worldId(value: any): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(value)) fail('Invalid world ID');
    return value;
}
function localId(value: any): string {
    if (typeof value !== 'string' || value.length > 512 || !value.split('::').every(p => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(p))) fail('Invalid local tile ID');
    return value;
}
function revision(value: any): number {
    if (!Number.isSafeInteger(value) || value < 1) fail('Revision must be a positive safe integer');
    return value;
}
function text(value: any, label: string, max: number, min = 0): string {
    if (typeof value !== 'string' || value.length < min || value.length > max) fail(`Invalid ${label}`);
    return value;
}
function rotation(value: any): number {
    if (!Number.isInteger(value) || value < 0 || value > 5) fail('Rotation must be 0..5');
    return value;
}
function hash(value: any): string {
    if (typeof value !== 'string' || value.length > 1024 || value !== '' && !/^[0-5](,[0-5])*$/.test(value)) fail('Invalid {6,4} tile hash');
    const path = value === '' ? [] : value.split(',').map(Number), result: number[] = [];
    if (path.length > 512) fail('Tile path exceeds 512 steps');
    for (const direction of path) polygon.getNeighborAndDir(result, direction, false);
    return result.join(',');
}
export function worldTileId(id: string, local: string): string {
    const result = `mod:${worldId(id)}::${localId(local)}`;
    if (result.length > 128) fail(`Stable tile ID exceeds script limit 128: ${result}`);
    return result;
}
function aliases(world: WorldManifest): Map<string, string> {
    const result = new Map<string, string>();
    for (const tile of world.tiles) result.set(tile.id, worldTileId(world.id, tile.id));
    for (const tile of world.tiles) if (tile.name !== undefined) {
        const stable = worldTileId(world.id, tile.id), old = result.get(tile.name);
        if (old !== undefined && old !== stable) fail(`Ambiguous tile name/ID: ${tile.name}`);
        result.set(tile.name, stable);
    }
    return result;
}
function script(source: string, world: WorldManifest, names: Map<string, string>): string {
    const registered = new Set(['reasoning', 'type', ...(world.currency ? [world.currency.id] : [])]);
    const number = (expression: MapScriptNumberExpression): void => {
        if (expression.kind === 'currency' && !registered.has(expression.currency)) fail(`Unregistered script currency: ${expression.currency}`);
        if (expression.kind === 'binary') { number(expression.left); number(expression.right); }
    };
    const reference = <T extends MapScriptCommand | MapScriptPredicate>(command: T): T => {
        if ('op' in command && command.op === 'exchange' && !Object.hasOwn(world.banks, command.bankId)) fail(`Unknown script bank: ${command.bankId}`);
        if ('currency' in command && !registered.has(command.currency)) fail(`Unregistered script currency: ${command.currency}`);
        if ('expression' in command && command.expression) number(command.expression);
        if ('op' in command && command.op === 'exchange' && command.to !== undefined && !registered.has(command.to)) fail(`Unregistered exchange target currency: ${command.to}`);
        if ('kind' in command && 'id' in command) {
            if (['gate', 'tile', 'text'].includes(command.kind)
                || ('op' in command && command.op === 'reset' && command.kind === 'reward')) {
                if (command.id === '@self') return command;
                const target = names.get(command.id);
                if (!target) fail(`Unknown internal script tile: ${command.id}`);
                return { ...command, id: target };
            }
            if (command.kind === 'reward' || command.kind === 'not-reward') return { ...command, id: names.get(command.id) ?? command.id };
        }
        return command;
    };
    const condition = (value: MapScriptCondition): MapScriptCondition => {
        if (value.op === 'predicate') return { ...value, predicate: reference(value.predicate) };
        if (value.op === 'not') return { ...value, condition: condition(value.condition) };
        return { ...value, left: condition(value.left), right: condition(value.right) };
    };
    const statements = (values: MapScriptStatement[]): MapScriptStatement[] => values.map(value => {
        if (value.op === 'on') return { ...value, body: statements(value.body) };
        if (value.op !== 'if') return reference(value);
        return { ...value, branches: value.branches.map(branch => ({...branch, condition: condition(branch.condition), body: statements(branch.body)})),
            ...(value.elseBody === undefined ? {} : {elseBody: statements(value.elseBody)}) };
    });
    const prefix = `mod:${world.id}::`;
    // Resolve tile aliases through every branch, then isolate keys/flags/counters recursively.
    return rewriteMapScript(formatMapScript(statements(parseMapScript(source))), id => id.startsWith(prefix) ? id : prefix + id);
}

function runtime(world: WorldManifest): [string, TileBlock][] {
    const names = aliases(world);
    const stableNames = new Set(names.values());
    const internal = (value: any): string => {
        if (typeof value !== 'string' || !names.has(value)) fail(`Unknown internal tile reference: ${String(value)}`);
        return names.get(value)!;
    };
    return world.tiles.map(tile => {
        const data = json(tile.data ?? {});
        if (tile.name !== undefined) data.worldLocalName = tile.name;
        if (data.dstrTarget !== undefined) data.dstrTarget = Array.isArray(data.dstrTarget) ? data.dstrTarget.map(internal) : internal(data.dstrTarget);
        if (data.requiresReward !== undefined) {
            if (typeof data.requiresReward !== 'string') fail('requiresReward must be a string');
            // Local rewards are isolated; global official rewards remain valid.
            data.requiresReward = names.get(data.requiresReward) ?? data.requiresReward;
            if (data.requiresReward.startsWith('mod:') && !stableNames.has(data.requiresReward)) fail('Foreign requiresReward');
        }
        if (data.script !== undefined) data.script = script(data.script, world, names);
        return [tile.hash, { type: tile.type, name: worldTileId(world.id, tile.id), text: json(tile.text), data }];
    });
}

/** Accept parsed JSON, return a detached validated manifest with canonical Polygon hashes. */
export function parseWorld(input: unknown): WorldManifest {
    const w = json(input);
    const required = ['format', 'id', 'title', 'revision', 'mode', 'spawn', 'tiles', 'banks', 'migrations'];
    fields(w, [...required, 'currency', 'region', 'entry'], required, 'manifest');
    if (w.format !== 'deductrium-world-v1' && w.format !== 'deductrium-world-v2') fail('Unsupported world format');
    worldId(w.id); text(w.title, 'title', 200, 1); revision(w.revision);
    if (w.mode !== 'standalone' && w.mode !== 'extension') fail('Invalid world mode');
    if (w.region !== undefined) {
        fields(w.region, ['hash', 'edge', 'side'], ['hash', 'edge', 'side'], 'region');
        w.region.hash = hash(w.region.hash); rotation(w.region.edge);
        if (w.region.side !== 1 && w.region.side !== -1) fail('Region side must be 1 or -1');
    }
    if (w.format === 'deductrium-world-v2' && !w.region) fail('World v2 requires region; choose a mod half-plane');
    if (w.format === 'deductrium-world-v2' && w.mode === 'extension' && !w.entry) fail('Extension v2 requires adjacent entry; choose an official neighbor');
    if (w.entry !== undefined) {
        if (w.mode !== 'extension') fail('Only extension worlds have an official entry');
        fields(w.entry, ['mainHash', 'edge', 'tileId'], ['mainHash', 'edge', 'tileId'], 'entry');
        w.entry.mainHash = hash(w.entry.mainHash); rotation(w.entry.edge); localId(w.entry.tileId);
    }
    if (w.currency !== undefined) {
        fields(w.currency, ['id', 'name', 'symbol'], ['id', 'name'], 'currency');
        if (w.currency.id !== `mod:${w.id}`) fail('Currency ID must equal mod:worldID');
        text(w.currency.name, 'currency name', 80, 1);
        if (w.currency.symbol !== undefined) text(w.currency.symbol, 'currency symbol', 16);
    }
    record(w.banks, 'banks');
    const currencies = new Set(['reasoning', 'type', ...(w.currency ? [w.currency.id] : [])]);
    for (const [id, config] of Object.entries(w.banks)) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(id)) fail('Invalid bank ID');
        if (id.startsWith('builtin:')) fail('Bank IDs beginning builtin: are reserved');
        const bank = validateBankConfig(config);
        for (const rule of bank.rules) if (!currencies.has(rule.from) || !currencies.has(rule.to)) fail(`Unregistered bank currency: ${id}`);
        w.banks[id] = bank;
    }
    if (!Array.isArray(w.tiles) || !w.tiles.length || w.tiles.length > MAX_TILES) fail('World needs 1..20000 tiles');
    const ids = new Set<string>(), hashes = new Set<string>(), names = new Set<string>();
    for (const tile of w.tiles) {
        fields(tile, ['id', 'hash', 'type', 'name', 'text', 'data'], ['id', 'hash', 'type', 'text'], 'tile');
        worldTileId(w.id, tile.id);
        tile.hash = hash(tile.hash);
        if (w.region && !regionContains(tile.hash, w.region, polygon)) fail(`Tile outside mod half-plane: ${tile.id}`);
        if (ids.has(tile.id) || hashes.has(tile.hash)) fail('Duplicate tile ID or canonical hash');
        ids.add(tile.id); hashes.add(tile.hash);
        if (!Number.isInteger(tile.type) || tile.type < 0 || tile.type > 4) fail('Tile type must be 0..4');
        if (typeof tile.text !== 'string') {
            record(tile.text, 'tile text');
            if (!Object.keys(tile.text).length || Object.entries(tile.text).some(([k, v]) => !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(k) || typeof v !== 'string')) fail('Invalid language text object');
        }
        if (tile.name !== undefined) {
            text(tile.name, 'tile name', 240, 1);
            if (names.has(tile.name)) fail('Duplicate tile name');
            names.add(tile.name);
        }
        if (tile.data !== undefined) {
            record(tile.data, 'tile data');
            if (tile.data.bank !== undefined && (typeof tile.data.bank !== 'string' || !Object.hasOwn(w.banks, tile.data.bank))) fail('Tile bank must reference a registered bank ID');
            if (tile.data.exchange !== undefined) {
                if (tile.type !== 3 || ['script', 'getD', 'payD', 'unl', 'requiresReward'].some(key => tile.data[key] !== undefined)) fail('Bank offers must be standalone reward actions');
                validateMapBankOffer(tile.data.exchange, w.banks);
            }
            if (tile.data.script !== undefined && typeof tile.data.script !== 'string') fail('Script must be a string');
            if (tile.data.scriptRepeat !== undefined && typeof tile.data.scriptRepeat !== 'boolean') fail('scriptRepeat must be boolean');
            for (const key of ['payD', 'getD']) if (tile.data[key] !== undefined && (typeof tile.data[key] !== 'number' || tile.data[key] < 0 || tile.data[key] > 1e12)) fail(`Invalid ${key}`);
            if (tile.data.got !== undefined || tile.data.del !== undefined || tile.data.worldLocalName !== undefined) fail('Published tile cannot contain runtime progress fields');
        }
    }
    fields(w.spawn, ['tileId', 'rotation'], ['tileId', 'rotation'], 'spawn');
    localId(w.spawn.tileId); rotation(w.spawn.rotation);
    const spawn = w.tiles.find((t: WorldTile) => t.id === w.spawn.tileId);
    if (!spawn || spawn.type !== 0 && spawn.type !== 3) fail('Spawn must be a walkable road/reward tile');
    if (w.entry) {
        const entry = w.tiles.find((t: WorldTile) => t.id === w.entry.tileId);
        if (!entry || entry.type !== 0 && entry.type !== 3) fail('Entry must be a walkable mod road/reward tile');
        const [neighbor] = polygon.getNeighborAndDir(w.entry.mainHash === '' ? [] : w.entry.mainHash.split(',').map(Number), w.entry.edge, true);
        if (neighbor.join(',') !== entry.hash) fail('Entry tile must be the exact official neighbor at entry.edge');
    }
    if (!Array.isArray(w.migrations)) fail('Migrations must be an array');
    const froms = new Set<number>();
    for (const migration of w.migrations) {
        fields(migration, ['from', 'to', 'remap', 'reset'], ['from', 'to', 'remap', 'reset'], 'migration');
        revision(migration.from); revision(migration.to);
        if (migration.from >= migration.to || migration.to > w.revision || froms.has(migration.from)) fail('Invalid or ambiguous migration edge');
        froms.add(migration.from); record(migration.remap, 'remap');
        for (const [old, next] of Object.entries(migration.remap)) {
            worldTileId(w.id, old);
            if (next !== null) worldTileId(w.id, next as string);
        }
        if (!Array.isArray(migration.reset)) fail('Reset must be an array');
        const resets = new Set<string>();
        for (const id of migration.reset) {
            worldTileId(w.id, id);
            if (resets.has(id)) fail('Duplicate reset ID');
            resets.add(id);
        }
    }
    runtime(w); // Validate all typed script tokens and references before publishing anything.
    return w as WorldManifest;
}
export function worldRuntimeTiles(world: WorldManifest): [string, TileBlock][] { return runtime(parseWorld(world)); }
/** Call with the untouched official map, before installing any extension tiles. */
export function validateWorldBase(world: WorldManifest, officialBase: ReadonlyMap<string, {type: number}>): void {
    const w = parseWorld(world);
    if (w.mode !== 'extension') return;
    if (w.entry) {
        const main = officialBase.get(w.entry.mainHash);
        if (!main || main.type !== 0 && main.type !== 3) fail('Entry mainHash must identify an existing official walkable road/reward tile');
    }
    if (w.region) {
        const opposite: HalfPlaneRegion = {...w.region, side: w.region.side === 1 ? -1 : 1};
        for (const at of officialBase.keys()) {
            if (!regionContains(hash(at), opposite, polygon)) fail(`Official tile intersects mod half-plane: ${at || 'origin'}`);
        }
    }
    for (const tile of w.tiles) if (officialBase.has(tile.hash)) fail(`Extension overlaps official tile: ${tile.id}`);
}
export function worldSaveMode(world: WorldManifest): string { return `world-${worldId(world.id)}`; }
function ordered(value: any): any {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, ordered(value[k])]));
    return value;
}
const PRESENTATION = new Set(['color', 'textColor', 'background', 'appearance', 'style', 'label', 'description', 'dstr', 'worldLocalName']);
function goal(tile: TileBlock): string {
    const data = Object.fromEntries(Object.entries(tile.data ?? {}).filter(([key]) => !PRESENTATION.has(key)));
    // Road/reward text is display-only. A proof gate's text and #imm are actual conditions.
    const puzzle = tile.type === 2 && (data.p || data.d || data.t || data.td || data.puzzle !== undefined);
    const immediate = Object.values(typeof tile.text === 'string' ? { text: tile.text } : tile.text).some(t => t.endsWith('#imm'));
    return JSON.stringify(ordered({ type: tile.type, data, ...(puzzle || immediate ? { text: tile.text } : {}) }));
}
export function worldSaveMeta(world: WorldManifest): WorldSaveMeta {
    const w = parseWorld(world);
    return { id: w.id, revision: w.revision, mode: w.mode, tiles: runtime(w).map(([, tile]) => ({ id: tile.name!, goal: goal(tile) })),
        ...(w.currency ? { currency: { id: w.currency.id } } : {}) };
}

/**
 * Existing saves only: missing world metadata (including null/undefined data) is an error.
 * Manifest migrations use LOCAL IDs, while rw/dg/ms.done/ms.tileEdits use full stable IDs.
 * Edges are simultaneous, strictly increasing and must explicitly connect saved -> current revision.
 * remap preserves progress only when the final goal matches; changed goals/reset clear rw/dg/edits.
 * ms.done survives reset/goal change to suppress repeated script payouts. remap:null deletes identity.
 * worldPosition.tileId is LOCAL (Game's contract), hash/hy.p are untouched. Reset/deletion -> spawn.
 * Keys/flags/counts, global rewards/axioms and balances are retained; no effects are executed.
 * Every validation and transformation finishes on a deep clone before the caller can commit it.
 */
export function migrateWorldSave(data: any, world: WorldManifest): any {
    const w = parseWorld(world), nextMeta = worldSaveMeta(w), next = json(data);
    record(next, 'save');
    const meta = record(next.world, 'save.world');
    fields(meta, ['id', 'revision', 'tiles', 'currency', 'mode'], ['id', 'revision', 'tiles'], 'save.world');
    if (meta.mode !== undefined && meta.mode !== w.mode) fail('Saved world mode changed');
    if (meta.id !== w.id) fail('Unknown saved world');
    revision(meta.revision);
    if (meta.revision > w.revision) fail('Future saved world revision');
    if (meta.currency !== undefined) {
        fields(meta.currency, ['id'], ['id'], 'saved currency');
        if (meta.currency.id !== `mod:${w.id}`) fail('Invalid saved currency identity');
    }
    if ((meta.currency?.id ?? null) !== (nextMeta.currency?.id ?? null)) fail('Saved currency registration changed');
    if (!Array.isArray(meta.tiles) || !meta.tiles.length || meta.tiles.length > MAX_TILES) fail('Invalid saved tile metadata');
    const prefix = `mod:${w.id}::`, oldGoals = new Map<string, string>();
    const stable = (id: any): string => {
        if (typeof id !== 'string' || !id.startsWith(prefix) || worldTileId(w.id, id.slice(prefix.length)) !== id) fail('Invalid saved stable tile ID');
        return id;
    };
    for (const tile of meta.tiles) {
        fields(tile, ['id', 'goal'], ['id', 'goal'], 'saved tile');
        stable(tile.id);
        if (typeof tile.goal !== 'string' || oldGoals.has(tile.id)) fail('Invalid/duplicate saved tile goal');
        let parsed: any;
        try { parsed = json(JSON.parse(tile.goal)); } catch { fail('Invalid saved goal JSON'); }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Number.isInteger(parsed.type) || parsed.type < 0 || parsed.type > 4) fail('Invalid saved goal type');
        oldGoals.set(tile.id, JSON.stringify(ordered(parsed)));
    }
    const finalGoals = new Map(nextMeta.tiles.map(t => [t.id, t.goal]));
    const identities = new Map([...oldGoals].map(([id, g]) => [id, { id: id as string | null, goal: g, explicit: false, reset: false }]));
    let at = meta.revision;
    while (at < w.revision) {
        const edge = w.migrations.find(m => m.from === at);
        if (!edge) fail(`Missing migration from revision ${at}`);
        const active = new Set([...identities.values()].flatMap(v => v.id === null ? [] : [v.id.slice(prefix.length)]));
        // reset may name a new target. Unknown remap sources are author typos, never silently ignored.
        for (const source of Object.keys(edge.remap)) if (!active.has(source)) fail(`Unknown migration source: ${source}`);
        const targets = new Set<string>();
        for (const value of identities.values()) {
            if (value.id === null) continue;
            const local = value.id.slice(prefix.length), mapped = Object.hasOwn(edge.remap, local);
            const target = mapped ? edge.remap[local] : local;
            value.explicit ||= mapped;
            value.reset ||= edge.reset.includes(local) || target !== null && edge.reset.includes(target);
            value.id = target === null ? null : worldTileId(w.id, target);
            if (value.id !== null) {
                if (targets.has(value.id)) fail('Migration merges tile identities');
                targets.add(value.id);
            }
        }
        for (const id of edge.reset) if (!active.has(id) && !targets.has(worldTileId(w.id, id)) && !finalGoals.has(worldTileId(w.id, id))) fail(`Unknown reset tile: ${id}`);
        at = edge.to;
    }
    if (meta.revision === w.revision && (oldGoals.size !== finalGoals.size || [...oldGoals].some(([id, g]) => finalGoals.get(id) !== g))) fail('Same revision changed tile goals or identities');
    for (const value of identities.values()) {
        if (value.id === null) continue;
        const current = finalGoals.get(value.id);
        if (current === undefined) {
            if (!value.reset) fail('Removed tile requires reset or remap:null; remap target must exist');
            value.id = null;
        } else if (current !== value.goal) {
            if (!value.explicit && !value.reset) fail('Changed goal requires explicit remap or reset');
            value.reset = true;
        }
    }
    const translate = (id: any, done = false): string | null => {
        stable(id);
        const value = identities.get(id);
        if (!value) fail(`Progress references unknown saved tile: ${id}`);
        return !done && value.reset ? null : value.id;
    };
    for (const key of ['rw', 'dg']) if (next[key] !== undefined) {
        if (!Array.isArray(next[key])) fail(`Save ${key} must be an array`);
        const output = new Set<string>();
        for (const id of next[key]) {
            if (typeof id !== 'string') fail(`Invalid save ${key} ID`);
            // Official reward IDs/gate hashes may coexist in extension saves.
            if (!id.startsWith('mod:')) { if (key === 'dg' && w.mode !== 'extension') fail('Unscoped standalone gate progress'); output.add(id); }
            else { const mapped = translate(id); if (mapped !== null) output.add(mapped); }
        }
        next[key] = [...output];
    }
    if (next.ms !== undefined) {
        const state = createMapScriptState(next.ms);
        state.done = [...new Set(state.done.flatMap(id => {
            if (!id.startsWith('mod:') && w.mode === 'extension') return [id];
            const mapped = translate(id, true); return mapped === null ? [] : [mapped];
        }))];
        if (state.eventDone) {
            const events: NonNullable<typeof state.eventDone> = {};
            for (const [id, done] of Object.entries(state.eventDone)) {
                if (!id.startsWith('mod:') && w.mode === 'extension') { events[id] = done; continue; }
                const mapped = translate(id, true);
                if (mapped !== null) events[mapped] = done;
            }
            state.eventDone = events;
        }
        const edits: typeof state.tileEdits = {};
        for (const [id, edit] of Object.entries(state.tileEdits)) {
            if (!id.startsWith('mod:') && w.mode === 'extension') { edits[id] = edit; continue; }
            const mapped = translate(id); if (mapped !== null) edits[mapped] = edit;
        }
        state.tileEdits = edits; next.ms = state;
        for (const field of ['rewards', 'removedRewards'] as const) {
            state[field] = [...new Set(state[field].flatMap(id => {
                if (!id.startsWith('mod:')) return [id];
                const mapped = translate(id); return mapped === null ? [] : [mapped];
            }))];
        }
    }
    if (next.worldPosition !== undefined) {
        const position = record(next.worldPosition, 'worldPosition');
        if (position.rotation !== undefined) rotation(position.rotation);
        if (position.hash !== undefined) hash(position.hash);
        if (position.tileId !== undefined) {
            const id = worldTileId(w.id, position.tileId), value = identities.get(id);
            if (!value) fail('Position references unknown saved tile');
            const target = value.id === null || value.reset ? w.spawn.tileId : value.id.slice(prefix.length);
            const tile = w.tiles.find(t => t.id === target)!;
            position.tileId = tile.type === 1 ? w.spawn.tileId : target;
        } else if (w.mode !== 'extension') fail('Standalone position requires tileId');
    }
    next.world = nextMeta;
    return next;
}
