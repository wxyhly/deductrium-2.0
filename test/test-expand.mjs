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
.t:$1→$2,$2→$3⊢$1→$3; hyp $1→$2;hyp $2→$3;cond $1;d mp 1 3;d mp 2 4;
.i:⊢$→$; a1 $ $; a1 $ $→$; a2 $ $→$ $; mp 3 2; mp 4 1;
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

// ===== 测试1：.t 宏规则展开 =====
console.log("===== test 1: .t expand =====");
sys.hyp(parser.parse("A→B", 'wff'));  // 1
sys.hyp(parser.parse("B→C", 'wff'));  // 2
const p3 = sys.d(sys.getD(new AST(NodeType.ATOM_DNAME, ".t")), [sys.getP("1"), sys.getP("2")], {});
console.log("before expand:");
dump(sys.props);
console.log("p3 ast:", p3.ast.toString(), "conclusion should be A→C");
sys.expand(p3);
console.log("after expand:");
dump(sys.props);
// 校验：应含 c(A) 文件夹，两个 mp 步骤，结论 C
const ids = sys.props.map(p => p.id + ":" + p.ast.toString());
console.log("ids:", ids.join(" | "));
const last = sys.props[sys.props.length - 1];
console.log("last prop ast:", last.ast.toString(), "(expect C)");

// 校验后续步骤引用（add a d step using the last prop）
const lastP = sys.getP(String(sys.props.length));
console.log("flatProps last:", sys.getP(String(sys.props.length))?.ast.toString());

// ===== 测试2：.i 宏规则展开（无条件，有replaceValues） =====
console.log("\n===== test 2: .i expand =====");
sys.clear();
sys.hyp(parser.parse("A→A", 'wff')); // 1 (unused, just to offset)
// d .i with replaceValues: $ -> D→D
const pi = sys.d(sys.getD(new AST(NodeType.ATOM_DNAME, ".i")), [], { "$": parser.parse("D→D", 'wff') });
console.log("before expand:");
dump(sys.props);
sys.expand(pi);
console.log("after expand:");
dump(sys.props);
console.log("last ast:", sys.props[sys.props.length - 1].ast.toString(), "(expect D→D)");

// ===== 测试3：展开后依赖修复 =====
console.log("\n===== test 3: relyAfter fix =====");
sys.clear();
sys.hyp(parser.parse("A→B", 'wff'));  // 1
sys.hyp(parser.parse("B→C", 'wff'));  // 2
const pt = sys.d(sys.getD(new AST(NodeType.ATOM_DNAME, ".t")), [sys.getP("1"), sys.getP("2")], {}); // 3 (A→C)
const hypA = sys.hyp(parser.parse("A", 'wff'));    // hyp 会插入到假设区，用返回值引用
// 后面的 prop 依赖 pt: mp (A→C) A ⊢ C
const pdep = sys.d(sys.getD(new AST(NodeType.ATOM_DNAME, "mp")), [pt, hypA], {}); // (C)
console.log("before expand:");
dump(sys.props);
console.log("pdep conds:", pdep.from.data.conditions.map(c => c.id + ":" + c.ast.toString()).join(", "), "ast:", pdep.ast.toString());
sys.expand(pt);
console.log("after expand:");
dump(sys.props);
console.log("pdep id now:", pdep.id, "conds:", pdep.from.data.conditions.map(c => c.id + ":" + c.ast.toString()).join(", "), "(expect last expanded prop C)");
console.log("pdep ast:", pdep.ast.toString(), "(expect C)");
console.log("ALL TESTS DONE");

