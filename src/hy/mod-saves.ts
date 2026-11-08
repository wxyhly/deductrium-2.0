/** Pure normal/survival save preflight. Standalone worlds retain their separate save path. */
import { migrateWorldSave, parseWorld, worldSaveMeta, worldTileId } from './world.js';
import type { WorldManifest, WorldSaveMeta } from './world.js';
import type { ModEntry } from './mods.js';
import { Polygon } from './tiling.js';

export interface ModSavePosition { worldId: string; tileId: string; hash: string; entryHash?: string }
const polygon = new Polygon(6, 4);
const arrays = ['done', 'rewards', 'removedRewards'] as const;
const dictionaries = ['eventDone', 'tileEdits'] as const;
function fail(message: string): never { throw new Error(`Mod save: ${message}`); }
function record(value: any, label: string): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
    return value;
}

// Match world's descriptor-based JSON boundary without invoking getters or toJSON on a save.
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
        if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('Forbidden JSON prototype key');
        if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) fail('Invalid JSON array property');
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!descriptor.enumerable || !('value' in descriptor)) fail('Expected JSON data property');
        out[key] = json(descriptor.value, depth + 1, ancestors);
    }
    if (array && (out.length !== value.length || Object.keys(out).length !== value.length)) fail('Sparse JSON array');
    ancestors.delete(value);
    return out;
}

function extensions(entries: readonly ModEntry[]): ModEntry[] {
    if (!Array.isArray(entries)) fail('Installed mods must be an array');
    const seen = new Set<string>();
    return json(entries).flatMap((entry: ModEntry) => {
        record(entry, 'entry');
        if (typeof entry.enabled !== 'boolean') fail('Invalid enabled flag');
        const world = parseWorld(entry.world);
        if (seen.has(world.id)) fail(`Duplicate installed mod: ${world.id}`);
        seen.add(world.id);
        return world.mode === 'extension' ? [{world, enabled: entry.enabled}] : [];
    });
}

/** Reuse the world's complete metadata validator even when the original manifest is unavailable. */
function metadata(input: readonly WorldSaveMeta[]): WorldSaveMeta[] {
    if (!Array.isArray(input)) fail('modWorlds must be an array');
    const seen = new Set<string>();
    return json(input).map((meta: WorldSaveMeta) => {
        record(meta, 'world metadata');
        if (!Number.isSafeInteger(meta.revision) || meta.revision < 1) fail('Invalid metadata revision');
        if (!Array.isArray(meta.tiles)) fail('Invalid metadata tiles');
        const prefix = `mod:${meta.id}::`;
        const reset = meta.tiles.map(tile => {
            record(tile, 'saved tile');
            if (typeof tile.id !== 'string' || !tile.id.startsWith(prefix)) fail('Invalid saved stable tile ID');
            return tile.id.slice(prefix.length);
        });
        // A validation-only retirement migration avoids depending on old geometry/scripts/goals.
        // The original positive revision is checked above; its real value and metadata are retained.
        const validator = parseWorld({
            format: 'deductrium-world-v1', id: meta.id, title: 'Metadata validation', revision: 2,
            mode: 'extension', spawn: {tileId: 'validation', rotation: 0}, banks: {},
            tiles: [{id: 'validation', hash: '', type: 0, text: ''}],
            migrations: [{from: 1, to: 2, remap: {}, reset}],
            ...(meta.currency === undefined ? {} : {currency: {id: meta.currency?.id, name: 'Saved currency'}}),
        });
        migrateWorldSave({world: {...meta, revision: 1}}, validator);
        if (seen.has(meta.id)) fail(`Duplicate saved mod: ${meta.id}`);
        seen.add(meta.id);
        return meta;
    });
}

function capture(previous: WorldSaveMeta[], entries: readonly ModEntry[]): WorldSaveMeta[] {
    const result = new Map(previous.map(meta => [meta.id, meta]));
    for (const {world, enabled} of entries) if (enabled) result.set(world.id, worldSaveMeta(world));
    return [...result.values()];
}

/** Disabled/uninstalled metadata remains authoritative until that extension is enabled and migrated. */
export function captureModWorlds(previous: readonly WorldSaveMeta[], entries: readonly ModEntry[]): WorldSaveMeta[] {
    return capture(metadata(previous), extensions(entries));
}

function hash(input: any): string {
    if (typeof input !== 'string' || input.length > 1024 || input !== '' && !/^[0-5](,[0-5])*$/.test(input)) fail('Invalid tile hash');
    const path = input === '' ? [] : input.split(',').map(Number), result: number[] = [];
    if (path.length > 512) fail('Tile path exceeds 512 steps');
    for (const direction of path) polygon.getNeighborAndDir(result, direction, false);
    return result.join(',');
}

