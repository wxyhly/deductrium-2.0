import { activeWorld } from "./world-runtime.js";
import { worldRuntimeTiles } from "./world.js";
import { mapData } from "./map.js"
import { genOrdTiles } from "./ordinal.js";
import { Polygon, TileHash } from "./tiling.js";
export enum TileBlockType {
    Road, Wall, Gate, Reward, Ordinal
}
export type TileBlock = {
    type: TileBlockType,
    name?: string,
    text: string|Record<string,string>,
    data?:any,
}
export const blockMap = new Map<string, TileBlock>();
export const nameMap = new Map<string, string>();
// Editor playtests consume JSON tiles, never JavaScript from imported map.ts.
export const editorPreview = typeof window !== "undefined" && window.location?.search === "?map-editor-preview";
export function editorPreviewTiles(): [string, TileBlock][] | undefined {
    if (!editorPreview) return;
    const data = JSON.parse(localStorage.getItem("deductrium2_map_preview") ?? "null");
    if (!data || !Array.isArray(data.tiles) || data.tiles.length > 20000) throw new Error("无效的编辑器试玩地图");
    const positions = new Set<string>(), names = new Set<string>();
    for (const row of data.tiles) {
        if (!Array.isArray(row) || row.length !== 2) throw new Error("试玩砖块格式无效");
        const [hash, tile] = row;
        if (typeof hash !== "string" || hash.length > 1024 || hash && !/^[0-5](,[0-5])*$/.test(hash) || positions.has(hash)
            || !tile || !Number.isInteger(tile.type) || tile.type < 0 || tile.type > 4
            || typeof tile.text !== "string" && (!tile.text || Array.isArray(tile.text) || typeof tile.text !== "object" || Object.values(tile.text).some(value => typeof value !== "string"))
            || tile.name !== undefined && (typeof tile.name !== "string" || names.has(tile.name))
            || tile.data !== undefined && (!tile.data || typeof tile.data !== "object" || Array.isArray(tile.data))) throw new Error("试玩砖块数据无效");
        positions.add(hash); if (tile.name) names.add(tile.name);
    }
    return data.tiles;
}
export function editorPreviewSaveMode(): string {
    // A changed map receives a fresh save; normal survival slots stay untouched.
    let hash = 2166136261;
    for (const c of JSON.stringify(editorPreviewTiles())) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return "map-editor-preview-" + (hash >>> 0).toString(16);
}
let prevTilehash: TileHash = null!;
// 代码块栈：遇到 { 压入当前 tile 位置，} 时弹出恢复（支持嵌套）
const blockStack: TileHash[] = [];

// [=xxx]：xxx 是省略了{}的 json（键名可不加引号，JSON5 风格），加上括号后解析。
// json 内数组也可能含方括号（如 ["a1","a2"]）、字符串内也可能含 ]，
// 需按深度/引号扫描匹配外层结束的 ]：只有 bracket 深度为 0 的 ] 才是结束标记
function parseJsonBlock(s: string): { data: any; rest: string } | null {
    if (!s.startsWith("[=")) return null;
    let depth = 0, inStr = false, i = 1;
    for (; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            if (c === "\\") { i++; continue; }
            if (c === '"' || c === "'") inStr = false;
            continue;
        }
        if (c === '"' || c === "'") { inStr = true; continue; }
        if (c === "[") depth++;
        else if (c === "]") { if (depth === 0) break; depth--; }
    }
    if (i >= s.length) return null; // 未找到闭合的 ]
    let data: any = {};
    try {
        data = parseJsonValue("{" + s.slice(2, i) + "}", 0).v;
    } catch (err) {
        console.log("[maploader] JSON 解析失败：", s.slice(2, i), err);
    }
    return { data, rest: s.slice(i + 1) };
}

