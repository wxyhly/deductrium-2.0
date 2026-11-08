import type { TileBlock } from './maploader.js';
import type { BuiltinMapData } from './builtin-map.js';
import type { Polygon } from './tiling.js';
import { mainMapMod } from './builtin/main.js';

export interface BuiltinMod {
    readonly id: string;
    readonly title: string;
    readonly revision: number;
    readonly required: true;
    readonly data: BuiltinMapData;
    initializeMap?(p: Polygon, tiles: Map<string, TileBlock>, names: Map<string, string>): void;
}

/** Trusted source modules use native map IDs and the existing main-world save. */
export const builtinMods: readonly BuiltinMod[] = [
    mainMapMod,
];

/** Mount the base and source modules together to retain the original global order. */
export function mountBuiltinMods(
    p: Polygon, base: BuiltinMapData, tiles: Map<string, TileBlock>, names: Map<string, string>,
    mods: readonly BuiltinMod[] = builtinMods,
): void {
    const ids = new Set<string>(), hashes = new Set<string>(), aliases = new Set<string>();
    for (const mod of mods) {
        if (ids.has(mod.id)) throw new Error(`Duplicate built-in Mod: ${mod.id}`);
        ids.add(mod.id);
    }
    const data = [base, ...mods.map(mod => mod.data)];
    const rows = data.flatMap(part => [...part.tiles]).sort((a, b) => a[0] - b[0]);
    const labels = data.flatMap(part => [...part.names]).sort((a, b) => a[0] - b[0]);
    for (const [, hash] of rows) {
        if (hashes.has(hash)) throw new Error(`Built-in map tile is occupied: ${hash}`);
        hashes.add(hash);
    }
    for (const [, name] of labels) {
        if (aliases.has(name)) throw new Error(`Built-in map name is occupied: ${name}`);
        aliases.add(name);
    }
    // Cloning protects source data from rewards, scripted edits and later save loads.
    const detached = rows.map(([, hash, tile]) => [hash, structuredClone(tile)] as const);
    for (const mod of mods) mod.initializeMap?.(p, tiles, names);
    for (const [hash, tile] of detached) tiles.set(hash, tile);
    for (const [, name, hash] of labels) names.set(name, hash);
}
