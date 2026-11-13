/** Installed data-only world files. Uploading never enables a mod. */
import { parseWorld, validateWorldBase, worldRuntimeTiles } from './world.js';
import { publicationJSON, validatePublication } from './publication.js';
export const MOD_LIBRARY_KEY = 'deductrium2_mod_library';
const LIMIT = 32;
function checked(entries, dependencies = true) {
    entries = publicationJSON(entries);
    if (!Array.isArray(entries) || entries.length > LIMIT)
        throw Error('Mod library must contain at most 32 worlds');
    const ids = new Set();
    const result = entries.map(entry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)
            || Object.keys(entry).some(key => key !== 'world' && key !== 'enabled') || typeof entry.enabled !== 'boolean')
            throw Error('Invalid mod library entry');
        const world = parseWorld(entry.world);
        validatePublication(world.publication, world.id);
        if (ids.has(world.id))
            throw Error(`Duplicate mod ID: ${world.id}`);
        if (entry.enabled && world.mode !== 'extension')
            throw Error('Standalone worlds must be entered separately');
        ids.add(world.id);
        return { world, enabled: entry.enabled };
    });
    if (dependencies)
        checkDependencies(result, 'enabled');
    checkContentNames(result);
    return result;
}
/** Rules are invoked by their visible kernel name. Reject collisions before activating any worlds. */
function checkContentNames(entries) {
    const names = new Map(), symbols = new Map();
    for (const { world, enabled } of entries) {
        if (!enabled || !world.content)
            continue;
        for (const entry of [...world.content.rules, ...world.content.definitions]) {
            const owner = names.get(entry.id);
            if (owner)
                throw Error(`Mod content rule is occupied: ${entry.id} (${owner}, ${world.id})`);
            names.set(entry.id, world.id);
        }
        for (const entry of world.content.definitions) {
            const owner = symbols.get(entry.symbol);
            if (owner)
                throw Error(`Mod content symbol is occupied: ${entry.symbol} (${owner}, ${world.id})`);
            symbols.set(entry.symbol, world.id);
        }
    }
}
function checkDependencies(entries, scope) {
    const byId = new Map(entries.map(entry => [entry.world.id, entry]));
    const visiting = new Set(), visited = new Set();
    const visit = (entry, path) => {
        const world = entry.world;
        if (visiting.has(world.id))
            throw Error(`Mod dependency cycle: ${[...path, world.id].join(' -> ')}`);
        if (visited.has(world.id))
            return;
        visiting.add(world.id);
        for (const dependency of world.publication?.dependencies ?? []) {
            const target = byId.get(dependency.id);
            if (!target)
                throw Error(`Mod ${world.id} requires missing dependency ${dependency.id}`);
            if (target.world.revision < dependency.minRevision)
                throw Error(`Dependency ${dependency.id} is too old for ${world.id}: requires revision >= ${dependency.minRevision}, installed ${target.world.revision}`);
            if (dependency.maxRevision !== undefined && target.world.revision > dependency.maxRevision)
                throw Error(`Dependency ${dependency.id} is too new for ${world.id}: requires revision <= ${dependency.maxRevision}, installed ${target.world.revision}`);
            visit(target, [...path, world.id]);
            if (scope === 'enabled' && !target.enabled)
                throw Error(`Enable dependency ${dependency.id} before ${world.id}`);
        }
        visiting.delete(world.id);
        visited.add(world.id);
    };
    for (const entry of entries)
        if (scope === 'all' || entry.enabled)
            visit(entry, []);
}
/** Installed files stay disabled; enabling validates the complete required enabled graph. */
export function validateModDependencies(entries, scope = 'enabled') {
    checkDependencies(checked(entries, false), scope);
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
    checkDependencies(next, 'enabled');
    checkContentNames(next);
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