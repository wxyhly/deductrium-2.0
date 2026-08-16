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

// ===== test 1: f-folder 肢解 =====
console.log("===== test 1: f 文件夹肢解 =====");
sys.clear();
sys.hyp(parser.parse("A", 'wff')); // 1
const ff = sys.f(new AST(NodeType.ATOM_ITEM, "folder1"));
const fi = sys.d(getD(".i"), [], { $: parser.parse("A", 'wff') }); // A→A
console.log(" f folder contents:");
dump(sys.props);
sys.pop();
console.log(" root:");
dump(sys.props);
sys.expand(ff);
console.log(" after f expand:");
dump(sys.props);
ok(sys.props.length === 3, "f肢解后3个props（无文件夹）");

// ===== test 2: c-folder 肢解（用户场景：cond A，内含 a1 + mp 3 1） =====
console.log("===== test 2: c 文件夹肢解 =====");
sys.clear();
sys.hyp(parser.parse("A", 'wff'));          // 1 外面
const cf = sys.c(parser.parse("A", 'wff')); // 2 cond A
const p3 = sys.d(getD("a1"), [], { $1: parser.parse("A", 'wff'), $2: parser.parse("B", 'wff') }); // 3: A→B→A
const p4 = sys.d(getD("mp"), [p3, sys.getP("1")], {}); // 4: B→A
console.log(" before:");
dump(sys.props);
sys.expand(cf);
console.log(" after c expand:");
dump(sys.props);
ok(sys.props.length === 4, "c肢解后4个props");
// 期望：[1: A, 2: A→(A→B→A) (ca1), 3: A→(B→A) (cmp(#,<a1) 2 1)]
const e2 = sys.getP("2");
const e3 = sys.getP("3");
ok(e2.ast.toString() === "A→A→B→A" && e2.from.type === "d" && e2.from.data.deduction.toString() === "c:a1", "e2 = ca1 → A→A→B→A");
ok(e3.ast.toString() === "A→B→A" && e3.from.type === "d" && e3.from.data.deduction.toString() === "c:mp(#,<a1)", "e3 = cmp(#,<a1) → A→B→A");
ok(e3.from.data.conditions.map(c => c.id).join(",") === "2,1", "e3 conds = [2, 1]");

// ===== test 3: c-folder 肢解后，外部依赖自动修复 =====
console.log("===== test 3: c肢解后外部依赖 =====");
// 场景：cond A 内 B，之后 mp (cond A 内 B) A → 期望在肢解后仍有效
sys.clear();
sys.hyp(parser.parse("A", 'wff')); // 1
const cf2 = sys.c(parser.parse("A", 'wff')); // 2
const inside = sys.d(getD("a1"), [], { $1: parser.parse("A", 'wff'), $2: parser.parse("B", 'wff') }); // 3: A→B→A
sys.pop();
const after = sys.d(getD("mp"), [cf2, sys.getP("1")], {}); // 4: mp 2 1 — 使用cond文件夹作为条件 → A→(B→A)
console.log(" before:");
dump(sys.props);
sys.expand(cf2);
console.log(" after:");
dump(sys.props);
const last4 = sys.props[sys.props.length - 1];
ok(last4.ast.toString() === "B→A", "外部mp结果正确 (A→(A→B→A) 与 A → B→A)");

// ===== test 4: v-folder 肢解 =====
console.log("===== test 4: v 文件夹肢解 =====");
sys.clear();
sys.hyp(parser.parse("A", 'wff')); // 1
const vf = sys.v(parser.parse("x", 'item')); // 2 var x
const v3 = sys.d(getD("a1"), [], { $1: parser.parse("A", 'wff'), $2: parser.parse("B", 'wff') }); // 3: A→B→A
const v4 = sys.d(getD("mp"), [v3, sys.getP("1")], {}); // 4: B→A
console.log(" before:");
dump(sys.props);
sys.expand(vf);
console.log(" after v expand:");
dump(sys.props);
const ve2 = sys.getP("2");
const ve3 = sys.getP("3");
ok(ve2.ast.toString() === "∀x:A→B→A" && ve2.from.data.deduction.toString() === "v:a1", "ve2 = va1 → ∀x:A→B→A");
ok(ve3.ast.toString() === "∀x:B→A" && ve3.from.data.deduction.toString() === "v:mp(#,<a6)", "ve3 = vmp(#,<a6) → ∀x:B→A");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
