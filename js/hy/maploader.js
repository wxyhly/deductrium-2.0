import { activeWorld } from "./world-runtime.js";
import { worldRuntimeTiles, validateWorldBase } from "./world.js";
import { mountUserMods } from "./mod-runtime.js";
import { mountBuiltinMods } from "./builtin-mods.js";
import { typeMapData } from "./type-map.js";
export { parseTileContent } from "./map-source.js";
export var TileBlockType;
(function (TileBlockType) {
    TileBlockType[TileBlockType["Road"] = 0] = "Road";
    TileBlockType[TileBlockType["Wall"] = 1] = "Wall";
    TileBlockType[TileBlockType["Gate"] = 2] = "Gate";
    TileBlockType[TileBlockType["Reward"] = 3] = "Reward";
    TileBlockType[TileBlockType["Ordinal"] = 4] = "Ordinal";
})(TileBlockType || (TileBlockType = {}));
export const blockMap = new Map();
export const nameMap = new Map();
// Editor playtests consume JSON tiles, never JavaScript from imported map.ts.
export const editorPreview = typeof window !== "undefined" && window.location?.search === "?map-editor-preview";
export function editorPreviewTiles() {
    if (!editorPreview)
        return;
    const data = JSON.parse(localStorage.getItem("deductrium2_map_preview") ?? "null");
    if (!data || !Array.isArray(data.tiles) || data.tiles.length > 20000)
        throw new Error("无效的编辑器试玩地图");
    const positions = new Set(), names = new Set();
    for (const row of data.tiles) {
        if (!Array.isArray(row) || row.length !== 2)
            throw new Error("试玩砖块格式无效");
        const [hash, tile] = row;
        if (typeof hash !== "string" || hash.length > 1024 || hash && !/^[0-5](,[0-5])*$/.test(hash) || positions.has(hash)
            || !tile || !Number.isInteger(tile.type) || tile.type < 0 || tile.type > 4
            || typeof tile.text !== "string" && (!tile.text || Array.isArray(tile.text) || typeof tile.text !== "object" || Object.values(tile.text).some(value => typeof value !== "string"))
            || tile.name !== undefined && (typeof tile.name !== "string" || names.has(tile.name))
            || tile.data !== undefined && (!tile.data || typeof tile.data !== "object" || Array.isArray(tile.data)))
            throw new Error("试玩砖块数据无效");
        positions.add(hash);
        if (tile.name)
            names.add(tile.name);
    }
    return data.tiles;
}
export function editorPreviewSaveMode() {
    // A changed map receives a fresh save; normal survival slots stay untouched.
    let hash = 2166136261;
    for (const c of JSON.stringify(editorPreviewTiles()))
        hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return "map-editor-preview-" + (hash >>> 0).toString(16);
}
export function initMap(p, includeUserMods = false) {
    blockMap.clear();
    nameMap.clear();
    const customTiles = activeWorld ? worldRuntimeTiles(activeWorld) : undefined;
    if (customTiles && activeWorld.mode === "standalone") {
        blockMap.clear();
        nameMap.clear();
        for (const [hash, tile] of customTiles) {
            blockMap.set(hash, tile);
            if (tile.name)
                nameMap.set(tile.name, hash);
        }
        return;
    }
    if (activeWorld) {
        blockMap.clear();
        nameMap.clear();
    }
    const preview = editorPreviewTiles();
    if (preview) {
        blockMap.clear();
        nameMap.clear();
        for (const [hash, tile] of preview) {
            const path = [];
            if (hash)
                for (const edge of hash.split(","))
                    p.getNeighborAndDir(path, Number(edge), false);
            const canonical = path.join(",");
            if (blockMap.has(canonical))
                throw new Error("试玩地图存在重叠坐标");
            blockMap.set(canonical, structuredClone(tile));
            if (tile.name)
                nameMap.set(tile.name, canonical);
        }
        return;
    }
    mountBuiltinMods(p, typeMapData, blockMap, nameMap);
    if (customTiles) {
        // Validate the whole overlay before installing any tile.
        validateWorldBase(activeWorld, blockMap);
        for (const [hash] of customTiles)
            if (blockMap.has(hash))
                throw new Error(`世界扩展与主世界重叠：${hash || '[]'}`);
        for (const [hash, tile] of customTiles) {
            blockMap.set(hash, tile);
            if (tile.name)
                nameMap.set(tile.name, hash);
        }
    }
    if (includeUserMods && !activeWorld)
        mountUserMods(blockMap, nameMap);
}
//# sourceMappingURL=maploader.js.map