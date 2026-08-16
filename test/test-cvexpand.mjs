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
a4:ax: ⊢∀$x:$0→#sb($0,$x,$A);
a5:ax: ⊢∀$x:($1→$2)→∀$x:$1→∀$x:$2;
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

// ===== test 1: expand c:mp =====
console.log("===== test 1: expand c:mp =====");
sys.clear();
sys.hyp(parser.parse("A→B→C", 'wff')); // 1
sys.hyp(parser.parse("A→B", 'wff'));   // 2
const pc = sys.d(getD("c:mp"), [sys.getP("1"), sys.getP("2")], {});
console.log(" before:");
dump(sys.props);
const nf = sys.expand(pc);
console.log(" after:");
dump(sys.props);
ok(sys.props.length === 5, "expand后5个props");
ok(sys.props[4].ast.toString() === "A→C", "结论 A→C");
ok(nf.length === 0, "c:mp expand 无新文件夹");

// ===== test 2: expand c:a1 =====
console.log("===== test 2: expand c:a1 =====");
sys.clear();
const pca = sys.d(getD("c:a1"), [], { $0: parser.parse("A", 'wff'), $1: parser.parse("A", 'wff'), $2: parser.parse("B", 'wff') });
console.log(" before:");
dump(sys.props);
sys.expand(pca);
console.log(" after:");
dump(sys.props);
ok(sys.props.length === 3, "expand后3个props (hyp A, d a1, d <a1)");
ok(sys.props[2].ast.toString() === "A→A→B→A", "结论 A→A→B→A");

// ===== test 3: expand c:.t =====
console.log("===== test 3: expand c:.t =====");
sys.clear();
sys.hyp(parser.parse("A→A→B", 'wff')); // 1
sys.hyp(parser.parse("A→B→C", 'wff')); // 2
const pct = sys.d(getD("c:.t"), [sys.getP("1"), sys.getP("2")], {});
console.log(" before:");
dump(sys.props);
const nf3 = sys.expand(pct);
console.log(" after:");
dump(sys.props);
ok(nf3.length === 1, "expand 返回1个新文件夹(cond)");
ok(sys.props[2].from.type === "c" && sys.props[2].ast.toString() === "A", "3号 = cond A 文件夹");
ok(nf3[0] === sys.props[2], "新文件夹就是cond A");

// ===== test 4: expand v:.t =====
console.log("===== test 4: expand v:.t =====");
sys.clear();
sys.hyp(parser.parse("∀x:(A→B)", 'wff')); // 1
sys.hyp(parser.parse("∀x:(B→C)", 'wff')); // 2
const pvt = sys.d(getD("v:.t"), [sys.getP("1"), sys.getP("2")], {});
console.log(" before:");
dump(sys.props);
const nf4 = sys.expand(pvt);
console.log(" after:");
dump(sys.props);
ok(nf4.length === 1, "expand 返回1个新文件夹(var)");
ok(sys.props[2].from.type === "v" && sys.props[2].ast.toString() === "x", "3号 = var x 文件夹");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
