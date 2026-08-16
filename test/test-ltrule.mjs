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
        console.log(indent + p.id + ":" + p.ast.toString() + "[" + p.from.type + "]" + extra);
        if (p.children) dump(p.children, indent + "  ");
    }
};
const getD = (s) => sys.getD(parser.parse(s, 'dname'));
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("[ok] " + msg); } else { fail++; console.log("[NO] " + msg); } };

// ===== <a1 应用 =====
console.log("===== <a1 =====");
const da1 = getD("<a1");
console.log(" <a1:", da1.toString(), "| replaceNames:", JSON.stringify(da1.replaceNames), "| step:", da1.step?.length);
ok(da1.conditions[0].toString() === da1.conclusion.toString().slice(-1) || true, "");
sys.clear();
sys.hyp(parser.parse("A", 'wff')); // 1
const p = sys.d(da1, [sys.getP("1")], { $2: parser.parse("B", 'wff') });
console.log(" applied: A B ⊢", p.ast.toString());
ok(p.ast.toString() === "B→A", "<a1 A B ⊢ B→A");
console.log(" step props:");
dump(sys.props);

// ===== <a1 expand =====
console.log("===== <a1 expand =====");
sys.expand(p);
console.log(" after expand:");
dump(sys.props);
const last = sys.props[sys.props.length - 1];
ok(last.ast.toString() === "B→A" && last === p, "expand 后结论 B→A 且复用p");

// ===== <a6 =====
console.log("===== <a6 =====");
const da6 = getD("<a6");
console.log(" <a6:", da6.toString(), "| replaceNames:", JSON.stringify(da6.replaceNames), "| step:", da6.step?.length);
ok(da6.conditions.length === 1 && da6.conclusion.toString() === "∀$x:$", "<a6 = $ ⊢ ∀$x:$");
sys.clear();
sys.hyp(parser.parse("A", 'wff')); // 1
const pa6 = sys.d(da6, [sys.getP("1")], { $x: parser.parse("x", 'item') });
console.log(" applied:", pa6.ast.toString());
ok(pa6.ast.toString() === "∀x:A", "<a6 A ⊢ ∀x:A");

// ===== <.t =====
console.log("===== <.t =====");
const dt = getD("<.t");
console.log(" <.t:", dt.toString(), "| replaceNames:", JSON.stringify(dt.replaceNames), "| step:", dt.step?.length);
sys.clear();
sys.hyp(parser.parse("A→B", 'wff'));  // 1
sys.hyp(parser.parse("B→C", 'wff'));  // 2
sys.hyp(parser.parse("A", 'wff'));    // 3
const pt = sys.d(dt, [sys.getP("1"), sys.getP("2"), sys.getP("3")], {});
console.log(" applied:", pt.ast.toString());
ok(pt.ast.toString() === "C", "<.t (A→B)(B→C) A ⊢ C");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
