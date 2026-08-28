// u:xx 元规则测试（只给结论加全称量词，条件要求 replvar 不自由出现新变量）
// u.t = #nf($1,$a),#nf($2,$a),#nf($3,$a),$1→$2,$2→$3 ⊢ ∀$a:($1→$3)
// 步骤：<a6 给每个条件加量词（断言自动蕴含）+ 应用 v:t
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver } from '../js/hs/core/assert.js';
import { LangMgr } from '../js/lang.js';
import { initialCreativeRules, initialSurvivalRules } from '../js/hs/core/initial.js';

const parser = new HSParser();
const sys = new HilbertSystem();
const addRules = (data) => {
    data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//") && !e.trim().startsWith("{") && !e.trim().startsWith("}")).forEach(e => {
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
            try {
                for (const n of rule.assertions) sys.fromCmd([parser.parse("hyp " + AtomSolver.print(n), "cmd")]);
                for (const n of rule.conditions) sys.fromCmd([parser.parse("hyp " + n, "cmd")]);
                sys.fromCmd(steps.split(";").filter(e => e).map(e => parser.parse(e, "cmd")));
                rule.step = sys.props.slice(0);
            } catch (e) {
                console.log(`规则 ${name} 加载失败:`, JSON.stringify(e));
            } finally {
                sys.clear();
            }
        }
    });
};
addRules(initialCreativeRules);
addRules(initialSurvivalRules);

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log(`[ok] ${name}`); } else { failed++; console.log(`[FAIL] ${name}`); } };
const dump = (arr, indent = "") => {
    for (const p of arr) {
        let extra = "";
        if (p.from.type === "d") extra = " conds=" + p.from.data.conditions.map(c => c.id + ":" + c.ast.toString()).join(",");
        console.log(indent + p.id + ":" + p.ast.toString() + "[" + p.from.type + "]" + extra);
        if (p.children) dump(p.children, indent + "  ");
    }
};

// ===== test 1: u.t 规则生成（断言/条件/结论）=====
try {
    const u = sys.getD(parser.parse("u.t", 'dname'));
    ok(u.conditions.length === 2 && u.conditions[0].toString() === "$1→$2" && u.conditions[1].toString() === "$2→$3", "u.t 条件保持原样");
    ok(u.conclusion.toString() === "∀$a:($1→$3)", "u.t 结论加量词 ∀$a:($1→$3)");
    const nfNames = u.assertions.filter(a => a.type === "nf").map(a => a.name).sort();
    ok(nfNames.join(",") === "$1,$2,$3", `u.t 新增 nf 断言覆盖每个条件 replvar（$1,$2,$3），实际 ${nfNames.join(",")}`);
    ok(u.assertions.every(a => a.type === "nf" && a.vs.has("$a")), "u.t 断言均为 #nf(x,$a)");
    ok(u.step?.length === 8, `u.t step 8 条（3断言+2条件+2<a6+v.t），实际 ${u.step?.length}`);
    const cmds = u.step.map(sp => sp.getCmd());
    ok(cmds[5] === "<a6 4 $a" && cmds[6] === "<a6 5 $a" && cmds[7] === "v.t 6 7", `u.t 步骤尾部 <a6,<a6,v.t，实际 ${cmds.slice(5).join(" | ")}`);
} catch (e) { ok(false, `test1 异常: ${JSON.stringify(e)}`); }

// ===== test 2: u.t 应用（replvar 条件 + 显式断言）=====
sys.clear();
try {
    sys.hyp(parser.parse("#nf($0,x)", 'wff'));
    sys.hyp(parser.parse("#nf($1,x)", 'wff'));
    sys.hyp(parser.parse("#nf($2,x)", 'wff'));
    sys.hyp(parser.parse("$0→$1", 'wff'));
    sys.hyp(parser.parse("$1→$2", 'wff'));
    const u = sys.getD(parser.parse("u.t", 'dname'));
    const r = sys.d(u, [sys.getP("4"), sys.getP("5")], { $a: parser.parse("x", 'item') });
    ok(r.ast.toString() === "∀x:($0→$2)", `u.t 应用得 ∀x:($0→$2)，实际 ${r.ast}`);
    const flat = [];
    const iter = (arr) => { for (const sp of arr) { flat.push(sp); if (sp.children) iter(sp.children); } };
    sys.expand(r);
    iter(sys.props);
    const asts = flat.map(p => p.ast.toString());
    ok(asts.length === 8, `expand 后 8 props（3断言+2hyp+2<a6+v.t），实际 ${asts.length}`);
    ok(asts[5] === "∀x:($0→$1)", `step6 = <a6 得 ∀x:($0→$1)`);
    ok(asts[6] === "∀x:($1→$2)", `step7 = <a6 得 ∀x:($1→$2)`);
    ok(asts[7] === "∀x:($0→$2)", `step8 = v.t 得 ∀x:($0→$2)`);
} catch (e) { ok(false, `test2 异常: ${JSON.stringify(e)}`); }

