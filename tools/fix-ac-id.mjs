import fs from "node:fs";
const s = fs.readFileSync("src/hy/map.ts", "utf8");
const before = (s.match(/\[=ac:/g) || []).length;
const out = s.replaceAll('[=ac:"dG"]', '[=ac:"delgate"]').replaceAll('[=ac:"pL"]', '[=ac:"progL"]');
fs.writeFileSync("src/hy/map.ts", out);
const after = (out.match(/\[=ac:/g) || []).length;
console.log("ac 总数", before, "->", after);
