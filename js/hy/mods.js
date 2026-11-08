/** Installed data-only world files. Uploading never enables a mod. */
import { parseWorld, validateWorldBase, worldRuntimeTiles } from './world.js';
export const MOD_LIBRARY_KEY = 'deductrium2_mod_library';
const LIMIT = 32;
function checked(entries) {
    if (!Array.isArray(entries) || entries.length > LIMIT)
        throw Error('Mod library must contain at most 32 worlds');
    const ids = new Set();
    return entries.map(entry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)
            || Object.keys(entry).some(key => key !== 'world' && key !== 'enabled') || typeof entry.enabled !== 'boolean')
            throw Error('Invalid mod library entry');
        const world = parseWorld(entry.world);
        if (ids.has(world.id))
            throw Error(`Duplicate mod ID: ${world.id}`);
        if (entry.enabled && world.mode !== 'extension')
            throw Error('Standalone worlds must be entered separately');
        ids.add(world.id);
        return { world, enabled: entry.enabled };
    });
}
export function readModLibrary(storage = localStorage) {
    const raw = storage.getItem(MOD_LIBRARY_KEY);
    if (raw === null)
        return [];
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || Object.keys(value).some(key => key !== 'version' && key !== 'mods'))
        throw Error('Unsupported mod library format');
    return checked(value.mods);
}
export function saveModLibrary(entries, storage = localStorage) {
    // One storage write: quota/validation failures leave the old library intact.
    storage.setItem(MOD_LIBRARY_KEY, JSON.stringify({ version: 1, mods: checked(entries) }));
}
export function importMod(entries, input) {
    const next = checked(entries), world = parseWorld(input), at = next.findIndex(entry => entry.world.id === world.id);
    if (at < 0) {
        if (next.length === LIMIT)
            throw Error('At most 32 worlds may be installed');
        return [...next, { world, enabled: false }];
    }
    const old = next[at];
    if (JSON.stringify(old.world) === JSON.stringify(world))
        return next;
    if (old.enabled)
        throw Error('Disable this mod before uploading an update');
    if (world.revision <= old.world.revision)
        throw Error('A mod update must have a higher revision');
    if (world.mode !== old.world.mode || world.currency?.id !== old.world.currency?.id)
        throw Error('A mod update cannot change its world mode or currency identity');
    next[at] = { world, enabled: false };
    return next;
}
export function setModEnabled(entries, id, enabled) {
    const next = checked(entries), entry = next.find(entry => entry.world.id === id);
    if (!entry)
        throw Error(`Unknown mod: ${id}`);
    if (entry.world.mode !== 'extension')
        throw Error('Standalone worlds must be entered separately');
    entry.enabled = enabled;
    return next;
}
/** Validate the complete enabled set before touching either map. */
export function installMods(entries, tiles, names) {
    installCheckedMods(checked(entries), tiles, names);
}
function installCheckedMods(entries, tiles, names) {
    const base = new Map(tiles), next = new Map(tiles), nextNames = new Map(names), banks = new Set();
    for (const { world, enabled } of entries) {
        if (!enabled)
            continue;
        validateWorldBase(world, base);
        for (const id of Object.keys(world.banks)) {
            if (banks.has(id))
                throw Error(`Mod bank ID is occupied: ${id}`);
            banks.add(id);
        }
        for (const [hash, tile] of worldRuntimeTiles(world)) {
            if (next.has(hash))
                throw Error(`Mod overlaps another world: ${world.title} (${hash})`);
            if (tile.name && nextNames.has(tile.name))
                throw Error(`Mod tile name is occupied: ${tile.name}`);
            next.set(hash, tile);
            if (tile.name)
                nextNames.set(tile.name, hash);
        }
    }
    for (const [hash, tile] of next)
        tiles.set(hash, tile);
    for (const [name, hash] of nextNames)
        names.set(name, hash);
}
//# sourceMappingURL=mods.js.map