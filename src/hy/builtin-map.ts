import type { TileBlock } from './maploader.js';

/** Absolute source tiles. Order preserves the original map's insertion and render order. */
export interface BuiltinMapData {
    tiles: readonly (readonly [order: number, hash: string, tile: TileBlock])[];
    names: readonly (readonly [order: number, name: string, hash: string])[];
}
