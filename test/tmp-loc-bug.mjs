// 定位 addRules 崩溃：逐步加载 initialCreativeRules
import { HSParser } from '../js/hs/core/parser.js';
import { HilbertSystem } from '../js/hs/core/core.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver } from '../js/hs/core/assert.js';
import { initialCreativeRules } from '../js/hs/core/initial.js';

const parser = new HSParser();
const sys = new HilbertSystem();

const lines = initialCreativeRules.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//") && !e.trim().startsWith("{") && !e.trim().startsWith("}"));
console.log('规则行数:', lines.length);
for (let idx = 0; idx < lines.length; idx++) {
    const e = lines[idx];
    const name = e.slice(0, e.indexOf(":")).trim();
    let rest = e.slice(e.indexOf(":") + 1).trim();
    let steps = "";
    if (rest.startsWith("ax:")) { rest = rest.slice(3); }
    else { steps = rest.slice(rest.indexOf(";") + 1); rest = rest.slice(0, rest.indexOf(";")); }
    const ast = parser.parse(rest, 'rule');
    if (!ast || !ast.nodes) {
        console.log(`行${idx} 规则 ${name}: parse 返回 null! rest="${rest}"`);
        break;
    }
    if (steps) {
        const cmds = steps.split(";").filter(e => e).map(e => {
            const c = parser.parse(e, "cmd");
            if (!c) console.log(`行${idx} 规则 ${name}: 步骤 "${e}" parse 返回 null!`);
            return c;
        });
    }
    if (idx % 20 === 0) console.log(`行${idx} ${name} OK`);
}
console.log('done');
