// 把地图 [p]/[d] 门文本从旧式 ASCII 记号转换为 unicode（新解析器直接可解析），写回 src/hy/map.ts
// 不剥括号（保留结合性语义）；parser 已支持 ⊂(*\c)、*(乘法)、\\ 差集、优先级、ascii 转义
import fs from "node:fs";
import { HSParser } from "../js/hs/core/parser.js";

const MAP = "src/hy/map.ts";
const mapSrc = fs.readFileSync(MAP, "utf8");
const lines = mapSrc.split("\n");

// 旧式 ASCII → unicode（先长后短；E!/<>/||/<=/>= 等优先）
function toUnicode(text) {
    return text
        .replaceAll("E!", "∃!")
        .replaceAll("<>", "↔")
        .replaceAll("||", "∨")
        .replaceAll(">=", "≥")
        .replaceAll("<=", "≤")
        .replaceAll("/|", "∣")
        .replaceAll("omega", "ω")
        .replaceAll("E", "∃")
        .replaceAll("V", "∀")
        .replaceAll("|", "∨")
        .replaceAll("&", "∧")
        .replaceAll("@", "∈")
        .replaceAll("~", "¬")
        .replaceAll("X", "×")
        .replaceAll("U", "∪")
        .replaceAll("I", "∩")
        .replaceAll("<", "⊂")
        .replaceAll(">", "→");
}

let pCount = 0, dCount = 0, changed = 0, fails = [];
const outLines = lines.map(rawLine => {
    const line = rawLine;
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("//")) return line;
    let typeChar = "", content = "", header = true;
    for (const k of line) {
        if (!header) { content += k; continue; }
        if ("@|#$O".includes(k)) { typeChar = k; header = false; }
    }
    if (typeChar !== "#") return line;
    let rest = content;
    const nm = rest.match(/^\[\[([^\]]+)\]\]/);
    if (nm) rest = rest.slice(nm[0].length);
    const flags = [];
    while (true) {
        const eq = rest.match(/^\[=([^\]]*)\]/);
        if (eq) { rest = rest.slice(eq[0].length); continue; }
        const sh = rest.match(/^\[(p|d|t|td|never)\]/);
        if (sh) { flags.push(sh[1]); rest = rest.slice(sh[0].length); continue; }
        break;
    }
    if (!flags.some(f => f === "p" || f === "d")) return line;
    const isD = flags.includes("d");
    if (isD) dCount++; else pCount++;
    const text = rest.replaceAll("[n]", "\n").replaceAll("\n", "").trim();
    if (!text) return line;
    // 转换并验证可解析；失败（如含 #nf 断言的门）保留原样
    const unicode = toUnicode(text);
    const parser = new HSParser();
    try {
        const ast = parser.parse(unicode, isD ? "rule" : "wff");
        if (!ast) throw "null";
    } catch (e) {
        fails.push({ line, text, unicode, mode: isD ? "rule" : "wff" });
        return line;
    }
    if (unicode !== text) changed++;
    const prefix = line.slice(0, line.length - content.length);
    return prefix + content.slice(0, content.length - rest.length) + unicode;
});

console.log("p 门:", pCount, "d 门:", dCount, "已转换:", changed);
console.log("转换后仍无法解析（保留原样）:", fails.length);
for (const f of fails) console.log("  [", f.mode, "]", f.text.slice(0, 90));

fs.writeFileSync(MAP, outLines.join("\n"));
console.log("已写回", MAP);
