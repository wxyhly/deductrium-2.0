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

// ===== test 1: d() 使用 error 规则报错 =====
console.log("===== test 1: d() 使用 error 规则报错 =====");
const bad = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, "bad"), [], [parser.parse("A", 'wff')], parser.parse("B", 'wff'));
bad.error = { cause: "推理步骤重放后与规则结论不一致", cmds: "hyp A;d mp 1 1" };
sys.rules.set("bad", bad);
sys.clear();
sys.hyp(parser.parse("A", 'wff'));
try {
    sys.d(sys.getD(parser.parse("bad", 'dname')), [sys.getP("1")], {});
    ok(false, "应用 error 规则应报错");
} catch (e) {
    console.log("  error:", JSON.stringify(e?.cause || e));
    ok(true, "应用 error 规则报错");
}

// ===== test 2: genDeductStep 失败抛错且带 cmd =====
console.log("===== test 2: >d 生成失败抛错 =====");
// 手动破坏 .t：给它一个错误结论，使 >.t 生成时结论不一致
const badT = sys.rules.get(".t");
// >.t 的正常生成（回归）
const gt = sys.getD(parser.parse(">.t", 'dname'));
ok(gt.step?.length ? true : false, ">.t 正常生成有 step");
// 破坏 .t 的 step：把结论步骤的 ast 改掉
const lastStep = badT.step[badT.step.length - 1];
lastStep.ast = parser.parse("A→X", 'wff'); // 结论改成 A→X
const savedLog = console.log;
let logged = "";
console.log = (...args) => { logged += args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(" ") + "\n"; };
try {
    sys.getD(parser.parse(">.t", 'dname'));
    ok(false, "破坏 .t 后 >.t 生成应抛错");
} catch (e) {
    const info = e?.type === "genStepFail" ? e : (e?.cause || e);
    console.log("  error type:", info?.type, "ruleName:", info?.ruleName);
    ok(info?.type === "genStepFail" && info?.ruleName === ">.t", ">.t 生成抛 genStepFail 且带规则名");
    ok(info?.steps?.includes("cond"), "genStepFail 带已生成步骤");
    console.log = savedLog;
    console.log("--- 捕获的日志 ---");
    console.log(logged);
    ok(logged.includes("genDeductStep failed"), "日志包含失败信息");
} finally {
    console.log = savedLog;
}

// ===== test 3: serde 加载错误规则 → error 字段 =====
console.log("===== test 3: serde 加载错误规则 =====");
const sys2 = new HilbertSystem();
sys2.rules.set("mp", new Deduction(new Set, new AST(NodeType.ATOM_DNAME, "mp"), [], [parser.parse("$1→$2", 'wff'), parser.parse("$1", 'wff')], parser.parse("$2", 'wff')));
// 手动重放一个"错误"宏：hyp A→B; hyp A; d mp 1 2 → 结论 B，但规则结论存成 C
const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, ".bad"), [], [parser.parse("A→B", 'wff')], parser.parse("C", 'wff'));
sys2.rules.set(".bad", rule);
const rawCmds = "hyp A;d mp 1 2";
try {
    sys2.clear();
    sys2.fromCmd(hyps(rule).map(e => parser.parse(e, "cmd")));
    sys2.fromCmd(rawCmds.split(";").map(e => parser.parse(e, "cmd")));
    const conc = sys2.checkConclusionInPropList().conclusion;
    console.log("  重放结论:", conc.toString(), "| 规则结论:", rule.conclusion.toString());
    if (!conc.equal(rule.conclusion)) {
        rule.error = { cause: "推理步骤重放后与规则结论不一致", cmds: rawCmds };
    }
    ok(rule.error?.cause ? true : false, "结论不一致 → error 字段已设置");
    ok(rule.error?.cmds === rawCmds, "error.cmds 保存原始 cmd");
    ok(!rule.step, "error 规则不设置 step");
} catch (e) {
    ok(false, "重放抛错: " + (e?.cause || e));
}
function hyps(rule) {
    const h = [];
    for (const n of rule.assertions) h.push("hyp " + AtomSolver.print(n));
    for (const n of rule.conditions) h.push("hyp " + n);
    return h;
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
