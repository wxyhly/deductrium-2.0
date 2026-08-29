// 验证有界量词解析
import { HSParser } from '../js/hs/core/parser.js';
import { NodeType } from '../js/asttype.js';

const p = new HSParser();

const cases = [
    "∀x∈y:x=y",   // \a@x@y:x=y
    "\\a@x@y:x=y", // ASCII 形式
    "∀x:x=y",      // 普通量词（回归）
    "\\ax:x=y",
];
for (const s of cases) {
    const a = p.parse(s, 'wff');
    console.log(s, '→', a.toString(), '| type:', a.type === NodeType.QUANT ? 'QUANT' : a.type === NodeType.BOUNDED_QUANT ? 'BOUNDED_QUANT' : a.type, '| nodes:', a.nodes.length);
    if (a.type === NodeType.BOUNDED_QUANT) {
        console.log('   绑定变量:', a.nodes[0].name, '| 论域:', a.nodes[1].toString(), '| body:', a.nodes[2].toString());
    }
}