// ===== 测试4：v文件夹展开 =====
console.log("\n===== test 4: v folder =====");
sys.clear();
addRules(`
.vt:⊢$1→$1; var $x; d a1 $1 $1;
`);
const pv = sys.d(sys.getD(new AST(NodeType.ATOM_DNAME, ".vt")), [], { "$1": parser.parse("A", 'wff') });
console.log("before expand:");
dump(sys.props);
console.log("pv ast:", pv.ast.toString(), "(expect A→A)");
sys.expand(pv);
console.log("after expand:");
dump(sys.props);
const v = sys.props[sys.props.length - 1];
console.log("last is v folder:", v.from.type === "v", "children:", v.children?.length, "(expect 1)");
console.log("v child ast:", v.children[0].ast.toString(), "(expect A→A→A)");

// ===== 测试5：原子规则无法展开 =====
console.log("\n===== test 5: atomic rule throws =====");
sys.clear();
const h1 = sys.hyp(parser.parse("A→B", 'wff'));
const h2 = sys.hyp(parser.parse("A", 'wff'));
const pm = sys.d(sys.getD(new AST(NodeType.ATOM_DNAME, "mp")), [h1, h2], {});
try {
    sys.expand(pm);
    console.log("FAIL: should have thrown");
} catch (e) {
    console.log("OK: throws", e.type, "rule:", e.ruleName?.toString(), "(expect atomicStep)");
}

// ===== 测试6：NODE_DNAME 暂不支持 =====
console.log("\n===== test 6: node dname throws =====");
try {
    // c:mp 条件为 [c→$1→$2, c→$1]，结论 c→$2
    const c1 = parser.parse("A→(B→C)", 'wff');
    const c2 = parser.parse("A→B", 'wff');
    const pnode = sys.d(sys.getD(parser.parse("c:mp", 'dname')), [c1, c2], {});
    console.log("node prop ast:", pnode.ast.toString(), "(expect A→C)");
    try {
        sys.expand(pnode);
        console.log("FAIL: should have thrown");
    } catch (e) {
        console.log("OK: throws", e.type, "(expect atomicStep)");
    }
} catch (e) {
    console.log("node dname apply failed:", JSON.stringify(e));
}
console.log("ALL EXTRA TESTS DONE");

// ===== 测试7：f 文件夹展开 =====
console.log("\n===== test 7: f folder =====");
sys.clear();
addRules(`
.ft:⊢$1→$1; dir inner; d a1 $1 $1;
`);
const pf = sys.d(sys.getD(new AST(NodeType.ATOM_DNAME, ".ft")), [], { "$1": parser.parse("A", 'wff') });
console.log("before expand:");
dump(sys.props);
console.log("pf ast:", pf.ast.toString(), "(expect A→A)");
sys.expand(pf);
console.log("after expand:");
dump(sys.props);
const fld = sys.props[sys.props.length - 1];
console.log("last is f folder:", fld.from.type === "f", "name:", fld.name, "(expect inner)");
console.log("f child ast:", fld.children?.[0]?.ast.toString(), "(expect A→A→A)");

// ===== 测试8：文件夹内展开（captureScope 包装） =====
console.log("\n===== test 8: expand inside c folder =====");
sys.clear();
sys.hyp(parser.parse("A→B", 'wff'));  // 1
sys.hyp(parser.parse("B→C", 'wff'));  // 2
const pc = sys.c(parser.parse("A", 'wff'));  // 3: A[c]，进入文件夹
const pt8 = sys.d(sys.getD(new AST(NodeType.ATOM_DNAME, ".t")), [sys.getP("1"), sys.getP("2")], {});
console.log("before expand:");
dump(sys.props);
console.log("pt8 ast:", pt8.ast.toString(), "(expect A→C)");
sys.expand(pt8);
console.log("after expand:");
dump(sys.props);
console.log("c folder children:", sys.props[sys.props.length - 1].children?.length, "(expect 1, the inner c folder)");
const innerC = sys.props[sys.props.length - 1].children?.[0];
console.log("inner c children:", innerC?.children?.length, "(expect 2)");
const clast = innerC?.children?.[innerC.children.length - 1];
console.log("c last child ast:", clast?.ast.toString(), "(expect C)");
console.log("ALL DONE");