// ===== 宽松 JSON 解析：键名可不加引号，字符串支持单/双引号 =====
function skipWs(s: string, i: number): number {
    while (i < s.length && /\s/.test(s[i])) i++;
    return i;
}
function parseJsonString(s: string, i: number): { v: string; i: number } {
    const quote = s[i]; i++;
    let out = "";
    while (i < s.length) {
        const c = s[i];
        if (c === "\\") {
            const n = s[i + 1];
            if (n === "n") out += "\n";
            else if (n === "t") out += "\t";
            else if (n === "r") out += "\r";
            else if (n === "u") {
                const hex = s.slice(i + 2, i + 6);
                if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); i += 6; continue; }
                out += "u";
            }
            else if (n !== undefined) out += n; // \" \' \\ 等
            i += 2;
            continue;
        }
        if (c === quote) return { v: out, i: i + 1 };
        out += c;
        i++;
    }
    throw new Error("字符串未闭合：" + s.slice(i));
}
function parseJsonValue(s: string, i: number): { v: any; i: number } {
    i = skipWs(s, i);
    const c = s[i];
    if (c === '"' || c === "'") return parseJsonString(s, i);
    if (c === "{") return parseJsonObject(s, i);
    if (c === "[") return parseJsonArray(s, i);
    if (s.startsWith("true", i)) return { v: true, i: i + 4 };
    if (s.startsWith("false", i)) return { v: false, i: i + 5 };
    if (s.startsWith("null", i)) return { v: null, i: i + 4 };
    const m = s.slice(i).match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
    if (m) return { v: Number(m[0]), i: i + m[0].length };
    throw new Error("无法解析的值：" + s.slice(i, i + 20));
}
function parseJsonArray(s: string, i: number): { v: any[]; i: number } {
    i++; // [
    const arr: any[] = [];
    for (;;) {
        i = skipWs(s, i);
        if (s[i] === "]") return { v: arr, i: i + 1 };
        const r = parseJsonValue(s, i);
        arr.push(r.v);
        i = skipWs(s, r.i);
        if (s[i] === ",") { i++; continue; }
        if (s[i] === "]") return { v: arr, i: i + 1 };
        throw new Error("数组语法错误");
    }
}
function parseJsonObject(s: string, i: number): { v: any; i: number } {
    i++; // {
    const obj: any = {};
    for (;;) {
        i = skipWs(s, i);
        if (s[i] === "}") return { v: obj, i: i + 1 };
        // 键名：引号字符串 或 裸标识符（可省引号）
        let key: string;
        if (s[i] === '"' || s[i] === "'") {
            const r = parseJsonString(s, i);
            key = r.v; i = r.i;
        } else {
            const m = s.slice(i).match(/^[A-Za-z_$][\w$]*/);
            if (!m) throw new Error("对象键名错误：" + s.slice(i, i + 20));
            key = m[0]; i += m[0].length;
        }
        i = skipWs(s, i);
        if (s[i] !== ":") throw new Error("键后缺冒号：" + s.slice(i, i + 20));
        i++;
        const r = parseJsonValue(s, i);
        obj[key] = r.v;
        i = skipWs(s, r.i);
        if (s[i] === ",") { i++; continue; }
        if (s[i] === "}") return { v: obj, i: i + 1 };
        throw new Error("对象语法错误：" + s.slice(i, i + 20));
    }
}

// 内容前部的数据块：连续的 [=json] 与 [p]/[d]/[t]/[td] 简写（均等价于设置 data.x = true）
function parseDataShortcuts(s: string, data: any): string {
    let rest = s;
    for (;;) {
        if (rest.startsWith("[=")) {
            const r = parseJsonBlock(rest);
            if (!r) break;
            Object.assign(data, r.data);
            rest = r.rest;
            continue;
        }
        const m = rest.match(/^\[(p|d|t|td|never)\]/);
        if (m) {
            data[m[1]] = true;
            rest = rest.slice(m[0].length);
            continue;
        }
        break;
    }
    return rest;
}

// 文本：多语言 [zh]...[en]...（无语言标记则为纯字符串）、[n] 换行、\[ \] 转义显示字面括号
function parseText(s: string): string | Record<string, string> {
    const seg: Record<string, string> = {};
    let current: string | null = null; // 当前语言标记
    let buf = "";
    let pre = ""; // 首个语言标记之前的文本
    let hasLang = false;
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (c === "\\" && (s[i + 1] === "[" || s[i + 1] === "]")) {
            buf += s[i + 1];
            i += 2;
            continue;
        }
        if (c === "[") {
            const close = s.indexOf("]", i);
            if (close !== -1) {
                const tag = s.slice(i + 1, close);
                if (tag === "n") {
                    buf += "\n";
                    i = close + 1;
                    continue;
                }
                if (/^[a-zA-Z]{2,3}$/.test(tag)) {
                    hasLang = true;
                    if (current !== null) seg[current] = (seg[current] ?? "") + buf;
                    else pre += buf;
                    current = tag;
                    buf = "";
                    i = close + 1;
                    continue;
                }
            }
        }
        buf += c;
        i++;
    }
    if (!hasLang) return buf;
    if (current !== null) seg[current] = (seg[current] ?? "") + buf;
    if (pre) {
        const first = Object.keys(seg)[0];
        if (first) seg[first] = pre + seg[first];
    }
    return seg;
}

// Shared with the map editor: metadata and language markers use the game parser.
export function parseTileContent(content: string): Omit<TileBlock, "type"> {
    const nameMatched = content.match(/^\[\[([^\]]+)\]\]/);
    const data: Record<string, any> = {};
    const rest = parseDataShortcuts(nameMatched ? content.slice(nameMatched[0].length) : content, data);
    return { name: nameMatched?.[1], data, text: parseText(rest) };
}

