import fs from "node:fs";
const map = fs.readFileSync("src/hy/map.ts", "utf8");
const data = map.match(/mapData\s*=\s*`([\s\S]*?)`;/)[1];
const lines = data.split("\n").map(e => e.trimStart()).filter(e => e && !e.startsWith("//"));

// 先收集所有 [[name]] 定义
const names = new Set();
for (const l of lines) {
    const m = l.match(/\[\[([^\]]+)\]\]/);
    if (m) names.add(m[1]);
}
console.log("已定义名称数:", names.size);

// 找所有 :名称, 引用
for (const l of lines) {
    const m = l.match(/^:([^,]+),/);
    if (m && m[1] !== "%" && m[1] !== "%*") {
        if (!names.has(m[1])) {
            console.log("引用未定义名称:", JSON.stringify(m[1]), "行:", l.slice(0, 80));
        }
    }
}
console.log("检查完毕");