function position(input: any): ModSavePosition {
    record(input, 'modPosition');
    if (Object.keys(input).some(key => !['worldId', 'tileId', 'hash', 'entryHash'].includes(key))) fail('Unknown modPosition field');
    worldTileId(input.worldId, input.tileId);
    input.hash = hash(input.hash);
    if (Object.hasOwn(input, 'entryHash')) input.entryHash = hash(input.entryHash);
    return input;
}

function move(data: any, at: string): void {
    const hy = data.hy === undefined ? {} : record(data.hy, 'hy');
    const ordinal = typeof hy.p === 'string' ? hy.p.split(':')[2] ?? '' : '';
    data.hy = {...hy, p: `${at}:1,0,0,0:${ordinal}`};
}

function scopedArray(input: any, owns: (id: string) => boolean): string[] {
    if (!Array.isArray(input) || input.some(id => typeof id !== 'string')) fail('Progress IDs must be an array of strings');
    return input.filter(owns);
}
function scopedDictionary(input: any, owns: (id: string) => boolean): Record<string, any> {
    return Object.fromEntries(Object.entries(record(input, 'script progress')).filter(([id]) => owns(id)));
}
function mergeArray(input: string[], output: string[], owns: (id: string) => boolean): string[] {
    // Leave every foreign/official value in order, including duplicates; only replace this scope.
    const result: string[] = [];
    let inserted = false;
    for (const id of input) {
        if (!owns(id)) result.push(id);
        else if (!inserted) { result.push(...output); inserted = true; }
    }
    return result;
}
function mergeDictionary(input: Record<string, any>, output: Record<string, any>, owns: (id: string) => boolean) {
    return {...Object.fromEntries(Object.entries(input).filter(([id]) => !owns(id))), ...output};
}

/** Clone, isolate each enabled extension, validate/migrate it, then merge only its stable-ID fields. */
export function prepareModSave(data: any, entries: readonly ModEntry[]): any {
    const next = record(json(data), 'save'), installed = extensions(entries);
    const previous = metadata(Object.hasOwn(next, 'modWorlds') ? next.modWorlds : []);
    const saved = new Map(previous.map(meta => [meta.id, meta]));
    const at = Object.hasOwn(next, 'modPosition') ? position(next.modPosition) : undefined;
    for (const {world, enabled} of installed) {
        if (!enabled) continue;
        const owns = (id: string) => id.startsWith(`mod:${world.id}::`);
        const scoped: any = {world: saved.get(world.id) ?? worldSaveMeta(world)};
        for (const field of ['rw', 'dg'] as const) if (Object.hasOwn(next, field)) scoped[field] = scopedArray(next[field], owns);
        if (Object.hasOwn(next, 'ms')) {
            record(next.ms, 'ms');
            scoped.ms = {};
            for (const field of arrays) if (Object.hasOwn(next.ms, field)) scoped.ms[field] = scopedArray(next.ms[field], owns);
            for (const field of dictionaries) if (Object.hasOwn(next.ms, field)) scoped.ms[field] = scopedDictionary(next.ms[field], owns);
        }
        if (at?.worldId === world.id) scoped.worldPosition = {tileId: at.tileId, hash: at.hash};
        const migrated = migrateWorldSave(scoped, world);
        for (const field of ['rw', 'dg'] as const) if (Object.hasOwn(scoped, field)) next[field] = mergeArray(next[field], migrated[field], owns);
        if (scoped.ms) {
            for (const field of arrays) if (Object.hasOwn(scoped.ms, field)) next.ms[field] = mergeArray(next.ms[field], migrated.ms[field], owns);
            for (const field of dictionaries) if (Object.hasOwn(scoped.ms, field)) next.ms[field] = mergeDictionary(next.ms[field], migrated.ms[field], owns);
        }
        if (at?.worldId === world.id) {
            const tile = world.tiles.find(tile => tile.id === migrated.worldPosition.tileId)!;
            next.modPosition = {...at, tileId: tile.id, hash: tile.hash};
            if (typeof next.hy?.p !== 'string' || next.hy.p.split(':')[0] !== tile.hash) move(next, tile.hash);
        }
    }
    if (at && !installed.some(entry => entry.enabled && entry.world.id === at.worldId)) {
        move(next, at.entryHash ?? '');
        delete next.modPosition;
    } else if (!at && typeof next.hy?.p === 'string') {
        // Legacy IPC saves have no position identity. Only known disabled geometry is actionable.
        const raw = next.hy.p.split(':')[0];
        const occupied = installed.some(entry => entry.enabled && entry.world.tiles.some(tile => tile.hash === raw));
        const disabled = !occupied && installed.find(entry => !entry.enabled && entry.world.tiles.some(tile => tile.hash === raw));
        if (disabled) move(next, disabled.world.entry?.mainHash ?? '');
    }
    next.modWorlds = capture(previous, installed);
    return next;
}
