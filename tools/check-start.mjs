const logs = [];
const origLog = console.log;
console.log = (...a) => logs.push(a.join(" "));
const m = await import("../js/hy/maploader.js");
const t = await import("../js/hy/tiling.js");
const p = new t.Polygon(6, 4);
m.initMap(p);
console.log = origLog;

const bm = m.blockMap;
// 起点 [] 的 6 个邻居
const start = [];
const [n0] = p.getNeighborAndDir([], 0, true);
const [n1] = p.getNeighborAndDir([], 1, true);
const [n2] = p.getNeighborAndDir([], 2, true);
const [n3] = p.getNeighborAndDir([], 3, true);
const [n4] = p.getNeighborAndDir([], 4, true);
const [n5] = p.getNeighborAndDir([], 5, true);
for (const [i, n] of [[0, n0], [1, n1], [2, n2], [3, n3], [4, n4], [5, n5]]) {
    const h = n.join(",");
    const b = bm.get(h);
    const typeName = ["Road", "Wall", "Gate", "Reward", "Ordinal"][b?.type ?? -1];
    console.log(`方向${i}: hash=[${h}] type=${typeName} data=${JSON.stringify(b?.data)}`);
}
