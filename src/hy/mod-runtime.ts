import { installMods, ModEntry, readModLibrary } from './mods.js';
import type { TileBlock } from './maploader.js';

let runtimeError: string | undefined;
function installed(): ModEntry[] {
    if (typeof localStorage === 'undefined') return [];
    try { return readModLibrary(); }
    catch (error) { runtimeError = String(error); return []; }
}
/** Fixed for this page: settings changes save, then reload before mounting a new set. */
export const installedMods = installed();
export let enabledMods: readonly ModEntry[] = [];
let officialTiles = new Map<string, TileBlock>(), officialNames = new Map<string, string>();

export function validateModLibrary(entries: readonly ModEntry[]): void {
    installMods(entries, new Map(officialTiles), new Map(officialNames));
}
export function getModRuntimeError(): string | undefined { return runtimeError; }

export function mountUserMods(tiles: Map<string, TileBlock>, names: Map<string, string>): void {
    officialTiles = structuredClone(tiles); officialNames = new Map(names);
    try {
        installMods(installedMods, tiles, names);
        enabledMods = installedMods.filter(entry => entry.enabled);
    } catch (error) {
        // A manually changed/corrupted registry must not prevent settings or the original world from opening.
        runtimeError = String(error); enabledMods = [];
    }
}
