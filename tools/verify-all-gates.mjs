// 全量验证 map.ts 中所有 #[p]/#[d] 门文本可被 HSParser 解析
import fs from "node:fs";
import { HSParser } from "../js/hs/core/parser.js";

const lines = fs.readFileSync("src/hy/map.ts", "utf8").split("\n");
let n = 0, fail = 0;
for (const line of lines) {
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("//")) continue;
    let typeChar = "", content = "", header = true;
    for (const k of line) {
        if (!header) { content += k; continue; }
        if ("@|#$O".includes(k)) { typeChar = k; header = false; }
    }
    if (typeChar !== "#") continue;
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
    if (!flags.includes("d") && !flags.includes("p")) continue;
    const text = rest.replaceAll("[n]", "\n").replaceAll("\n", "").trim();
    if (!text) continue;
    n++;
    try {
        new HSParser().parse(text, flags.includes("d") ? "rule" : "wff");
    } catch (e) {
        fail++;
        console.log(`FAIL [${flags.join(",")}] ${text.slice(0, 80)}  ← ${String(e.message || e).split("\n")[0]}`);
    }
}
console.log(`\n共 ${n} 个门，失败 ${fail} 个`);
