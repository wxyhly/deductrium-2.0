// 给 map.ts 中成就方块加 [=ac:"name"] 字段（identifier = tile name）
// 仅当该行已有 [[name]] 且 name 是成就 key 且尚未有 ac 字段时插入
// 位置：name 之后（其它数据块之前），例如 [[aa]][=ac:"aa"]...
// 幂等：已有 ac 跳过；不修改其它内容
import fs from "node:fs";

const MAP = "src/hy/map.ts";
const src = fs.readFileSync(MAP, "utf8");
const lines = src.split("\n");

// 旧版 achievementsTable 的 key（即 tile name）—— 排除需要特殊触发（非方块）的成就
// 注意：delgate→dG、progL→pL（用户已在地图中改名）
const ACH_KEYS = new Set([
    "aa", "delgate", ".i", "progL", "hyp", "mdt",
    "neg", ".dne", "exfalso1", "exfalso2", "iff",
    "andor", "pierce", "lem", "contra", "mcpt",
    "1st", "nf", "rp", "a7", "mvt", ".prop",
    "mifft", "terr1", "terr2", "mnt", "elV1", "elV2", "elV3",
    "peano", "1+1", "2x2", "commu+", "xdistr",
    "3<4", "5R6", "dPrime", "prm7", "ex!", "infprm",
    "aExt", ".<i", "ext<", "empty", ".zfc", "UUII",
    "a@a", "vwo", "delAl", "d()", "dX", "dSd0", "dZ",
    "type", "ttrue", "ttsimplFn", "ttactic1", "ttEq", "AllTrue",
    "ttindnat", "tt1+1", "ttindeq", "0+x", "x+x", "1neq2", "tt5R7",
    "S1S1", "eqvid", "ttua", "looprfl", "ttpierce", "lemlie",
    "ttEven", "ttList", "ttZ", ":=factorial2", "tteven0", "ttWnat",
    "ttPathElim", "ttPoint", "ttisContr", "ttSetNat", "tteq2027",
    "ttdrawS1", "ttS2", "pi1S1", "hopf1", "hopf2",
    "ttfnext", "ttNoFnext", "Bool=Bool=Bool", "isequivP",
    "infhotel", "permMaster",
    // 用户已改名
    "dG", "pL",
]);

let added = 0, skipped = 0;
const out = lines.map(line => {
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("//")) return line;
    // 类型符：@|#$O 之后是内容
    let typeChar = "", content = "", header = true;
    for (const k of line) {
        if (!header) { content += k; continue; }
        if ("@|#$O".includes(k)) { typeChar = k; header = false; }
    }
    if (!typeChar) return line;
    const nm = content.match(/^\[\[([^\]]+)\]\]/);
    if (!nm) return line;
    const name = nm[1];
    if (!ACH_KEYS.has(name)) return line;
    if (content.includes("[=ac:")) { skipped++; return line; }
    // 在 name 后插入 [=ac:"name"]
    const ins = `[=ac:"${name}"]`;
    const newContent = content.slice(0, nm[0].length) + ins + content.slice(nm[0].length);
    added++;
    console.log(`+ ${name}  ${line.slice(0, 60)}`);
    return line.slice(0, line.length - content.length) + newContent;
});

fs.writeFileSync(MAP, out.join("\n"));
console.log(`\n新增 ac: ${added} 个，跳过(已有): ${skipped} 个`);
