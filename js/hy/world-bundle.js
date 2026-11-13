/** Portable world files and opt-in save recovery, through the real SaveLoad transaction. */
import { migrateWorldSave, parseWorld, worldSaveMeta, worldSaveMode } from './world.js';
import { importMod, readModLibrary, saveModLibrary, validateModDependencies } from './mods.js';
import { prepareModSave } from './mod-saves.js';
import { publicationJSON } from './publication.js';
export const WORLD_BUNDLE_FORMAT = 'deductrium-world-bundle-v1';
export const WORLD_BUNDLE_PENDING_KEY = 'deductrium2_pending_world_bundle';
function fields(value, allowed, required, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw Error(`World bundle: invalid ${label}`);
    for (const key of Object.keys(value))
        if (!allowed.includes(key))
            throw Error(`World bundle: unknown ${label} field ${key}`);
    for (const key of required)
        if (!Object.hasOwn(value, key))
            throw Error(`World bundle: missing ${label}.${key}`);
}
function canonical(value) {
    const ordered = (item) => Array.isArray(item) ? item.map(ordered)
        : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])])) : item;
    return JSON.stringify(ordered(value));
}
function unpack(save) {
    fields(save, ['mode', 'worldId', 'compressed'], ['mode', 'compressed'], 'save');
    if (typeof save.mode !== 'string' || !/^(survival|creative|world-[A-Za-z0-9][A-Za-z0-9_.-]{0,79})$/.test(save.mode))
        throw Error('World bundle: invalid save mode');
    if (typeof save.compressed !== 'string' || !save.compressed.length || save.compressed.length > 4 * 1024 * 1024)
        throw Error('World bundle: invalid compressed save size');
    if (save.mode.startsWith('world-')) {
        if (typeof save.worldId !== 'string' || save.mode !== `world-${save.worldId}`)
            throw Error('World bundle: save world association does not match mode');
    }
    else if (Object.hasOwn(save, 'worldId'))
        throw Error('World bundle: normal save cannot have a world association');
    const raw = LZString.decompressFromUTF16(save.compressed);
    if (typeof raw !== 'string' || !raw.length || raw.length > 8 * 1024 * 1024)
        throw Error('World bundle: invalid or oversized compressed save');
    const pkg = publicationJSON(JSON.parse(raw));
    fields(pkg, ['version', 'mode', 'timestamp', 'data'], ['version', 'mode', 'timestamp', 'data'], 'save package');
    if (pkg.version !== 0)
        throw Error('World bundle: unsupported save version');
    if (pkg.mode !== save.mode)
        throw Error('World bundle: compressed save mode does not match association');
    if (!Number.isSafeInteger(pkg.timestamp) || pkg.timestamp < 0)
        throw Error('World bundle: invalid save timestamp');
    if (!pkg.data || typeof pkg.data !== 'object' || Array.isArray(pkg.data))
        throw Error('World bundle: invalid save data');
    return pkg;
}
function validateSave(save, worlds) {
    const { data } = unpack(save), byId = new Map(worlds.map(world => [world.id, world]));
    if (save.worldId !== undefined) {
        const world = byId.get(save.worldId);
        if (!world)
            throw Error(`World bundle: missing save world ${save.worldId}`);
        migrateWorldSave(data, world);
    }
    else {
        if (Object.hasOwn(data, 'world') || Object.hasOwn(data, 'worldPosition'))
            throw Error('World bundle: world progress cannot be associated with a normal save');
        if (data.modWorlds !== undefined && !Array.isArray(data.modWorlds))
            throw Error('World bundle: invalid modWorlds');
        for (const meta of data.modWorlds ?? []) {
            const world = byId.get(meta?.id);
            if (!world || world.mode !== 'extension')
                throw Error(`World bundle: missing saved extension ${meta?.id}`);
        }
        // Validate all saved metadata and migration paths, including disabled extensions.
        prepareModSave(data, worlds.filter(world => world.mode === 'extension').map(world => ({ world, enabled: true })));
    }
}
/** Validate every manifest and associated save before the first library/storage change. */
export function parseWorldBundle(input) {
    if (typeof input === 'string') {
        if (input.length > 8 * 1024 * 1024)
            throw Error('World bundle exceeds 8 MiB');
        input = JSON.parse(input);
    }
    const bundle = publicationJSON(input);
    fields(bundle, ['format', 'worlds', 'save'], ['format', 'worlds'], 'package');
    if (bundle.format !== WORLD_BUNDLE_FORMAT)
        throw Error('World bundle: unsupported format');
    if (!Array.isArray(bundle.worlds) || !bundle.worlds.length || bundle.worlds.length > 32)
        throw Error('World bundle must contain between 1 and 32 worlds');
    bundle.worlds = bundle.worlds.map(parseWorld);
    const seen = new Set();
    for (const world of bundle.worlds) {
        if (seen.has(world.id))
            throw Error(`World bundle: duplicate world ${world.id}`);
        seen.add(world.id);
    }
    validateModDependencies(bundle.worlds.map((world) => ({ world, enabled: false })), 'all');
    if (Object.hasOwn(bundle, 'save'))
        validateSave(bundle.save, bundle.worlds);
    return bundle;
}
export function exportWorldBundle(worlds, save) {
    const bundle = parseWorldBundle({ format: WORLD_BUNDLE_FORMAT, worlds, ...(save === undefined ? {} : { save }) });
    const output = JSON.stringify(bundle, null, 2);
    if (output.length > 8 * 1024 * 1024)
        throw Error('World bundle exceeds 8 MiB');
    return output;
}
/** Snapshot unsaved live progress in the exact version-0 UTF-16 format used by SaveLoad.save(). */
export function snapshotWorldBundle(entries, saveload, world) {
    const worlds = readWorlds(entries);
    if (world) {
        const manifest = parseWorld(world), at = worlds.findIndex(item => item.id === manifest.id);
        if (at < 0)
            worlds.push(manifest);
        else
            worlds[at] = manifest;
        if (saveload.saveMode !== worldSaveMode(manifest))
            throw Error('World bundle: snapshot world/mode mismatch');
    }
    else if (saveload.saveMode.startsWith('world-'))
        throw Error('World bundle: snapshot requires the active world');
    const compressed = LZString.compressToUTF16(JSON.stringify({ version: 0, mode: saveload.saveMode,
        timestamp: Date.now(), data: saveload.serialize() }));
    return parseWorldBundle({ format: WORLD_BUNDLE_FORMAT, worlds, save: { mode: saveload.saveMode,
            ...(world ? { worldId: world.id } : {}), compressed } });
}
function readWorlds(entries) {
    let serialized = '';
    saveModLibrary(entries, { setItem: (_key, value) => { serialized = value; } });
    return JSON.parse(serialized).mods.map(entry => entry.world);
}
/** Snapshot all touched keys. Storage failures roll back successful writes in reverse order. */
function transaction(storage, writes, commit = () => { }) {
    const previous = writes.map(([key]) => storage.getItem(key)), applied = [];
    try {
        for (let i = 0; i < writes.length; i++) {
            const [key, value] = writes[i];
            if (value === previous[i])
                continue;
            if (value === null)
                storage.removeItem(key);
            else
                storage.setItem(key, value);
            applied.push(i);
        }
        commit();
    }
    catch (error) {
        const failures = [error];
        for (const i of applied.reverse()) {
            try {
                if (previous[i] === null)
                    storage.removeItem(writes[i][0]);
                else
                    storage.setItem(writes[i][0], previous[i]);
            }
            catch (rollbackError) {
                failures.push(rollbackError);
            }
        }
        if (failures.length > 1)
            throw new AggregateError(failures, 'World bundle storage rollback failed');
        throw error;
    }
}
/** Files only: preserve existing enabled flags and keep every newly installed dependency disabled. */
export function importWorldBundle(input, storage = localStorage) {
    const bundle = parseWorldBundle(input);
    let entries = readModLibrary(storage);
    for (const world of bundle.worlds)
        entries = importMod(entries, world);
    const writes = [];
    if (bundle.save)
        writes.push([WORLD_BUNDLE_PENDING_KEY, JSON.stringify(bundle)]);
    saveModLibrary(entries, { setItem: (key, value) => writes.push([key, value]) });
    transaction(storage, writes);
    return bundle;
}
export function readPendingWorldBundle(storage = localStorage) {
    const raw = storage.getItem(WORLD_BUNDLE_PENDING_KEY);
    return raw === null ? undefined : parseWorldBundle(raw);
}
/** Requires the destination's loaded worlds; real beforeLoad and deserialize remain authoritative. */
export function restoreWorldBundleSave(input, saveload, runtimeWorlds, storage = localStorage) {
    const bundle = parseWorldBundle(input), save = bundle.save;
    if (!save)
        throw Error('World bundle has no included save');
    if (saveload.saveMode !== save.mode)
        throw Error(`Enter save mode ${save.mode} before restoring this bundle`);
    if (!saveload.beforeLoad)
        throw Error('World bundle recovery requires the game save validator');
    const data = unpack(save).data;
    const required = save.worldId === undefined ? (data.modWorlds ?? []).map((meta) => meta.id) : [save.worldId];
    const runtime = runtimeWorlds.map(parseWorld);
    for (const id of required) {
        const expected = bundle.worlds.find(world => world.id === id), loaded = runtime.find(world => world.id === id);
        if (!loaded)
            throw Error(`Enable or enter world ${id} and reload before restoring its save`);
        if (canonical(loaded) !== canonical(expected))
            throw Error(`Reload bundled world ${id} before restoring its save`);
    }
    // Remove the pending offer before import: importSave is the final fallible action, and
    // rolls back its own live state/save key. A failed import restores the pending offer.
    transaction(storage, [[WORLD_BUNDLE_PENDING_KEY, null]], () => {
        if (!saveload.importSave(save.compressed))
            throw saveload.lastLoadError ?? Error('World bundle save validation failed');
    });
}
/** Author-facing impact data; invalid/missing migration plans still produce a useful visual diff. */
export function migrationDiff(oldWorld, newWorld) {
    const old = parseWorld(oldWorld), next = parseWorld(newWorld);
    if (old.id !== next.id)
        throw Error('Migration diff requires the same world ID');
    const result = { worldId: old.id, fromRevision: old.revision, toRevision: next.revision,
        valid: true, issues: [], retained: [], moved: [], goalchanges: [], deleted: [], remapped: [], reset: [], added: [] };
    try {
        migrateWorldSave({ world: worldSaveMeta(old) }, next);
    }
    catch (error) {
        result.valid = false;
        result.issues.push(error instanceof Error ? error.message : String(error));
    }
    const prefix = `mod:${old.id}::`;
    const oldGoals = new Map(worldSaveMeta(old).tiles.map(tile => [tile.id.slice(prefix.length), tile.goal]));
    const newGoals = new Map(worldSaveMeta(next).tiles.map(tile => [tile.id.slice(prefix.length), tile.goal]));
    const identities = old.tiles.map(tile => ({ tile, target: tile.id, reset: false }));
    let revision = old.revision;
    while (revision < next.revision) {
        const edge = next.migrations.find(migration => migration.from === revision);
        if (!edge)
            break;
        for (const identity of identities) {
            if (identity.target === null)
                continue;
            const source = identity.target, target = Object.hasOwn(edge.remap, source) ? edge.remap[source] : source;
            identity.reset ||= edge.reset.includes(source) || target !== null && edge.reset.includes(target);
            identity.target = target;
        }
        revision = edge.to;
    }
    const targets = new Set(), tiles = new Map(next.tiles.map(tile => [tile.id, tile]));
    for (const identity of identities) {
        const target = identity.target === null ? undefined : tiles.get(identity.target);
        if (target)
            targets.add(target.id);
        const oldGoal = oldGoals.get(identity.tile.id), newGoal = target ? newGoals.get(target.id) : null;
        const change = { fromId: identity.tile.id, toId: target?.id ?? null,
            fromHash: identity.tile.hash, toHash: target?.hash ?? null, oldGoal, newGoal };
        if (!target) {
            result.deleted.push(change);
            continue;
        }
        if (target.id !== identity.tile.id)
            result.remapped.push(change);
        if (target.hash !== identity.tile.hash)
            result.moved.push(change);
        if (oldGoal !== newGoal)
            result.goalchanges.push(change);
        if (identity.reset || oldGoal !== newGoal)
            result.reset.push(change);
        else
            result.retained.push(change);
    }
    result.added = next.tiles.filter(tile => !targets.has(tile.id)).map(tile => ({ id: tile.id, hash: tile.hash }));
    return result;
}
//# sourceMappingURL=world-bundle.js.map