import { installMods, readModLibrary } from './mods.js';
let runtimeError;
function installed() {
    if (typeof localStorage === 'undefined')
        return [];
    try {
        return readModLibrary();
    }
    catch (error) {
        runtimeError = String(error);
        return [];
    }
}
/** Fixed for this page: settings changes save, then reload before mounting a new set. */
export const installedMods = installed();
export let enabledMods = [];
let officialTiles = new Map(), officialNames = new Map();
export function validateModLibrary(entries) {
    installMods(entries, new Map(officialTiles), new Map(officialNames));
}
export function getModRuntimeError() { return runtimeError; }
export function mountUserMods(tiles, names) {
    officialTiles = structuredClone(tiles);
    officialNames = new Map(names);
    try {
        installMods(installedMods, tiles, names);
        enabledMods = installedMods.filter(entry => entry.enabled);
    }
    catch (error) {
        // A manually changed/corrupted registry must not prevent settings or the original world from opening.
        runtimeError = String(error);
        enabledMods = [];
    }
}
//# sourceMappingURL=mod-runtime.js.map