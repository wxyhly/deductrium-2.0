import { mainMapMod } from './builtin/main.js';
/** Trusted source modules use native map IDs and the existing main-world save. */
export const builtinMods = [
    mainMapMod,
];
/** Mount the base and source modules together to retain the original global order. */
export function mountBuiltinMods(p, base, tiles, names, mods = builtinMods) {
    const ids = new Set(), hashes = new Set(), aliases = new Set();
    for (const mod of mods) {
        if (ids.has(mod.id))
            throw new Error(`Duplicate built-in Mod: ${mod.id}`);
        ids.add(mod.id);
    }
    const data = [base, ...mods.map(mod => mod.data)];
    const rows = data.flatMap(part => [...part.tiles]).sort((a, b) => a[0] - b[0]);
    const labels = data.flatMap(part => [...part.names]).sort((a, b) => a[0] - b[0]);
    for (const [, hash] of rows) {
        if (hashes.has(hash))
            throw new Error(`Built-in map tile is occupied: ${hash}`);
        hashes.add(hash);
    }
    for (const [, name] of labels) {
        if (aliases.has(name))
            throw new Error(`Built-in map name is occupied: ${name}`);
        aliases.add(name);
    }
    // Cloning protects source data from rewards, scripted edits and later save loads.
    const detached = rows.map(([, hash, tile]) => [hash, structuredClone(tile)]);
    for (const mod of mods)
        mod.initializeMap?.(p, tiles, names);
    for (const [hash, tile] of detached)
        tiles.set(hash, tile);
    for (const [, name, hash] of labels)
        names.set(name, hash);
}
//# sourceMappingURL=builtin-mods.js.map