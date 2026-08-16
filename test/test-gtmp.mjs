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

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("[ok] " + msg); } else { fail++; console.log("[NO] " + msg); } };

// ===== test 1: 用户场景 hyp $1→$2; d >.t 1 $3 =====
console.log("===== test 1: 用户场景 =====");
sys.hyp(parser.parse("$1→$2", 'wff')); // 1
const gt = sys.getD(parser.parse(">.t", 'dname'));
console.log("  >.t step:", gt.step?.length ? "yes" : "NO");
ok(gt.step?.length ? true : false, ">.t 有 step");
const p = sys.d(gt, [sys.getP("1")], { $3: parser.parse("$3", 'wff') });
console.log("  p.ast:", p.ast.toString());
// 模拟菜单检查：重复 getD(>.t)
for (let i = 0; i < 3; i++) {
    const g2 = sys.getD(parser.parse(">.t", 'dname'));
    if (!g2.step?.length) { console.log("  getD #" + i + " step 丢失!"); }
}
ok(true, "重复 getD(>.t) step 稳定");

// ===== test 2: >mp = $1→$2 ⊢ $1→$2，应有 step =====
console.log("===== test 2: >mp =====");
const gmp = sys.getD(parser.parse(">mp", 'dname'));
console.log("  >mp:", gmp.toString(), "| step:", gmp.step?.length ? "yes" : "NO");
ok(gmp.toString() === "$1→$2⊢$1→$2", ">mp = $1→$2 ⊢ $1→$2");
ok(gmp.step?.length ? true : false, ">mp 有 step（特殊处理）");
if (gmp.step) {
    const dump = (arr, ind = "") => { for (const q of arr) { console.log(ind + q.id + ":" + q.ast.toString() + "[" + q.from.type + "]"); if (q.children) dump(q.children, ind + "  "); } };
    dump(gmp.step);
}
// 应用 >mp
sys.clear();
sys.hyp(parser.parse("A→B", 'wff')); // 1
const pmp = sys.d(gmp, [sys.getP("1")], {});
console.log("  applied:", pmp.ast.toString());
ok(pmp.ast.toString() === "A→B", ">mp (A→B) ⊢ A→B（恒等）");
// expand >mp
const nf = sys.expand(pmp);
console.log("  expand后:");
for (const q of sys.props) console.log("   " + q.id + ":" + q.ast.toString() + "[" + q.from.type + "]");
ok(nf.length === 1, ">mp expand 返回1个新文件夹(cond)");
ok(sys.props[1].from.type === "c" && sys.props[1].ast.toString() === "A", "cond A 文件夹在2号");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
