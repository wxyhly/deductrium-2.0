// 对比：重新用 transform-map.mjs 逻辑生成基础 map.ts，与当前 map.ts 逐行 diff
import fs from "node:fs";

const gen = fs.readFileSync("tools/gen-map-check.ts", "utf8");
// 直接复用 transform-map.mjs 的核心逻辑（临时复制执行）
