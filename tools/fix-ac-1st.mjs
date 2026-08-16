import fs from "node:fs";
const s = fs.readFileSync("src/hy/map.ts", "utf8");
// 补加遗漏的 .1st
const out = s.replaceAll(
    '$[[.1st]][=unl:true][zh]一阶逻辑大礼包',
    '$[[.1st]][=ac:".1st"][=unl:true][zh]一阶逻辑大礼包'
);
fs.writeFileSync("src/hy/map.ts", out);
console.log("added .1st ac:", out.includes('[=ac:".1st"]'));
