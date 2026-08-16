// 验证转换后的地图能被 maploader 完整解析
const logs = [];
const origLog = console.log;
console.log = (...a) => { logs.push(a.join(" ")); };

const m = await import("../js/hy/maploader.js");
const t = await import("../js/hy/tiling.js");
const p = new t.Polygon(6, 4);
m.initMap(p);
console.log = origLog;

// 统计
const jsonFail = logs.filter(l => l.includes("JSON 解析失败"));
const hashes = [...m.blockMap.keys()];
const nanHashes = hashes.filter(h => h.includes("NaN"));
console.log("=== 解析统计 ===");
console.log("总砖块:", hashes.length);
console.log("JSON 解析失败:", jsonFail.length);
console.log("NaN 哈希:", nanHashes.length);

// 找出残留 [=...] 未解析成 data 的砖块
const leftover = [...m.blockMap.entries()].filter(([, b]) => typeof b.text === "string" && b.text.includes("[=") && b.text !== "");
console.log("text 残留 [= 的砖块:", leftover.length);
leftover.slice(0, 10).forEach(([h, b]) => console.log(" ", h, "=>", JSON.stringify(b.text.slice(0, 40))));

// 抽查关键砖块
const show = h => {
    const b = m.blockMap.get(h);
    console.log(h, "=>", b ? JSON.stringify({ name: b.name, type: b.type, text: b.text, data: b.data }) : "(无)");
};
console.log("\n=== 抽查 ===");
show("");          // 起始砖（双语欢迎）
show("5");         // zh-en 名字
show("3");         // 第一个 getD:1
show("3,2");       // ...
// 从原地图开头逐个抽查关键行
show("1,3");       // payD 1kg → 1e9
show("1,3,1");     // getD 50kg → 5e10
// 用名字查
const byName = (n) => { const h = m.nameMap.get(n); console.log(`名字 ${n} =>`, h, h ? JSON.stringify(m.blockMap.get(h)) : ""); };
console.log("\n=== 名字抽查 ===");
byName("aa");
byName("progL");
byName("omega");
byName("宏门");
byName("del<>");
