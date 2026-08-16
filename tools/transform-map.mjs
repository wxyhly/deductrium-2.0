// 转换原版 deductrium mapData 到新格式：
//  1. 中文文本 → [zh]xxx[en]xxx（数据来自原版 lang.ts 的 dataEnInCanvas）
//  2. #xxx[n]#p / #xxx[n]#d / #xxx[n]#t 门 → #[p]xxx / #[d]xxx / #[t]xxx
//  3. $解锁xxx → $[=unl:true]xxx
//  4. $你永远别想拿到这个奖励！ → $[never]
//  5. $拆除门xxx → $[=dstr:xxx]
//  6. $获取xx推理素 → $[=getD:n]；#通过此门需消耗推理素xx → #[=payD:n]（n 为微克）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(dir, f), "utf8");

// ---------- 读取原始文件 ----------
const origMap = read("orig-map.ts");
const origLang = read("orig-lang.ts");

// ---------- 提取 mapData ----------
const mapData = origMap.match(/mapData\s*=\s*`([\s\S]*?)`;/)[1];

// ---------- 提取 dataEnInCanvas（感知字符串中的 {}） ----------
const start = origLang.indexOf("dataEnInCanvas = {") + "dataEnInCanvas = {".length;
let depth = 1, i = start, inStr = false;
for (; i < origLang.length && depth > 0; i++) {
    const c = origLang[i];
    if (inStr) {
        if (c === "\\") { i++; continue; }
        if (c === '"') inStr = false;
        continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
}
const objStr = origLang.slice(start - 1, i);
const enDict = new Function("return (" + objStr + ")")();

// ---------- 工具 ----------
const n2n = s => s.replaceAll("[n]", "\n");      // [n] → 换行（查表）
const nn = s => s.replaceAll("\n", "[n]");       // 换行 → [n]（输出）
const hasCn = s => /[\u4e00-\u9fa5]/.test(s);
const lookupEn = text => {
    const en = enDict[n2n(text)];
    return en === undefined ? null : nn(en);
};
function parseDeductriumAmout(str) {
    let coeff;
    if (str.endsWith("µg")) coeff = 1;
    else if (str.endsWith("mg")) coeff = 1e3;
    else if (str.endsWith("kg")) coeff = 1e9;
    else if (str.endsWith("g")) coeff = 1e6;
    else if (str.endsWith("T")) coeff = 1e12;
    return Number(str.replaceAll(/[a-zA-Zµ]+/g, "")) * coeff;
}
// 科学计数法：>=1000 用 toExponential 并去掉 "+"（如 5e+10 → 5e10），否则原样
const toSci = n => Math.abs(n) >= 1000 ? n.toExponential().replace("+", "") : String(n);
// 注意：mapData 是模板字符串，源文件里的 \n 会被转义成真实换行（导致行解析断裂）。
// 因此必须写出 \\n（反斜杠反斜杠 n）→ 模板转义后运行时是 \n（2字符）→ maploader 的 JSON 解析再转成真实换行
const escJson = s => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\\\n").replace(/"/g, '\\"');

// ---------- 统计 ----------
const stat = { gate: 0, unl: 0, never: 0, dstr: 0, getD: 0, payD: 0, bi: 0, cnNoEn: 0, unlNoEn: 0 };

const lines = mapData.split("\n").map(e => e.trimStart());
const out = lines.map(line => {
    if (!line || line.startsWith("//")) return line;

    // 解析 hash / 类型符 / 内容（与 maploader 一致）
    let hash = "", content = "", header = true;
    for (const k of line) {
        if (!header) { content += k; continue; }
        const ti = "@|#$O".indexOf(k);
        if (ti === -1) { hash += k; continue; }
        content += k; // 类型符本身算内容开头？不：maploader 里 tbt 拿到后 header=false，类型符不放内容
        header = false;
    }
    // 重新精确解析：maploader 的类型符不进 content
    hash = ""; content = ""; header = true;
    let typeChar = "";
    for (const k of line) {
        if (!header) { content += k; continue; }
        const ti = "@|#$O".indexOf(k);
        if (ti === -1) { hash += k; continue; }
        typeChar = k;
        header = false;
    }

    // 提取 [[name]]
    let name = null, rest = content;
    const nm = rest.match(/^\[\[([^\]]+)\]\]/);
    if (nm) { name = nm[1]; rest = rest.slice(nm[0].length); }

    const flags = [];

    // 2. 门 #p/#d/#t 后缀 → [p]/[d]/[t]
    if (typeChar === "#") {
        const gm = rest.match(/^(.*?)(?:\[n\])?#([pdt])$/);
        if (gm) {
            flags.push("[" + gm[2] + "]");
            rest = gm[1].replace(/^\[n\]/, "");
            stat.gate++;
        }
    }

    if (rest === "你永远别想拿到这个奖励！") {
        // 4. never
        flags.push("[never]");
        rest = "";
        stat.never++;
    } else if (rest.startsWith("解锁")) {
        // 3. unl：先整段查双语，再各自去掉“解锁 / Unlock”前缀
        const en = lookupEn(rest);
        if (en) {
            const zh = rest.replace(/^解锁/, "");
            const enSeg = en.replace(/^(?:Unlock|Go for Unlock)\s+/i, "");
            rest = "[zh]" + zh + "[en]" + enSeg;
        } else {
            rest = rest.replace(/^解锁/, "");
            stat.unlNoEn++;
        }
        flags.push("[=unl:true]");
        stat.unl++;
    } else if (rest.startsWith("拆除门")) {
        // 5. dstr
        flags.push('[=dstr:"' + escJson(rest.slice(3).replaceAll("[n]", "\n")) + '"]');
        rest = "";
        stat.dstr++;
    } else if (/^获取(.+)推理素$/.test(rest)) {
        // 6. getD（>=1000 用科学计数法，避免一长串零）
        const amt = rest.match(/^获取(.+)推理素$/)[1];
        flags.push(`[=getD:${toSci(parseDeductriumAmout(amt))}]`);
        rest = "";
        stat.getD++;
    } else if (rest.startsWith("通过此门需消耗推理素")) {
        // 6. payD（>=1000 用科学计数法）
        const amt = rest.slice("通过此门需消耗推理素".length);
        flags.push(`[=payD:${toSci(parseDeductriumAmout(amt))}]`);
        rest = "";
        stat.payD++;
    } else if (hasCn(rest)) {
        // 1. 双语
        const en = lookupEn(rest);
        if (en) {
            rest = "[zh]" + rest + "[en]" + en;
            stat.bi++;
        } else {
            stat.cnNoEn++;
        }
    }

    return hash + typeChar + (name ? `[[${name}]]` : "") + flags.join("") + rest;
});

// ---------- 输出 ----------
const result = "export const mapData = `\n" + out.join("\n") + "\n`;\n";
fs.writeFileSync(path.join(dir, "..", "src", "hy", "map.ts"), result);
console.log("=== 转换统计 ===");
console.log(stat);
console.log("行数:", lines.length, "→", out.length);
console.log("输出已写入 src/hy/map.ts");
