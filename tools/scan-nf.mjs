// 扫描地图所有含 #nf 的门文本形态
import fs from "node:fs";
const map = fs.readFileSync("src/hy/map.ts", "utf8");
const data = map.match(/mapData\s*=\s*`([\s\S]*?)`;/)[1];
const lines = data.split("\n").map(e => e.trimStart()).filter(e => e && !e.startsWith("//"));

for (const l of lines) {
    let typeChar = "", content = "", header = true;
    for (const k of l) {
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
    if (!text) continue;
    const nfCount = (text.match(/#nf\(/g) || []).length;
    const rpCount = (text.match(/#rp\(/g) || []).length;
    if (nfCount > 0 || rpCount > 0) {
        console.log(`[${flags.join(",") || "?"}] nf=${nfCount} rp=${rpCount}`);
        console.log(`   ${text.slice(0, 150)}`);
    }
}
