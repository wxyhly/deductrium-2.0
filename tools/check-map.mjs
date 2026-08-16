import fs from "node:fs";
const map = fs.readFileSync("src/hy/map.ts", "utf8");
const data = map.match(/mapData\s*=\s*`([\s\S]*?)`;/)[1];
const lines = data.split("\n").map(e => e.trimStart()).filter(e => e && !e.startsWith("//"));
const hasCn = s => /[\u4e00-\u9fa5]/.test(s);

console.log("=== never 行 ===");
lines.filter(l => l.includes("[never]")).forEach(l => console.log(l));

console.log("\n=== unl 但无 [zh]（en 缺失） ===");
lines.filter(l => l.includes("[=unl:true]") && !l.includes("[zh]")).forEach(l => console.log(l));

console.log("\n=== 仍有中文但无 [zh]（en 缺失） ===");
lines.filter(l => hasCn(l) && !l.includes("[zh]")).forEach(l => console.log(l));

console.log("\n=== dstr 行 ===");
lines.filter(l => l.includes("[=dstr")).forEach(l => console.log(l));
