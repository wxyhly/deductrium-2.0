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
        if (rest.startsWith("ax:")) { rest = rest.slice(3); }
        else { steps = rest.slice(rest.indexOf(";") + 1); rest = rest.slice(0, rest.indexOf(";")); }
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

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log(`[ok] ${name}`); } else { failed++; console.log(`[FAIL] ${name}`); } };

// ===== 场景：cond 内嵌 cond（c 内嵌 c），肢解外层应报错 =====
console.log("===== test 1: cond 内嵌 cond 肢解报错 =====");
sys.clear();
sys.hyp(parser.parse("A", 'wff')); // 1
const c1 = sys.c(parser.parse("A", 'wff')); // 2 (cond A)
const c2 = sys.c(parser.parse("B", 'wff')); // 3 (cond B，内嵌在c1内)
let threw = false;
try {
    sys.expand(c1);
} catch (e) {
    threw = true;
    const info = e?.type === "expandFail" ? e.cause : e;
    console.log("  错误:", JSON.stringify(info));
    ok(info?.type === "nestedCVFolder", "肢解含嵌套cond的文件夹抛 nestedCVFolder");
}
if (!threw) ok(false, "肢解含嵌套cond的文件夹应报错");

// ===== 场景2: var 内嵌 var 肢解报错 =====
console.log("===== test 2: var 内嵌 var 肢解报错 =====");
sys.clear();
const v1 = sys.v(parser.parse("x", 'item')); // var x
const v2 = sys.v(parser.parse("y", 'item')); // var y（内嵌）
threw = false;
try {
    sys.expand(v1);
} catch (e) {
    threw = true;
    const info = e?.type === "expandFail" ? e.cause : e;
    console.log("  错误:", JSON.stringify(info));
    ok(info?.type === "nestedCVFolder", "肢解含嵌套var的文件夹抛 nestedCVFolder");
}
if (!threw) ok(false, "肢解含嵌套var的文件夹应报错");

// ===== 场景3: cond 内嵌 var 也报错 =====
console.log("===== test 3: cond 内嵌 var 肢解报错 =====");
sys.clear();
const c3 = sys.c(parser.parse("A", 'wff')); // cond A
const v3 = sys.v(parser.parse("x", 'item')); // var x（内嵌）
threw = false;
try {
    sys.expand(c3);
} catch (e) {
    threw = true;
    const info = e?.type === "expandFail" ? e.cause : e;
    console.log("  错误:", JSON.stringify(info));
    ok(info?.type === "nestedCVFolder", "肢解cond内嵌var抛 nestedCVFolder");
}
if (!threw) ok(false, "肢解cond内嵌var应报错");

// ===== 场景4: f 文件夹内嵌 c 仍可肢解（f 无逻辑语义） =====
console.log("===== test 4: f 内嵌 c 肢解（f可正常肢解） =====");
sys.clear();
sys.hyp(parser.parse("A", 'wff')); // 1
const f1 = sys.f(new AST(NodeType.ATOM_ITEM, "folder1")); // 2: dir folder1
const c4 = sys.c(parser.parse("B", 'wff')); // 3: cond B（在f内）
// f 肢解：children 直接放出，c4 保留
try {
    sys.expand(f1);
    ok(true, "f 文件夹肢解成功（内嵌c保留）");
    // 验证 c4 还在
    const hasC = sys.props.some(p => p.from.type === "c");
    ok(hasC, "肢解后 cond 保留");
} catch (e) {
    ok(false, `f 文件夹肢解失败: ${JSON.stringify(e)}`);
}

console.log(`===== ${passed} passed, ${failed} failed =====`);
if (failed > 0) process.exit(1);
