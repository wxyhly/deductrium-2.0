// 验证成就系统数据链路：
// 1. map.ts 中 [=ac:...] 能被 maploader 解析进 tile.data.ac
// 2. 方块成就 identifier 与 pg/main.ts 的 achievementRows 对应
// 3. 每个 data.ac 方块有对应名称（lang.ts achievements 字典）
import fs from "node:fs";

// 模拟 maploader 的 JSON 解析：直接检查 map.ts 行中的 [=ac:"xxx"]
const mapSrc = fs.readFileSync("src/hy/map.ts", "utf8");
const acIds = [...mapSrc.matchAll(/\[=ac:"([^"]+)"\]/g)].map(m => m[1]);
console.log("map.ts 中 ac 总数:", acIds.length);

// 读取 pg/main.ts 的 achievementRows
const pgSrc = fs.readFileSync("src/pg/main.ts", "utf8");
const rowsMatch = pgSrc.match(/achievementRows: string\[\]\[\] = (\[[\s\S]*?\n\]);/);
if (!rowsMatch) { console.log("FAIL: 未找到 achievementRows"); process.exit(1); }
const rows = eval(rowsMatch[1]);
const flat = rows.flat();
console.log("achievementRows 行数:", rows.length, "总成就:", flat.length);

// 方块 ac 集合
const acSet = new Set(acIds);
const flatSet = new Set(flat);

// 方块 ac 但不在列表中的（应只在"补充"字典里，不影响 GUI 渲染）
const notInList = [...acSet].filter(id => !flatSet.has(id));
console.log("方块 ac 但不在 achievementRows:", JSON.stringify(notInList));

// 列表中有但地图无方块的（非方块成就，如 firstEat/firstPay/vegan40/dose1mg/dose1g/critical/w2/w4/allZFC/dQ/dR）
const noTile = [...flatSet].filter(id => !acSet.has(id));
console.log("无方块成就（经济/序数等）:", JSON.stringify(noTile));

// lang.ts 成就字典覆盖检查
const langSrc = fs.readFileSync("src/lang.ts", "utf8");
const missing = flat.filter(id => !langSrc.includes(`\n        ${JSON.stringify(id)}:`));
console.log("缺少名称的成就:", JSON.stringify(missing));

// 重复 identifier 检查
const dup = flat.filter((id, i) => flat.indexOf(id) !== i);
console.log("重复 identifier:", JSON.stringify([...new Set(dup)]));

// 每行长度检查
const badRows = rows.map((r, i) => [i, r.length]).filter(([, n]) => n !== 6);
console.log("行长度 !=6:", JSON.stringify(badRows));

console.log("\n=== 总结 ===");
console.log("成就总数:", flat.length, "| 方块成就:", acSet.size, "| 经济/序数成就:", noTile.length);
