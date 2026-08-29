// 验证 tokenizeCMD 对含 \ 的规则名的处理
import { HSParser } from '../js/hs/core/parser.js';
import { HilbertSystem } from '../js/hs/core/core.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver } from '../js/hs/core/assert.js';
import { initialCreativeRules, initialSurvivalRules } from '../js/hs/core/initial.js';

const parser = new HSParser();

const show = (label, cmd) => {
    console.log(label + ':', cmd ? 'name=' + cmd.name + ' args=[' + cmd.nodes.map(n => n.toString()).join(', ') + ']' : 'NULL');
};

// 1. d\c 无空格 → 应解析为 cmd d + 规则名 d\c
const a = parser.parse("d\\c", "cmd");
show('d\\c', a);
console.log('  args[0] type:', a?.nodes[0]?.type, 'name:', JSON.stringify(a?.nodes[0]?.name), 'toString:', a?.nodes[0]?.toString());

// 2. d \c 有空格 → cmd d + 规则名 \c
const b = parser.parse("d \\c", "cmd");
show('d \\c', b);

// 3. 普通 d 命令
const c = parser.parse("d mp 1 2", "cmd");
show('d mp 1 2', c);

// 4. hyp ∀x:x=y（有界量词）
const d = parser.parse("hyp \\ax:x=y", "cmd");
show('hyp \\ax:x=y', d);
console.log('  args[0]:', d?.nodes[0]?.toString(), 'type:', d?.nodes[0]?.type, d?.nodes[0]?.type === NodeType.QUANT ? 'QUANT' : d?.nodes[0]?.type === NodeType.BOUNDED_QUANT ? 'BOUNDED_QUANT' : '?');

// 5. 差集 x\\y（tokenizeAST 用 charSeps 含 \，应保持差集解析）
const e = parser.parse("hyp x\\\\y=z", "cmd");
show('hyp x\\y=z', e);
console.log('  args[0]:', e?.nodes[0]?.toString());

// 6. 完整流程：注册规则 d\c 并应用
const sys = new HilbertSystem();
const addRules = (data) => {
    data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//") && !e.trim().startsWith("{") && !e.trim().startsWith("}")).forEach(e => {
        const name = e.slice(0, e.indexOf(":")).trim();
        let rest = e.slice(e.indexOf(":") + 1).trim();
        let steps = "";
        if (rest.startsWith("ax:")) { rest = rest.slice(3); }
        else { steps = rest.slice(rest.indexOf(";") + 1); rest = rest.slice(0, rest.indexOf(";")); }
        const ast = parser.parse(rest, 'rule');
        const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
        ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
        const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), assertions, ast.nodes, ast.nodes.pop());
        sys.rules.set(name, rule);
        if (steps) {
            try {
                for (const n of rule.assertions) sys.fromCmd([parser.parse("hyp " + AtomSolver.print(n), "cmd")]);
                for (const n of rule.conditions) sys.fromCmd([parser.parse("hyp " + n, "cmd")]);
                sys.fromCmd(steps.split(";").filter(e => e).map(e => parser.parse(e, "cmd")));
                rule.step = sys.props.slice(0);
            } catch (e) { console.log(`规则 ${name} 加载失败:`, JSON.stringify(e)); }
            finally { sys.clear(); }
        }
    });
};
addRules(initialCreativeRules);
addRules(initialSurvivalRules);

// 注册 d\c 规则
sys.rules.set("d\\c", new Deduction(new Set, new AST(NodeType.ATOM_DNAME, "d\\c"), [], [parser.parse("A", 'wff')], parser.parse("B", 'wff')));

// 应用 d\c
sys.clear();
try {
    sys.hyp(parser.parse("A", 'wff'));  // 1
    const cmd = parser.parse("d\\c 1", "cmd");
    console.log('\n应用 d\\c 1 →', cmd ? cmd.name + ' ' + cmd.nodes.map(n => n.toString()).join(' ') : 'NULL');
    const rule = sys.getD(cmd.nodes[0]);
    console.log('getD:', rule ? rule.toString() : 'NULL');
    const conds = cmd.nodes.slice(1, rule.conditions.length + 1).map(e => sys.getP(e.name));
    const replaceValues = Object.fromEntries(cmd.nodes.slice(rule.conditions.length + 1).map((e, idx) => [rule.replaceNames[idx][0], e]));
    const r = sys.d(rule, conds, replaceValues);
    console.log('应用结果:', r.ast.toString());
} catch (e) { console.log('应用失败:', e?.type, JSON.stringify(e)); }
