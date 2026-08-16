// 把 map.ts 中的原子命题小写字母改为大写（与变量区分）
// - 纯命题逻辑门（白名单符号）内的小写 a/b/c/p/q → A/B/C/P/Q
// - @ 说明文字中的原子命题引用同步改大写
// 注意：量词变量 x/y/z、替换变量 $a/$b、集合变量 a/b（∈ 场景）、函数符号 f/g 不改
import fs from "node:fs";

const MAP = "src/hy/map.ts";
const mapSrc = fs.readFileSync(MAP, "utf8");
const lines = mapSrc.split("\n");

const PROPSYM = /^[()→↔¬∧∨⊢, a-z]+$/;  // 纯命题逻辑门判定
const ATOM_MAP = { a: "A", b: "B", c: "C", p: "P", q: "Q" };

// @ 说明文字中的精确替换（只针对含原子命题引用的行，长模式优先）
const TEXT_FIXES = [
    { from: "a>((a>a)>a)", to: "A>((A>A)>A)" },      // L59 en
    { from: "~~a>(~~a>a)", to: "~~A>(~~A>A)" },       // L257 zh+en
    { from: "~~~a>~a", to: "~~~A>~A" },               // L228 zh+en
    { from: "a>(a>a)", to: "A>(A>A)" },               // L232 zh+en
    { from: "~b>a⊢~a>b", to: "~B>A⊢~A>B" },           // L267 zh+en
    { from: "a⊢~b>a", to: "A⊢~B>A" },                 // L267 zh+en
    { from: "a>~~a", to: "A>~~A" },                   // L228/L267 zh+en
    { from: "a>a", to: "A>A" },                       // L56 zh
].sort((x, y) => y.from.length - x.from.length);

let gateCount = 0, textCount = 0;
const outLines = lines.map(rawLine => {
    const trimmed = rawLine.trimStart();
    if (!trimmed || trimmed.startsWith("//")) return rawLine;
    let typeChar = "", content = "", header = true;
    for (const k of rawLine) {
        if (!header) { content += k; continue; }
        if ("@|#$O".includes(k)) { typeChar = k; header = false; }
    }

    if (typeChar === "#") {
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
        if (!flags.includes("d") && !flags.includes("p")) return rawLine;
        const text = rest.replaceAll("[n]", "\n").replaceAll("\n", "").trim();
        if (!text || !/[a-z]/.test(text) || !PROPSYM.test(text)) return rawLine;
        // 替换小写原子命题
        const newText = text.replace(/[a-z]/g, ch => ATOM_MAP[ch] ?? ch);
        // 重建行：prefix(类型符+数据块+flags) + 新文本
        const prefix = content.slice(0, content.length - rest.length);
        gateCount++;
        return rawLine.slice(0, rawLine.length - content.length) + prefix + newText;
    }

    if (typeChar === "@") {
        let changed = rawLine;
        for (const f of TEXT_FIXES) {
            if (changed.includes(f.from)) {
                changed = changed.replaceAll(f.from, f.to);
            }
        }
        if (changed !== rawLine) textCount++;
        return changed;
    }
    return rawLine;
});

fs.writeFileSync(MAP, outLines.join("\n"));
console.log(`门文本转换: ${gateCount} 个，说明文字: ${textCount} 处`);
