import {parseWorld} from '../../js/hy/world.js';
import {EditorProject} from './model.mjs';
import {blockMap, nameMap, initMap} from '../../js/hy/maploader.js';

/** A publication is a validated data snapshot; editor-only history is not executable content. */
export function buildWorld(project, settings = project.world) {
    if (!settings) throw Error('请先应用世界设置，选择入口和发布模式。');
    const checked = EditorProject.fromJSON(project.toJSON(), project.polygon);
    const world = parseWorld({...structuredClone(settings), format:'deductrium-world-v1', id:checked.id, title:checked.title, tiles:[...checked.tiles.values()].map(tile => ({id:tile.id,hash:tile.hash,type:tile.type,
            ...(tile.name ? {name:tile.name} : {}),text:tile.text,data:tile.data}))});
    if (world.mode === 'extension') {
        const tiles = new Map(blockMap), names = new Map(nameMap);
        try {
            blockMap.clear(); nameMap.clear(); initMap(project.polygon);
            for (const tile of world.tiles) if (blockMap.has(tile.hash)) throw Error(`扩展砖块 ${tile.id} 与主世界重叠：${tile.hash || '[]'}`);
        } finally {
            blockMap.clear(); nameMap.clear(); for (const entry of tiles) blockMap.set(...entry); for (const entry of names) nameMap.set(...entry);
        }
    }
    return world;
}

export function projectFromWorld(input, polygon) {
    const world=parseWorld(input);
    return EditorProject.fromJSON({format:'deductrium-map-project-v1',id:world.id,title:world.title,version:world.revision,
        tiling:{p:6,q:4},tiles:world.tiles,modules:[],instances:[],
        world:{revision:world.revision,mode:world.mode,spawn:world.spawn,banks:world.banks,migrations:world.migrations,
            ...(world.currency?{currency:world.currency}:{})}},polygon);
}