export function initMap(p: Polygon) {
    const customTiles = activeWorld ? worldRuntimeTiles(activeWorld) : undefined;
    if (customTiles && activeWorld!.mode === "standalone") {
        blockMap.clear(); nameMap.clear();
        for (const [hash,tile] of customTiles) { blockMap.set(hash,tile); if (tile.name) nameMap.set(tile.name,hash); }
        return;
    }
    if (activeWorld) { blockMap.clear(); nameMap.clear(); }
    const preview = editorPreviewTiles();
    if (preview) {
        blockMap.clear(); nameMap.clear();
        for (const [hash, tile] of preview) {
            const path: number[] = [];
            if (hash) for (const edge of hash.split(",")) p.getNeighborAndDir(path, Number(edge), false);
            const canonical = path.join(",");
            if (blockMap.has(canonical)) throw new Error("试玩地图存在重叠坐标");
            blockMap.set(canonical, structuredClone(tile));
            if (tile.name) nameMap.set(tile.name, canonical);
        }
        return;
    }
    genOrdTiles(blockMap, nameMap, p, [1,2,1], [1], 5);
    blockStack.length = 0; // 防止 reload 时残留
    console.log("=== initMap: 解析 mapData ===");
    mapData.split("\n").map(e => e.trimStart().replaceAll("\n", "")).forEach(e => {
        if (!e) return;
        if (e.startsWith("//")) return;
        const trimmed = e.trim();
        // 代码块：{ 快照当前位置，} 恢复（块内砖块不影响块外的 % 相对定位）
        if (trimmed === "{") { blockStack.push(prevTilehash); return; }
        if (trimmed === "}") { prevTilehash = blockStack.pop() ?? prevTilehash; return; }
        let hash = "";
        let tbt: TileBlockType;
        let content = "";
        let header = true;
        for (const k of e) {
            if (!header) { content += k; continue; }
            const i = "@|#$O".indexOf(k);
            if (i === -1) { hash += k; continue; }
            tbt = i;
            header = false;
        }
        let t:TileHash = [];
        // 父砖块定位标记：%,3 / %*,1,2 相对上一个砖块（% 后可带前导逗号）；":名称," 按名称定位（如 :tname1,5）
        let parentMarker: string | null = null;
        let restHash = hash;
        const named = restHash.match(/^:([^,]+),/);
        if (named) {
            parentMarker = named[1];
            restHash = restHash.slice(named[0].length);
        } else if (restHash.startsWith("%*")) {
            parentMarker = "%*";
            restHash = restHash.slice(2).replace(/^,/, "");
        } else if (restHash.startsWith("%")) {
            parentMarker = "%";
            restHash = restHash.slice(1).replace(/^,/, "");
        }
        if (parentMarker !== null) {
            hash = restHash;
            if (parentMarker === "%") {
                t = prevTilehash;
            } else if (parentMarker === "%*") {
                t = prevTilehash.slice(0);
            } else {
                t = nameMap.get(parentMarker)!.split(",").map(e => e ? Number(e) : NaN);
            }
        }
        if (hash.includes(";")) {
            for (const s of hash.split(";")) {
                if (!s) continue;
                p.getNeighborAndDir(t, Number(s), false);
                const tb: TileBlock = { type: tbt!, text: "" };
                blockMap.set(t.join(","), tb);
                console.log(`[map] ${t.join(",")} ${JSON.stringify(tb)}`);
            }
            if (parentMarker !== "%*") prevTilehash = t;
            return;
        }
        if (hash) for (const s of hash.split(",")) {
            p.getNeighborAndDir(t, Number(s), false);
        }
        // 内容 = 可选名称 [[xxx]] + 可选数据块([=json]/[p]/[d]/[t]/[td]) + 文本
        const tb: TileBlock = { type: tbt!, ...parseTileContent(content) };
        blockMap.set(t.join(","), tb);
        if (tb.name) {
            nameMap.set(tb.name, t.join(","));
        }
        console.log(`[map] ${t.join(",")} ${JSON.stringify(tb)}`);
        if (parentMarker !== "%*") prevTilehash = t;
    });
    if (customTiles) {
        // Validate the whole overlay before installing any tile.
        for (const [hash] of customTiles) if (blockMap.has(hash)) throw new Error(`世界扩展与主世界重叠：${hash || '[]'}`);
        for (const [hash,tile] of customTiles) { blockMap.set(hash,tile); if (tile.name) nameMap.set(tile.name,hash); }
    }
    // console.log(Array.from(blockMap.values()).filter(e=>e.type!=TileBlockType.Ordinal&&(e.text.startsWith("["))));
    // console.log(JSON.stringify(Array.from(blockMap.values()).filter(e=>(/[\u4e00-\u9fa5]/.test(e.text))).map(e=>e.text)));
    // console.log(JSON.stringify(Array.from(blockMap.values()).map(e=>langMgr.trc1(langMgr.trc(e.text))).filter(e=>(/[\u4e00-\u9fa5]/.test(e)))));
}
