// msbt = 模板（xxx=xxx）肢解测试：
// 1. exactMatch（步骤模板，精确匹配）：a8/#sb 一次性框架替换，wrap<> 时 .=s 反向 + .<>
// 2. 非 exactMatch（规则模板）：逐点位 a8/#sb 替换，.t 串联
// 3. 嵌套匹配剔除（规则模板匹配整对时，子树点位不生成多余步骤）
// 4. genCmd→fromCmd 往返（存档/加载）
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver } from '../js/hs/core/assert.js';
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
// expand 并返回展开后的扁平步骤
const expandProps = (p) => {
    sys.expand(p);
    const flat = [];
    const iter = (arr) => { for (const sp of arr) { flat.push(sp); if (sp.children) iter(sp.children); } };
    iter(sys.props);
    return flat;
};
const flatProps = () => {
    const flat = [];
    const iter = (arr) => { for (const sp of arr) { flat.push(sp); if (sp.children) iter(sp.children); } };
    iter(sys.props);
    return flat;
};

// ===== test 1: exactMatch = 模板 wff 目标（wrap<>，用户例）=====
sys.clear();
try {
    sys.hyp(parser.parse("$1=$2", 'wff'));
    const r = sys.msbt([parser.parse("msbt>", 'dname'), parser.parse("1", 'item'), parser.parse("$1=$1", 'wff'), parser.parse("1", 'item')]);
    ok(r.ast.toString() === "$1=$1↔$2=$1", `msbt> 1 $1=$1 1 结果 $1=$1↔$2=$1`);
    const flat = expandProps(r);
    const asts = flat.map(p => p.ast.toString());
    ok(asts.length === 5, `exactMatch wrap 生成 5 步（hyp, <a8, .=s, <a8, .<>），实际 ${asts.length}`);
    ok(asts[0] === "$1=$2", `step1 = 模板hyp $1=$2`);
    ok(asts[1] === "$1=$1→$2=$1", `step2 = <a8 正向 $1=$1→$2=$1`);
    ok(asts[2] === "$2=$1", `step3 = .=s $2=$1`);
    ok(asts[3] === "$2=$1→$1=$1", `step4 = <a8 反向 $2=$1→$1=$1`);
    ok(asts[4] === "$1=$1↔$2=$1", `step5 = .<> $1=$1↔$2=$1`);
    ok(flat[0].from.type === "h", `step1 是 hyp`);
    ok(flat.slice(1).every(p => p.from.type === "d"), `其余步骤都是 d`);
} catch (e) { ok(false, `test1 异常: ${JSON.stringify(e)}`); }

// ===== test 2: exactMatch = 模板 步骤目标（不wrap，mp取替换后ast）=====
sys.clear();
try {
    sys.hyp(parser.parse("$1=$2", 'wff'));
    sys.hyp(parser.parse("$1=$1", 'wff'));
    const r = sys.msbt([parser.parse("msbt>", 'dname'), parser.parse("1", 'item'), parser.parse("2", 'item'), parser.parse("0", 'item')]);
    ok(r.ast.toString() === "$2=$2", `msbt> 1 2 0 步骤目标结果 $2=$2`);
    const flat = expandProps(r);
    const asts = flat.map(p => p.ast.toString());
    ok(asts.length === 4, `步骤目标生成 4 步（hyp模板, hyp目标, <a8, mp），实际 ${asts.length}`);
    ok(asts[2] === "$1=$1→$2=$2", `step3 = <a8 正向 $1=$1→$2=$2`);
    ok(asts[3] === "$2=$2", `step4 = mp 得 $2=$2`);
} catch (e) { ok(false, `test2 异常: ${JSON.stringify(e)}`); }

// ===== test 3: msbt< 方向（右→左）=====
sys.clear();
try {
    sys.hyp(parser.parse("$1=$2", 'wff'));
    const r = sys.msbt([parser.parse("msbt<", 'dname'), parser.parse("1", 'item'), parser.parse("$2=$2", 'wff'), parser.parse("0", 'item')]);
    ok(r.ast.toString() === "$2=$2↔$1=$1", `msbt< 1 $2=$2 0 结果 $2=$2↔$1=$1`);
    const flat = expandProps(r);
    const asts = flat.map(p => p.ast.toString());
    ok(asts.length === 5, `msbt< wrap 生成 5 步，实际 ${asts.length}`);
    ok(asts[1] === "$2=$1", `step2 = .=s 交换 $2=$1`);
    ok(asts[2] === "$2=$2→$1=$1", `step3 = <a8 正向 $2=$2→$1=$1`);
    ok(asts[3] === "$1=$1→$2=$2", `step4 = <a8 反向 $1=$1→$2=$2`);
    ok(asts[4] === "$2=$2↔$1=$1", `step5 = .<> $2=$2↔$1=$1`);
} catch (e) { ok(false, `test3 异常: ${JSON.stringify(e)}`); }

