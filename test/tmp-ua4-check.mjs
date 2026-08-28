// 快速检查当前 u<a4 的行为
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { initialCreativeRules } from '../js/hs/core/initial.js';
import { AtomSolver } from '../js/hs/core/assert.js';
import { Deduction } from '../js/hs/core/deduction.js';

const parser = new HSParser();
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
            } catch (e) {
                console.log(`规则 ${name} 加载失败:`, JSON.stringify(e));
            } finally {
                sys.clear();
            }
        }
    });
};
addRules(initialCreativeRules);

// u<a4
try {
    const u = sys.getD(parser.parse("u<a4", 'dname'));
    console.log("u<a4 模板:", u.toString());
    console.log("  assertions:", u.assertions.map(a => AtomSolver.print(a)).join(" | "));
    console.log("  conditions:", u.conditions.map(c => c.toString()).join(" | "));
    console.log("  conclusion:", u.conclusion.toString());
    console.log("  step 条数:", u.step?.length);
    if (u.step) {
        for (const sp of u.step) console.log("    step:", sp.getCmd());
    }
    // 应用
    sys.clear();
    sys.hyp(parser.parse("#nf($0,x)", 'wff'));
    sys.hyp(parser.parse("∀x:$0", 'wff'));
    const r = sys.d(u, [sys.getP("2")], { $a: parser.parse("y", 'item') });
    console.log("应用结果:", r.ast.toString());
    sys.expand(r);
    console.log("expand 后:");
    for (const p of sys.props) console.log("  ", p.ast.toString(), "[" + p.from.type + "]");
} catch (e) {
    console.log("u<a4 异常:", JSON.stringify(e));
}

// 组合 v<a4(<a6) 对照
try {
    const combo = sys.getD(parser.parse("v<a4(<a6)", 'dname'));
    console.log("\nv<a4(<a6) 模板:", combo.toString());
    console.log("  assertions:", combo.assertions.map(a => AtomSolver.print(a)).join(" | "));
} catch (e) {
    console.log("v<a4(<a6) 异常:", JSON.stringify(e));
}
