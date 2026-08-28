// 移植脚本：把 deductrium-hott-optimised 的 NBE 内核/检查器复制到当前类型层。
// 两个大文件几乎原样保留（AI 优化的核心逻辑），只改 import 指向 kast.js：
//   - AST/Context 类型改为由 ./kast.js 提供（plain-object 内核 AST，含 bondVarId）
//   - 其余代码（求值/相等/匹配/quote/元变量求解/双向检查）保持不变
import { readFileSync, writeFileSync } from "fs";

const SRC = "d:/Toccbai/html5mijr/ccahgaolo/deductrium-hott-optimised/src/tt/";
const DST = "d:/Toccbai/html5mijr/ccahgaolo/deductrium-2.0/src/tt/";

// 源文件是 CRLF 行尾：先归一化为 LF 再替换，输出统一 LF
const normalize = (s) => s.replace(/\r\n/g, "\n");

const kernel = normalize(readFileSync(SRC + "nbe-kernel.ts", "utf8"))
    .replace(
        'import type { AST } from "./astparser.js";\nimport type { Context } from "./core.js";',
        'import type { AST, Context } from "./kast.js";'
    );
writeFileSync(DST + "nbe-kernel.ts", kernel);

const checker = normalize(readFileSync(SRC + "nbe-checker.ts", "utf8"))
    .replace(
        'import type { AST } from "./astparser.js";\nimport type { Context } from "./core.js";',
        'import type { AST, Context } from "./kast.js";'
    );
writeFileSync(DST + "nbe-checker.ts", checker);

console.log("ported nbe-kernel.ts:", kernel.length, "chars");
console.log("ported nbe-checker.ts:", checker.length, "chars");
