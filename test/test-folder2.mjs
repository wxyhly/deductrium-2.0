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
a6:ax: #nf($,$x) ⊢ $→∀$x:$;
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
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("[ok] " + msg); } else { fail++; console.log("[NO] " + msg); } };

// ===== test 1: 加载宏.t，肢解 cond $1（folder自身作条件 → .i提升） =====
console.log("===== test 1: .t 加载后肢解 cond $1 =====");
sys.clear();
sys.hyp(parser.parse("A→B", 'wff'));  // 1
sys.hyp(parser.parse("B→C", 'wff'));  // 2
const cf = sys.c(parser.parse("A", 'wff')); // 3: cond A
const p4 = sys.d(getD("mp"), [sys.getP("1"), cf], {}); // 4: mp 1 3 → B（条件引用folder自身）
const p5 = sys.d(getD("mp"), [sys.getP("2"), p4], {}); // 5: mp 2 4 → C
console.log(" before:");
dump(sys.props);
sys.expand(cf);
console.log(" after:");
dump(sys.props);
// 期望：[1: A→B, 2: B→C, 3: A→A (d .i A), 4: A→B (cmp(<a1,#) 1 3), 5: A→C (cmp(<a1,#) 2 4)]
const e3 = sys.getP("3");
const e4 = sys.getP("4");
const e5 = sys.getP("5");
ok(e3 && e3.ast.toString() === "A→A" && e3.from.data.deduction.toString() === ".i", "e3 = d .i A → A→A（folder自身提升）");
ok(e4 && e4.ast.toString() === "A→B" && e4.from.data.deduction.toString() === "cmp(<a1,#)", "e4 = cmp(<a1,#) 1 3 → A→B");
ok(e5 && e5.ast.toString() === "A→C" && e5.from.data.deduction.toString() === "cmp(<a1,#)", "e5 = cmp(<a1,#) 2 4 → A→C");
ok(e4.from.data.conditions.map(c => c.id).join(",") === "1,3", "e4 conds = [1, 3]（外部hyp + .i结果）");

// ===== test 2: 用户bug — hyp x=1; var y; d <a1 1 y=1; 肢解 var y =====
console.log("===== test 2: v-folder 肢解 <a1 步骤（rv键映射bug） =====");
sys.clear();
sys.hyp(parser.parse("x=1", 'wff')); // 1
const vf = sys.v(parser.parse("y", 'item')); // 2: var y
const q3 = sys.d(getD("<a1"), [sys.getP("1")], { $2: parser.parse("y=1", 'wff') }); // 3: (y=1)→(x=1)
console.log(" before:");
dump(sys.props);
try {
    sys.expand(vf);
    console.log(" after:");
    dump(sys.props);
    const ve2 = sys.getP("2");
    console.log("  ve2 deduction:", ve2?.from.data.deduction.toString());
    ok(ve2 && ve2.ast.toString() === "∀y:(y=1→x=1)", "ve2 = v:<a1(<a6) → ∀y:(y=1→x=1)");
} catch (e) {
    console.log(" ERROR:", JSON.stringify(e?.cause || e, null, 2));
    ok(false, "var y 肢解不应抛错: " + JSON.stringify(e?.cause || e));
}

// ===== test 3: 回归 — c-folder 常规肢解（外部条件 <a1 补足） =====
console.log("===== test 3: c-folder 常规肢解回归 =====");
sys.clear();
sys.hyp(parser.parse("A", 'wff'));          // 1
const cf3 = sys.c(parser.parse("A", 'wff')); // 2
const r3 = sys.d(getD("a1"), [], { $1: parser.parse("A", 'wff'), $2: parser.parse("B", 'wff') }); // 3: A→B→A
const r4 = sys.d(getD("mp"), [r3, sys.getP("1")], {}); // 4: B→A
sys.expand(cf3);
dump(sys.props);
const t2 = sys.getP("2");
const t3 = sys.getP("3");
ok(t2.ast.toString() === "A→A→B→A" && t2.from.data.deduction.toString() === "ca1", "t2 = ca1 → A→A→B→A");
ok(t3.ast.toString() === "A→B→A" && t3.from.data.deduction.toString() === "cmp(#,<a1)", "t3 = cmp(#,<a1) → A→B→A");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
