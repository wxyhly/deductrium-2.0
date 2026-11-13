import { activeWorld } from './world-runtime.js';
import { enabledMods } from './mod-runtime.js';
import { contentId } from './world-content.js';
export function activeContentWorlds() {
    return activeWorld ? [activeWorld] : enabledMods.map(entry => entry.world);
}
export function contentNotes() {
    return activeContentWorlds().flatMap(world => (world.content?.knowledge ?? []).map(note => ({ ...note, id: contentId(world.id, note.id, true) })));
}
export function contentAchievements() {
    return activeContentWorlds().flatMap(world => (world.content?.achievements ?? []).map(entry => ({ ...entry, id: contentId(world.id, entry.id) })));
}
//# sourceMappingURL=content-catalog.js.map