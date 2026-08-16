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
        console.log(indent + p.id + ":" + p.ast.toString() + "[" + p.from.type + "]" + extra);
        if (p.children) dump(p.children, indent + "  ");
    }
};
const getD = (s) => sys.getD(parser.parse(s, 'dname'));
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("[ok] " + msg); } else { fail++; console.log("[NO] " + msg); } };

// ===== test 1: mp(a1,#) = "$a ⊢ $b→$a" =====
console.log("===== test 1: mp(a1,#) =====");
const d1 = getD("mp(a1,#)");
console.log("  rule:", d1.toString(), "| conditions:", d1.conditions.length, "| replaceNames:", JSON.stringify(d1.replaceNames));
ok(d1.conditions.length === 1, "mp(a1,#) 有1个条件");
ok(d1.step?.length === 3, "mp(a1,#) 有3步step (hyp, d a1, d mp)");
sys.clear();
sys.hyp(parser.parse("A", 'wff')); // 1
const p1 = sys.d(d1, [sys.getP("1")], { [d1.replaceNames[0][0]]: parser.parse("B", 'wff') });
console.log("  applied:", p1.ast.toString());
ok(p1.ast.toString() === "B→A", "mp(a1,#) A B ⊢ B→A");

// ===== test 2: mp(.i,#) = "$a ⊢ $a" identity =====
console.log("===== test 2: mp(.i,#) =====");
const d2 = getD("mp(.i,#)");
console.log("  rule:", d2.toString());
ok(d2.conditions.length === 1 && d2.conclusion.toString() === d2.conditions[0].toString(), "mp(.i,#) 是恒等规则 $a ⊢ $a");
sys.clear();
sys.hyp(parser.parse("A→A", 'wff'));
const p2 = sys.d(d2, [sys.getP("1")], {});
ok(p2.ast.toString() === "A→A", "mp(.i,#) (A→A) ⊢ A→A");

// ===== test 3: d mp(a1,#) via fromCmd =====
console.log("===== test 3: fromCmd d mp(a1,#) 1 B =====");
sys.clear();
sys.hyp(parser.parse("A", 'wff'));
const cmds = parser.parse("d mp(a1,#) 1 B", 'cmd');
console.log("  cmd dname:", cmds.nodes[0].toString());
sys.fromCmd([cmds]);
const p3 = sys.getP("2");
console.log("  result:", p3.ast.toString());
ok(p3.ast.toString() === "B→A", "fromCmd 应用组合规则得到 B→A");

// ===== test 4: expand 肢解组合规则 =====
console.log("===== test 4: expand 肢解 =====");
console.log("  before:");
dump(sys.props);
sys.expand(p3);
console.log("  after:");
dump(sys.props);
const last = sys.getP(String(sys.props.length));
ok(last.ast.toString() === "B→A", "展开后的结论是 B→A");
ok(last === p3, "结论步骤复用了p3对象");
// 组合步骤：a1给出 A→(B→A)，mp(a1结果, 原条件A) 推出 B→A；#位置条件映射到已有hyp，不再新增
ok(sys.props.length === 3, "展开后共3个props (hyp A, d a1, d mp)");
const step2 = sys.getP("2");
const step3 = sys.getP("3");
ok(step2.ast.toString() === "A→(B→A)" && step2.from.type === "d" && step2.from.data.deduction.toString() === "a1", "step2 是 d a1 得到 A→(B→A)");
ok(step3.ast.toString() === "B→A" && step3.from.type === "d" && step3.from.data.deduction.toString() === "mp", "step3 是 d mp 得到 B→A");

// ===== test 5: 嵌套组合 mp(a1, mp(a1,#)) =====
console.log("===== test 5: 嵌套组合 =====");
const d5 = getD("mp(a1,mp(a1,#))");
console.log("  rule:", d5.toString(), "| conditions:", d5.conditions.length);
ok(d5.conditions.length === 1, "嵌套组合有1个条件");
sys.clear();
sys.hyp(parser.parse("A", 'wff'));
const p5 = sys.d(d5, [sys.getP("1")], Object.fromEntries(d5.replaceNames.map(([n], i) => [n, parser.parse(["B", "C"][i] ?? "D", 'wff')])));
console.log("  applied:", p5.ast.toString());
ok(p5.ast.toString() === "B→(C→A)", "嵌套组合 A B C ⊢ B→(C→A)");

// ===== test 6: 以宏规则为函数 .t(a1,#) =====
console.log("===== test 6: .t(a1,#) =====");
const d6 = getD(".t(a1,#)");
console.log("  rule:", d6.toString());
ok(d6.conditions.length === 1, ".t(a1,#) 有1个条件");
sys.clear();
sys.hyp(parser.parse("A→A", 'wff')); // 1
const p6 = sys.d(d6, [sys.getP("1")], Object.fromEntries(d6.replaceNames.map(([n], i) => [n, parser.parse(["B", "C"][i] ?? "D", 'wff')])));
console.log("  applied:", p6.ast.toString());
// .t(a1,#): a1结论 $1'→($2'→$1') 匹配 .t 条件1 $1→$2；条件2=$2→$3 保留，结论 $1→$3
// => ($2'→$1')→$3 ⊢ $1'→$3。代入 $1':=B→B, $3:=C → 条件 (($2')→(B→B))→C
ok(p6.ast.toString() === "B→C", ".t(a1,#) 结果 B→C");
console.log("  conditions after apply:", sys.props.map(p => p.ast.toString()).join(" | "));

// ===== test 7: 错误情况 =====
console.log("===== test 7: 错误情况 =====");
try {
    getD("mp(a1,a1,a1)");
    ok(false, "参数多于条件数应报错");
} catch (e) {
    ok(true, "参数多于条件数报错: " + (e?.cause?.message || e?.cause || e));
}
try {
    getD("a1(mp)");
    ok(false, "不匹配的约束应报错");
} catch (e) {
    ok(true, "不匹配约束报错: " + (e?.cause?.message || e?.cause || e));
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
