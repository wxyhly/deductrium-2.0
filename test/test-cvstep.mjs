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

// ===== test 1: <a2 保持原 replNames =====
console.log("===== test 1: <a2 保持 $1 $2 $3 =====");
const la2 = getD("<a2");
console.log(" <a2:", la2.toString(), "| replaceNames:", JSON.stringify(la2.replaceNames), "| step:", la2.step?.length);
ok(la2.toString() === "$1→$2→$3⊢($1→$2)→$1→$3", "<a2 = $1→$2→$3 ⊢ ($1→$2)→$1→$3（不变）");
sys.clear();
sys.hyp(parser.parse("A→B→C", 'wff')); // 1
const pa2 = sys.d(la2, [sys.getP("1")], {});
console.log(" applied:", pa2.ast.toString());
ok(pa2.ast.toString() === "(A→B)→A→C", "<a2 (A→B→C) ⊢ (A→B)→A→C");

// ===== test 2: c:mp step =====
console.log("===== test 2: c:mp step =====");
const cmp = getD("c:mp");
console.log(" c:mp:", cmp.toString(), "| replaceNames:", JSON.stringify(cmp.replaceNames), "| step:", cmp.step?.length);
ok(cmp.step?.length === 5, "c:mp 有5步step");
if (cmp.step) dump(cmp.step);
sys.clear();
sys.hyp(parser.parse("A→B→C", 'wff')); // 1: $0→($1→$2)
sys.hyp(parser.parse("A→B", 'wff'));   // 2: $0→$1
const pc = sys.d(cmp, [sys.getP("1"), sys.getP("2")], {});
console.log(" applied:", pc.ast.toString());
ok(pc.ast.toString() === "A→C", "c:mp (A→B→C)(A→B) ⊢ A→C");

// ===== test 3: v:mp step =====
console.log("===== test 3: v:mp step =====");
const vmp = getD("v:mp");
console.log(" v:mp:", vmp.toString(), "| replaceNames:", JSON.stringify(vmp.replaceNames), "| step:", vmp.step?.length);
ok(vmp.step?.length === 5, "v:mp 有5步step");
sys.clear();
sys.hyp(parser.parse("∀x:(A→B)", 'wff'));  // 1
sys.hyp(parser.parse("∀x:A", 'wff'));       // 2
const pv = sys.d(vmp, [sys.getP("1"), sys.getP("2")], {});
console.log(" applied:", pv.ast.toString());
ok(pv.ast.toString() === "∀x:B", "v:mp (∀x:A→B)(∀x:A) ⊢ ∀x:B");

// ===== test 4: c:a1（公理加c）step =====
console.log("===== test 4: c:a1 step =====");
const ca1 = getD("c:a1");
console.log(" c:a1:", ca1.toString(), "| replaceNames:", JSON.stringify(ca1.replaceNames), "| step:", ca1.step?.length);
ok(ca1.step?.length === 2, "c:a1 有2步step");
if (ca1.step) dump(ca1.step);
sys.clear();
const pca = sys.d(ca1, [], { [ca1.replaceNames[0][0]]: parser.parse("A", 'wff'), $1: parser.parse("A", 'wff'), $2: parser.parse("B", 'wff') });
console.log(" applied:", pca.ast.toString());
ok(pca.ast.toString() === "A→A→B→A", "c:a1 A ⊢ A→A→B→A");

// ===== test 5: v:a1（公理加v）无 step =====
console.log("===== test 5: v:a1 无step =====");
const va1 = getD("v:a1");
console.log(" v:a1:", va1.toString(), "| step:", va1.step?.length);
ok(!va1.step?.length, "v:a1 无step（公理加v还是公理，不允许肢解）");
sys.clear();
const pva = sys.d(va1, [], { [va1.replaceNames[0][0]]: parser.parse("x", 'item'), $1: parser.parse("A", 'wff'), $2: parser.parse("B", 'wff') });
console.log(" applied:", pva.ast.toString());
ok(pva.ast.toString() === "∀x:(A→B→A)", "v:a1 A B ⊢ ∀x:(A→B→A)");
try {
    sys.expand(pva);
    ok(false, "v:a1 公理 expand 应报错");
} catch (e) {
    ok(true, "v:a1 公理 expand 报错: " + (e?.cause?.type ?? e?.type));
}

// ===== test 5b: v:.i（非公理加v）可肢解 =====
console.log("===== test 5b: v:.i step =====");
const vi = getD("v:.i");
console.log(" v:.i:", vi.toString(), "| step:", vi.step?.length);
ok(!!vi.step?.length, "v:.i 有step（非公理加v：var + 原规则step）");
if (vi.step) dump(vi.step);
sys.clear();
const pvi = sys.d(vi, [], { [vi.replaceNames[0][0]]: parser.parse("x", 'item'), $: parser.parse("A", 'wff') });
console.log(" applied:", pvi.ast.toString());
ok(pvi.ast.toString() === "∀x:(A→A)", "v:.i A ⊢ ∀x:(A→A)");
const nfvi = sys.expand(pvi);
console.log(" after expand:");
dump(sys.props);
ok(nfvi.length === 1 && sys.props.some(p => p.from.type === "v" && p.ast.toString() === "x"), "v:.i expand 产生 var x 文件夹");
const vix = sys.props.find(p => p.from.type === "v");
const vixCount = vix && vix.children ? vix.children.length : 0;
ok(!!vix && vixCount >= 3, "v:.i expand 后 var 文件夹内含原 .i 步骤（" + vixCount + " 步）");

// ===== test 6: c:t step =====
console.log("===== test 6: c:t step =====");
const ct = getD("c:.t");
console.log(" c:t:", ct.toString(), "| step:", ct.step?.length);
ok(ct.step?.length >= 3, "c:t 有step（当前实现3步）");
if (ct.step) dump(ct.step);
sys.clear();
sys.hyp(parser.parse("A→A→B", 'wff'));  // 1: $0→($1→$2)
sys.hyp(parser.parse("A→B→C", 'wff'));  // 2: $0→($2→$3)
const pct = sys.d(ct, [sys.getP("1"), sys.getP("2")], {});
console.log(" applied:", pct.ast.toString());
ok(pct.ast.toString() === "A→A→C", "c:t (A→A→B)(A→B→C) ⊢ A→A→C");

// ===== test 7: v:t step =====
console.log("===== test 7: v:t step =====");
const vt = getD("v:.t");
console.log(" v:t:", vt.toString(), "| step:", vt.step?.length);
ok(vt.step?.length >= 3, "v:t 有step（当前实现3步）");
if (vt.step) dump(vt.step);
sys.clear();
sys.hyp(parser.parse("∀x:(A→B)", 'wff')); // 1
sys.hyp(parser.parse("∀x:(B→C)", 'wff')); // 2
const pvt = sys.d(vt, [sys.getP("1"), sys.getP("2")], {});
console.log(" applied:", pvt.ast.toString());
ok(pvt.ast.toString() === "∀x:(A→C)", "v:t (∀x:A→B)(∀x:B→C) ⊢ ∀x:(A→C)");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