// ===== test 3: u.t 应用（常量条件，断言恒真无需手动添加）=====
sys.clear();
try {
    sys.hyp(parser.parse("A→B", 'wff'));
    sys.hyp(parser.parse("B→C", 'wff'));
    const u = sys.getD(parser.parse("u.t", 'dname'));
    const r = sys.d(u, [sys.getP("1"), sys.getP("2")], { $a: parser.parse("x", 'item') });
    ok(r.ast.toString() === "∀x:(A→C)", `常量条件应用得 ∀x:(A→C)`);
    sys.expand(r);
    ok(sys.props.length === 5, `expand 后 5 props（2hyp+2<a6+v.t），实际 ${sys.props.length}`);
    ok(sys.props[2].ast.toString() === "∀x:(A→B)" && sys.props[3].ast.toString() === "∀x:(B→C)" && sys.props[4].ast.toString() === "∀x:(A→C)", "expand 步骤正确");
} catch (e) { ok(false, `test3 异常: ${JSON.stringify(e)}`); }

// ===== test 4: 嵌套肢解（v.t 步骤再 expand 出 var 文件夹）=====
sys.clear();
try {
    sys.hyp(parser.parse("#nf($0,x)", 'wff'));
    sys.hyp(parser.parse("#nf($1,x)", 'wff'));
    sys.hyp(parser.parse("#nf($2,x)", 'wff'));
    sys.hyp(parser.parse("$0→$1", 'wff'));
    sys.hyp(parser.parse("$1→$2", 'wff'));
    const u = sys.getD(parser.parse("u.t", 'dname'));
    const r = sys.d(u, [sys.getP("4"), sys.getP("5")], { $a: parser.parse("x", 'item') });
    sys.expand(r);
    const last = sys.props[sys.props.length - 1];
    sys.expand(last);
    const last2 = sys.props[sys.props.length - 1];
    ok(last2.from.type === "v" && last2.ast.name === "x", "v.t 步骤 expand 出 var x 文件夹");
    ok(last2.children?.length === 3, `var 文件夹内含 3 步（<a4去量词×2 + 原规则），实际 ${last2.children?.length}`);
} catch (e) { ok(false, `test4 异常: ${JSON.stringify(e)}`); }

// ===== test 5: u:mp 应用 + expand =====
sys.clear();
try {
    const u = sys.getD(parser.parse("u:mp", 'dname'));
    ok(u.toString() === "#nf($1,$a),#nf($2,$a),$1→$2,$1⊢∀$a:$2", `u:mp 生成 ${u}`);
    sys.hyp(parser.parse("A→B", 'wff'));
    sys.hyp(parser.parse("A", 'wff'));
    const r = sys.d(u, [sys.getP("1"), sys.getP("2")], { $a: parser.parse("x", 'item') });
    ok(r.ast.toString() === "∀x:B", `u:mp 应用得 ∀x:B`);
    sys.expand(r);
    ok(sys.props.length === 5, `u:mp expand 后 5 props（2hyp+2<a6+v.t），实际 ${sys.props.length}`);
} catch (e) { ok(false, `test5 异常: ${JSON.stringify(e)}`); }

// ===== test 6: 断言缺失报错 =====
sys.clear();
try {
    sys.hyp(parser.parse("#nf($0,x)", 'wff'));
    sys.hyp(parser.parse("$0→$1", 'wff'));
    sys.hyp(parser.parse("$1→$2", 'wff'));  // 缺 #nf($1,x) #nf($2,x)
    const u = sys.getD(parser.parse("u.t", 'dname'));
    sys.d(u, [sys.getP("2"), sys.getP("3")], { $a: parser.parse("x", 'item') });
    ok(false, "断言缺失应报错");
} catch (e) {
    ok(e?.type === "deductFail", `断言缺失报 deductFail，实际 ${e?.type}`);
}

// ===== test 7: 无条件规则禁止 u =====
try {
    sys.getD(parser.parse("u:a1", 'dname'));
    ok(false, "无条件规则 u:a1 应报错");
} catch (e) {
    ok(e?.type === "uNeedCond", `u:a1 报 uNeedCond，实际 ${e?.type}`);
    const zh = LangMgr.renderHSError(e);
    ok(zh.includes("u:元规则") && zh.includes("v:元规则"), "uNeedCond 中文翻译含 v:元规则提示");
}

// ===== test 8: 往返（genCmd/fromCmd）=====
sys.clear();
try {
    sys.hyp(parser.parse("#nf($0,x)", 'wff'));
    sys.hyp(parser.parse("#nf($1,x)", 'wff'));
    sys.hyp(parser.parse("#nf($2,x)", 'wff'));
    sys.hyp(parser.parse("$0→$1", 'wff'));
    sys.hyp(parser.parse("$1→$2", 'wff'));
    const u = sys.getD(parser.parse("u.t", 'dname'));
    const r = sys.d(u, [sys.getP("4"), sys.getP("5")], { $a: parser.parse("x", 'item') });
    const cmds = sys.genCmd();
    const last = cmds[cmds.length - 1];
    ok(last === "u.t 4 5 x", `u.t 应用序列化为 "u.t 4 5 x"，实际 "${last}"`);
    const asts = cmds.map(c => parser.parse(c, "cmd"));
    sys.clear();
    sys.fromCmd(asts);
    sys.updatePropIdx();
    const lastP = sys.props[sys.props.length - 1];
    ok(lastP.ast.toString() === "∀x:($0→$2)", "往返后结论正确");
    sys.expand(lastP);
    ok(sys.props[sys.props.length - 1].ast.toString() === "∀x:($0→$2)", "往返后 expand 成功");
} catch (e) { ok(false, `test8 异常: ${JSON.stringify(e)}`); }

console.log(`===== ${passed} passed, ${failed} failed =====`);
process.exit(failed ? 1 : 0);
