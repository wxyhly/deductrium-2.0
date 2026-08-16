// 验证 map.ts 中 ac 字段：统计各 ac identifier 及对应方块
import fs from "node:fs";
const s = fs.readFileSync("src/hy/map.ts", "utf8");
const lines = s.split("\n");
const acs = new Map();
for (const line of lines) {
    const m = line.match(/\[=ac:"([^"]+)"\]/);
    if (m) acs.set(m[1], (acs.get(m[1]) || 0) + 1);
}
console.log("ac 数量:", acs.size);
for (const [k, v] of acs) console.log(`  ${k}: ${v}`);
