// 验证转换后的 #nf 门能否被 HSParser 解析（wff / rule）
import fs from "node:fs";
import { HSParser } from "../js/hs/core/parser.js";

const MAP = "src/hy/map.ts";
const lines = fs.readFileSync(MAP, "utf8").split("\n");

let n = 0;
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
    const text = rest.replaceAll("[n]", "\n").replaceAll("\n", "").trim();
    if (!text.includes("#nf(") && !text.includes("#rp(")) continue;
    if (!flags.includes("d") && !flags.includes("p")) continue;
    n++;
    let ok = true, err = "";
    try {
        new HSParser().parse(text, flags.includes("d") ? "rule" : "wff");
    } catch (e) {
        ok = false; err = String(e.message || e).split("\n")[0];
    }
    console.log(`${ok ? "OK " : "FAIL"} [${flags.join(",")}] ${text.slice(0, 60)}${ok ? "" : "  ← " + err}`);
}
console.log(`\n共 ${n} 个 nf/rp 门`);
