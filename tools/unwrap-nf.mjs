// 把含 #nf(...) 的 [p] 门转成 [d] 门：
//   #nf(A, vs, qs) 提取为假设（条件），正文中 #nf(...) 只保留第一参数 A
//   例：(∃x:∃y:(#nf($a,y)∧#nf($b,x)))↔(∃x:#nf($a,y)∧∃y:#nf($b,x))
//     → #nf($a,y), #nf($b,x) ⊢ (∃x:∃y:($a∧$b))↔(∃x:$a∧∃y:$b)
import fs from "node:fs";

const MAP = "src/hy/map.ts";
const mapSrc = fs.readFileSync(MAP, "utf8");
const lines = mapSrc.split("\n");

let converted = 0, skipped = [];
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
    // 只处理 [p] 门（且含 #nf）
    if (!flags.includes("p")) return line;
    // prefix = 类型符 + name + 数据块 + flags（此时 rest 尚未变换）
    const prefix = content.slice(0, content.length - rest.length);
    const text = rest.replaceAll("[n]", "\n").replaceAll("\n", "").trim();
    if (!text || !text.includes("#nf(")) return line;

    // 提取所有 #nf(...)（参数为简单变量，无嵌套括号）
    const nfs = [...new Set(text.match(/#nf\([^()]*\)/g) || [])];
    // 替换正文：每个 #nf(A, ...) → A（第一参数）
    let body = text;
    const firstArgOf = nf => nf.slice("#nf(".length, nf.indexOf(",")) || nf;
    for (const nf of nfs) {
        body = body.replaceAll(nf, firstArgOf(nf));
    }
    const conds = nfs.join(", ");
    // 转 [d]：条件 ⊢ 正文
    const newText = conds + " ⊢ " + body;
    // 写回：prefix 里 [p] → [d]，其余（name/数据块/其它flag）不动
    const newPrefix = prefix.replace(/\[p\]/, "[d]");
    const out = line.slice(0, line.length - content.length) + newPrefix + newText;
    converted++;
    console.log(`✓ ${text.slice(0, 90)}`);
    console.log(`   → ${newText.slice(0, 90)}`);
    return out;
});

fs.writeFileSync(MAP, outLines.join("\n"));
console.log(`\n已转换 ${converted} 个门`);
