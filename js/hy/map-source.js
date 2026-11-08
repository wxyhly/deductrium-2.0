// [=xxx]：xxx 是省略了{}的 json（键名可不加引号，JSON5 风格），加上括号后解析。
// json 内数组也可能含方括号（如 ["a1","a2"]）、字符串内也可能含 ]，
// 需按深度/引号扫描匹配外层结束的 ]：只有 bracket 深度为 0 的 ] 才是结束标记
function parseJsonBlock(s) {
    if (!s.startsWith("[="))
        return null;
    let depth = 0, inStr = false, i = 1;
    for (; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            if (c === "\\") {
                i++;
                continue;
            }
            if (c === '"' || c === "'")
                inStr = false;
            continue;
        }
        if (c === '"' || c === "'") {
            inStr = true;
            continue;
        }
        if (c === "[")
            depth++;
        else if (c === "]") {
            if (depth === 0)
                break;
            depth--;
        }
    }
    if (i >= s.length)
        return null; // 未找到闭合的 ]
    let data = {};
    try {
        data = parseJsonValue("{" + s.slice(2, i) + "}", 0).v;
    }
    catch (err) {
        console.log("[maploader] JSON 解析失败：", s.slice(2, i), err);
    }
    return { data, rest: s.slice(i + 1) };
}
// ===== 宽松 JSON 解析：键名可不加引号，字符串支持单/双引号 =====
function skipWs(s, i) {
    while (i < s.length && /\s/.test(s[i]))
        i++;
    return i;
}
function parseJsonString(s, i) {
    const quote = s[i];
    i++;
    let out = "";
    while (i < s.length) {
        const c = s[i];
        if (c === "\\") {
            const n = s[i + 1];
            if (n === "n")
                out += "\n";
            else if (n === "t")
                out += "\t";
            else if (n === "r")
                out += "\r";
            else if (n === "u") {
                const hex = s.slice(i + 2, i + 6);
                if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                    out += String.fromCharCode(parseInt(hex, 16));
                    i += 6;
                    continue;
                }
                out += "u";
            }
            else if (n !== undefined)
                out += n; // \" \' \\ 等
            i += 2;
            continue;
        }
        if (c === quote)
            return { v: out, i: i + 1 };
        out += c;
        i++;
    }
    throw new Error("字符串未闭合：" + s.slice(i));
}
function parseJsonValue(s, i) {
    i = skipWs(s, i);
    const c = s[i];
    if (c === '"' || c === "'")
        return parseJsonString(s, i);
    if (c === "{")
        return parseJsonObject(s, i);
    if (c === "[")
        return parseJsonArray(s, i);
    if (s.startsWith("true", i))
        return { v: true, i: i + 4 };
    if (s.startsWith("false", i))
        return { v: false, i: i + 5 };
    if (s.startsWith("null", i))
        return { v: null, i: i + 4 };
    const m = s.slice(i).match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
    if (m)
        return { v: Number(m[0]), i: i + m[0].length };
    throw new Error("无法解析的值：" + s.slice(i, i + 20));
}
function parseJsonArray(s, i) {
    i++; // [
    const arr = [];
    for (;;) {
        i = skipWs(s, i);
        if (s[i] === "]")
            return { v: arr, i: i + 1 };
        const r = parseJsonValue(s, i);
        arr.push(r.v);
        i = skipWs(s, r.i);
        if (s[i] === ",") {
            i++;
            continue;
        }
        if (s[i] === "]")
            return { v: arr, i: i + 1 };
        throw new Error("数组语法错误");
    }
}
function parseJsonObject(s, i) {
    i++; // {
    const obj = {};
    for (;;) {
        i = skipWs(s, i);
        if (s[i] === "}")
            return { v: obj, i: i + 1 };
        // 键名：引号字符串 或 裸标识符（可省引号）
        let key;
        if (s[i] === '"' || s[i] === "'") {
            const r = parseJsonString(s, i);
            key = r.v;
            i = r.i;
        }
        else {
            const m = s.slice(i).match(/^[A-Za-z_$][\w$]*/);
            if (!m)
                throw new Error("对象键名错误：" + s.slice(i, i + 20));
            key = m[0];
            i += m[0].length;
        }
        i = skipWs(s, i);
        if (s[i] !== ":")
            throw new Error("键后缺冒号：" + s.slice(i, i + 20));
        i++;
        const r = parseJsonValue(s, i);
        obj[key] = r.v;
        i = skipWs(s, r.i);
        if (s[i] === ",") {
            i++;
            continue;
        }
        if (s[i] === "}")
            return { v: obj, i: i + 1 };
        throw new Error("对象语法错误：" + s.slice(i, i + 20));
    }
}
// 内容前部的数据块：连续的 [=json] 与 [p]/[d]/[t]/[td] 简写（均等价于设置 data.x = true）
function parseDataShortcuts(s, data) {
    let rest = s;
    for (;;) {
        if (rest.startsWith("[=")) {
            const r = parseJsonBlock(rest);
            if (!r)
                break;
            Object.assign(data, r.data);
            rest = r.rest;
            continue;
        }
        const m = rest.match(/^\[(pi|di|p|d|t|td|never)\]/);
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
function parseText(s) {
    const seg = {};
    let current = null; // 当前语言标记
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
                    if (current !== null)
                        seg[current] = (seg[current] ?? "") + buf;
                    else
                        pre += buf;
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
    if (!hasLang)
        return buf;
    if (current !== null)
        seg[current] = (seg[current] ?? "") + buf;
    if (pre) {
        const first = Object.keys(seg)[0];
        if (first)
            seg[first] = pre + seg[first];
    }
    return seg;
}
// Shared with the map editor: metadata and language markers use the game parser.
export function parseTileContent(content) {
    const nameMatched = content.match(/^\[\[([^\]]+)\]\]/);
    const data = {};
    const rest = parseDataShortcuts(nameMatched ? content.slice(nameMatched[0].length) : content, data);
    return { name: nameMatched?.[1], data, text: parseText(rest) };
}
/** Source lines are one-based; the leading newline of mapData is source line 1. */
export function parseMapData(source, p, tiles = new Map(), names = new Map()) {
    let prevTilehash = null;
    const blockStack = [];
    const lines = new Map();
    source.split("\n").map(e => e.trimStart().replaceAll("\n", "")).forEach((e, lineIndex) => {
        if (!e)
            return;
        if (e.startsWith("//"))
            return;
        const trimmed = e.trim();
        // 代码块：{ 快照当前位置，} 恢复（块内砖块不影响块外的 % 相对定位）
        if (trimmed === "{") {
            blockStack.push(prevTilehash);
            return;
        }
        if (trimmed === "}") {
            prevTilehash = blockStack.pop() ?? prevTilehash;
            return;
        }
        let hash = "";
        let tbt;
        let content = "";
        let header = true;
        for (const k of e) {
            if (!header) {
                content += k;
                continue;
            }
            const i = "@|#$O".indexOf(k);
            if (i === -1) {
                hash += k;
                continue;
            }
            tbt = i;
            header = false;
        }
        let t = [];
        // 父砖块定位标记：%,3 / %*,1,2 相对上一个砖块（% 后可带前导逗号）；":名称," 按名称定位（如 :tname1,5）
        let parentMarker = null;
        let restHash = hash;
        const named = restHash.match(/^:([^,]+),/);
        if (named) {
            parentMarker = named[1];
            restHash = restHash.slice(named[0].length);
        }
        else if (restHash.startsWith("%*")) {
            parentMarker = "%*";
            restHash = restHash.slice(2).replace(/^,/, "");
        }
        else if (restHash.startsWith("%")) {
            parentMarker = "%";
            restHash = restHash.slice(1).replace(/^,/, "");
        }
        if (parentMarker !== null) {
            hash = restHash;
            if (parentMarker === "%") {
                t = prevTilehash;
            }
            else if (parentMarker === "%*") {
                t = prevTilehash.slice(0);
            }
            else {
                t = names.get(parentMarker).split(",").map(e => e ? Number(e) : NaN);
            }
        }
        if (hash.includes(";")) {
            for (const s of hash.split(";")) {
                if (!s)
                    continue;
                p.getNeighborAndDir(t, Number(s), false);
                const tb = { type: tbt, text: "" };
                tiles.set(t.join(","), tb);
                lines.set(t.join(","), lineIndex + 1);
            }
            if (parentMarker !== "%*")
                prevTilehash = t;
            return;
        }
        if (hash)
            for (const s of hash.split(",")) {
                p.getNeighborAndDir(t, Number(s), false);
            }
        // 内容 = 可选名称 [[xxx]] + 可选数据块([=json]/[p]/[d]/[t]/[td]) + 文本
        const tb = { type: tbt, ...parseTileContent(content) };
        tiles.set(t.join(","), tb);
        lines.set(t.join(","), lineIndex + 1);
        if (tb.name) {
            names.set(tb.name, t.join(","));
        }
        if (parentMarker !== "%*")
            prevTilehash = t;
    });
    return { tiles, names, lines };
}
//# sourceMappingURL=map-source.js.map