// ===== test 4: exactMatch 多位置 {1,2}（一个框架一次替换）=====
sys.clear();
try {
    sys.hyp(parser.parse("$1=$2", 'wff'));
    const r = sys.msbt([parser.parse("msbt>", 'dname'), parser.parse("1", 'item'), parser.parse("$1=$1", 'wff'), parser.parse("{1,2}", 'item')]);
    ok(r.ast.toString() === "$1=$1↔$2=$2", `msbt> 1 $1=$1 {1,2} 结果 $1=$1↔$2=$2`);
    const flat = expandProps(r);
    const asts = flat.map(p => p.ast.toString());
    ok(asts.length === 5, `多位置仍是一个框架一次替换（5步），实际 ${asts.length}`);
    ok(asts[1] === "$1=$1→$2=$2", `正向一步替换两处 $1=$1→$2=$2`);
} catch (e) { ok(false, `test4 异常: ${JSON.stringify(e)}`); }

// ===== test 5: 非 exactMatch 规则模板 wff 目标（dpair，用户例）=====
sys.clear();
try {
    const r = sys.msbt([parser.parse("msbt>(dpair)", 'dname'), parser.parse("(1,2)∈((3,2),{(ℚ,ℕ+$)})", 'wff'), parser.parse("0", 'item')]);
    const expect = "(1,2)∈((3,2),{(ℚ,ℕ+$)})↔{{1},{1,2}}∈{{(3,2)},{(3,2),{(ℚ,ℕ+$)}}}";
    ok(r.ast.toString() === expect, `msbt>(dpair) 结果正确`);
    const flat = expandProps(r);
    const asts = flat.map(p => p.ast.toString());
    ok(asts.length === 11, `dpair 生成 11 步（2点位×正向+反向+链+<>），实际 ${asts.length}`);
    ok(asts[0] === "(1,2)={{1},{1,2}}", `step1 = dpair 点位1等式`);
    ok(asts[4] === "(1,2)∈((3,2),{(ℚ,ℕ+$)})→{{1},{1,2}}∈{{(3,2)},{(3,2),{(ℚ,ℕ+$)}}}", `step5 = .t 正向链`);
    ok(asts[9] === "{{1},{1,2}}∈{{(3,2)},{(3,2),{(ℚ,ℕ+$)}}}→(1,2)∈((3,2),{(ℚ,ℕ+$)})", `step10 = .t 反向链`);
    ok(asts[10] === expect, `step11 = .<> 合成`);
} catch (e) { ok(false, `test5 异常: ${JSON.stringify(e)}`); }

// ===== test 6: 非 exactMatch 规则模板 步骤目标（不wrap）=====
sys.clear();
try {
    sys.hyp(parser.parse("(1,2)∈((3,2),{(ℚ,ℕ+$)})", 'wff'));
    const r = sys.msbt([parser.parse("msbt>(dpair)", 'dname'), parser.parse("1", 'item'), parser.parse("0", 'item')]);
    ok(r.ast.toString() === "{{1},{1,2}}∈{{(3,2)},{(3,2),{(ℚ,ℕ+$)}}}", `msbt>(dpair) 步骤目标结果正确`);
    const flat = expandProps(r);
    const last = flat[flat.length - 1];
    ok(last.ast.toString() === "{{1},{1,2}}∈{{(3,2)},{(3,2),{(ℚ,ℕ+$)}}}", `最后一步 = mp 得替换后ast`);
    ok(flat[0].from.type === "h", `step1 = 目标 hyp`);
} catch (e) { ok(false, `test6 异常: ${JSON.stringify(e)}`); }

// ===== test 7: 嵌套匹配剔除（((a,b),c) 只替换整对，不替换子树点位）=====
sys.clear();
try {
    const r = sys.msbt([parser.parse("msbt>(dpair)", 'dname'), parser.parse("((1,2),3)∈a", 'wff'), parser.parse("0", 'item')]);
    ok(r.ast.toString() === "((1,2),3)∈a↔{{(1,2)},{(1,2),3}}∈a", `嵌套目标只替换整对`);
    const flat = expandProps(r);
    const asts = flat.map(p => p.ast.toString());
    // 只有一个点位：dpair等式 + <a8正向 + .=s + <a8反向 + .<>
    ok(asts.length === 5, `嵌套剔除后只有 5 步（一个点位），实际 ${asts.length}`);
    ok(asts.every(s => !s.includes("{{1},{1,2}}")), `没有为嵌套子树 (1,2) 生成步骤`);
    ok(asts[0] === "((1,2),3)={{(1,2)},{(1,2),3}}", `step1 = 整对等式`);
} catch (e) { ok(false, `test7 异常: ${JSON.stringify(e)}`); }

// ===== test 8: genCmd→fromCmd 往返 =====
sys.clear();
try {
    sys.hyp(parser.parse("$1=$2", 'wff'));
    const r = sys.msbt([parser.parse("msbt>", 'dname'), parser.parse("1", 'item'), parser.parse("$1=$1", 'wff'), parser.parse("1", 'item')]);
    sys.expand(r);
    const cmds = sys.genCmd();
    const cmdsAst = cmds.map(c => parser.parse(c, "cmd"));
    sys.clear();
    sys.fromCmd(cmdsAst);
    sys.updatePropIdx();
    const flat = flatProps();
    ok(flat.length === 5, `往返后 props 数 5，实际 ${flat.length}`);
    ok(flat[flat.length - 1].ast.toString() === "$1=$1↔$2=$1", `往返后结论正确`);
    sys.expand(flat[flat.length - 1]);
    ok(true, `往返后再 expand 成功`);
} catch (e) { ok(false, `test8 异常: ${JSON.stringify(e)}`); }

console.log(`===== ${passed} passed, ${failed} failed =====`);
process.exit(failed ? 1 : 0);
