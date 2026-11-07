import type { TileBlock } from './maploader.js';
import { validateWorldBase, worldRuntimeTiles } from './world.js';
import { intuitionisticWorld } from './builtin/intuitionistic.js';

/** Main-world additions use the normal save and the same stable script IDs as their published mod. */
export function installBuiltinMods(tiles: Map<string, TileBlock>, names: Map<string, string>): void {
    const additions = worldRuntimeTiles(intuitionisticWorld);
    const base = new Map(tiles);
    // reload() may still contain this built-in's previous runtime tiles.
    for (const [hash, tile] of additions) {
        if (base.get(hash)?.name === tile.name) base.delete(hash);
    }
    validateWorldBase(intuitionisticWorld, base);
    for (const [hash, tile] of additions) {
        if (base.has(hash)) throw Error(`Built-in mod overlaps the main world: ${hash}`);
        const previous = tile.name === undefined ? undefined : names.get(tile.name);
        if (previous !== undefined && previous !== hash) throw Error(`Built-in tile name is occupied: ${tile.name}`);
    }
    // Validate the whole addition before changing the live map.
    for (const [hash, tile] of additions) {
        tiles.set(hash, tile);
        if (tile.name) names.set(tile.name, hash);
    }
}
