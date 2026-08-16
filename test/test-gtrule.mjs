import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver } from '../js/hs/core/assert.js';

const parser = new HSParser();
const sys = new HilbertSystem();
const addRules = (data) => {
    data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//")).forEach(e => {
        const name = e.slice(0, e.indexOf(":")).trim();
        let rest = e.slice(e.indexOf(":") + 1).trim();
        let steps = "";
        if (rest.startsWith("ax:")) {
            rest = rest.slice(3);
        } else {
            steps = rest.slice(rest.indexOf(";") + 1);
            rest = rest.slice(0, rest.indexOf(";"));
        }
        const ast = parser.parse(rest, 'rule');
        const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
        ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
        const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), assertions, ast.nodes, ast.nodes.pop());
        sys.rules.set(name, rule);
        if (steps) {
            sys.fromCmd(steps.split(";").filter(e => e).map(e => parser.parse(e, "cmd")));
            rule.step = sys.props.slice(0);
            sys.clear();
        }
    });
};
addRules(`
mp:ax: $1→$2, $1 ⊢ $2;
a1:ax: ⊢$1→$2→$1;
a2:ax: ⊢($1→$2→$3)→($1→$2)→($1→$3);
.i:⊢$→$; a1 $ $; a1 $ $→$; a2 $ $→$ $; mp 3 2; mp 4 1;
.t:$1→$2,$2→$3⊢$1→$3; hyp $1→$2;hyp $2→$3;cond $1;d mp 1 3;d mp 2 4;
`);

const dump = (arr, indent = "") => {
    for (const p of arr) {
        let extra = "";
        if (p.from.type === "d") extra = " conds=" + p.from.data.conditions.map(c => c.id + ":" + c.ast.toString()).join(",") + " rv=" + JSON.stringify(Object.fromEntries(Object.entries(p.from.data.replaceValues).map(([k, v]) => [k, v.toString()])));
        if (p.from.type === "c" || p.from.type === "v") extra = " children=" + (p.children?.length ?? 0);
        console.log(indent + p.id + ":" + p.ast.toString() + "[" + p.from.type + "]" + extra);
        if (p.children) dump(p.children, indent + "  ");
    }
};
const getD = (s) => sys.getD(parser.parse(s, 'dname'));
const countProps = (arr) => arr.reduce((n, p) => n + 1 + (p.children ? countProps(p.children) : 0), 0);
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("[ok] " + msg); } else { fail++; console.log("[NO] " + msg); } };

// ===== test 1: >.t 规则形状 =====
console.log("===== test 1: >.t 形状 =====");
const gt = getD(">.t");
console.log(" >.t:", gt.toString(), "| replaceNames:", JSON.stringify(gt.replaceNames), "| step:", gt.step ? countProps(gt.step) : 0);
ok(gt.toString() === "$1→$2⊢($2→$3)→$1→$3", ">.t = $1→$2 ⊢ ($2→$3)→($1→$3)");
ok(gt.step && countProps(gt.step) === 5, ">.t 共5个prop");
if (gt.step) dump(gt.step);

// ===== test 2: >.t 应用 =====
console.log("===== test 2: >.t 应用 =====");
sys.clear();
sys.hyp(parser.parse("A→B", 'wff')); // 1
const pgt = sys.d(gt, [sys.getP("1")], { $3: parser.parse("C", 'wff') });
console.log(" applied:", pgt.ast.toString());
ok(pgt.ast.toString() === "(B→C)→A→C", ">.t (A→B) ⊢ (B→C)→(A→C)");

// ===== test 3: >.t expand =====
console.log("===== test 3: >.t expand =====");
const nf = sys.expand(pgt);
console.log(" after expand:");
dump(sys.props);
ok(nf.length === 2, "expand 返回2个新文件夹（外层cond B→C + 内层cond A）");
const c1 = sys.props[2];
ok(c1.from.type === "c" && c1.ast.toString() === "B→C", "3号 = cond (B→C)");
ok(c1.children && c1.children[0].from.type === "c" && c1.children[0].ast.toString() === "A", "内层 cond A");
// 结论在内层cond（c1.children[0]）的最后：内层capture后应为 A→C
const innerChildren = c1.children[0].children || [];
const innerLast = innerChildren[innerChildren.length - 1];
ok(innerLast && innerLast.ast.toString() === "C", "内层结论 C（capture上cond A后为 A→C）");

// ===== test 4: >mp 特殊处理（原子规则也有step） =====
console.log("===== test 4: >mp 特殊处理 =====");
const gmp = getD(">mp");
console.log(" >mp:", gmp.toString(), "| step:", gmp.step?.length);
ok(gmp.step?.length ? true : false, ">mp 有 step（原子规则特殊处理）");
ok(gmp.toString() === "$1→$2⊢$1→$2", ">mp = $1→$2 ⊢ $1→$2");
// 应用 >mp 得恒等
sys.clear();
sys.hyp(parser.parse("A→B", 'wff'));
const pmp = sys.d(gmp, [sys.getP("1")], {});
ok(pmp.ast.toString() === "A→B", ">mp (A→B) ⊢ A→B");

// ===== test 5: >a1 无条件报错 =====
console.log("===== test 5: >a1 无条件报错 =====");
try {
    getD(">a1");
    ok(false, ">a1 应报错");
} catch (e) {
    ok(true, ">a1 报错: " + JSON.stringify(e?.cause || e));
}

// ===== test 6: >.t 肢解后 后续引用 =====
console.log("===== test 6: >.t 肢解后外部依赖 =====");
sys.clear();
sys.hyp(parser.parse("A→B", 'wff')); // 1
const p6 = sys.d(gt, [sys.getP("1")], {}); // 2: (B→C)→(A→C)
sys.hyp(parser.parse("B→C", 'wff'));  // 3
const after = sys.d(getD("mp"), [p6, sys.getP("3")], {}); // 4: A→C
console.log(" before:");
dump(sys.props);
sys.expand(p6);
console.log(" after:");
dump(sys.props);
ok(sys.props[5].ast.toString() === "A→C", "外部mp结果正确 (B→C)→(A→C) 与 (B→C) → A→C");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
