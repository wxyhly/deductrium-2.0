import type { BuiltinMod } from '../builtin-mods.js';
import { genOrdTiles } from '../ordinal.js';
import { mainMapModData } from './main-map.js';

/** The original main map, with its native initial ordinal region and legacy IDs. */
export const mainMapMod: BuiltinMod = {
    id: 'builtin:main', title: 'Deductrium 2.0', revision: 1, required: true,
    data: mainMapModData,
    initializeMap(p, tiles, names) {
        genOrdTiles(tiles, names, p, [1, 2, 1], [1], 5);
    },
};
